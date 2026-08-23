/**
 * TravelDeal launch-notification repository — the only module that talks to the
 * `travel_signups` table. A row means "email me when this section goes live",
 * which is a one-shot announcement, not the per-product subscription that
 * `price_alerts` handles.
 *
 * Dev behaviour matches alerts.repo: with Supabase unconfigured the signup is
 * accepted and logged but not persisted, so the form works on an empty .env.
 */
import 'server-only';
import { supabase, supabaseConfigured } from './supabase';
import { sendEmail } from '../email/send';
import { buildTravelLaunchEmail } from '../email/travel-launch';
import { generateUnsubscribeToken, verifyUnsubscribeToken } from '../utils/crypto';
import { siteUrl } from '../utils/site-url';

const TABLE = 'travel_signups';

export interface TravelSignup {
  email: string;
  locale: string;
  /** Which TravelDeal category they signed up from — tells us what to build first. */
  sourceSlug: string | null;
}

export type SignupResult = 'created' | 'already_subscribed' | 'not_configured';

export async function createTravelSignup(s: TravelSignup): Promise<SignupResult> {
  if (!supabaseConfigured()) {
    console.info(`[travel-signups] would store ${s.email} (locale=${s.locale}, from=${s.sourceSlug ?? '-'}) — Supabase not configured`);
    return 'not_configured';
  }

  const { error } = await supabase()
    .from(TABLE)
    .insert({ email: s.email, locale: s.locale, source_slug: s.sourceSlug });

  if (error) {
    // 23505 = unique_violation. Signing up twice is not an error to the person
    // doing it, and telling them "already subscribed" leaks nothing they did
    // not just type themselves.
    if (error.code === '23505') return 'already_subscribed';
    throw new Error(`[travel-signups] insert failed: ${error.message}`);
  }
  return 'created';
}

/**
 * GDPR retention sweep — deletes signups past the retention window and
 * already-notified rows past a shorter window. Mirrors purgeStaleAlerts():
 * the policy lives in the SQL function so both tables state it one way.
 * Called by the scheduled retention workflow via /api/purge-alerts.
 */
export async function purgeStaleTravelSignups(retentionDays = 365, notifiedDays = 30): Promise<number> {
  if (!supabaseConfigured()) return 0;
  const { data, error } = await supabase().rpc('purge_stale_travel_signups', {
    retention_days: retentionDays,
    notified_days: notifiedDays,
  });
  if (error) throw new Error(`[travel-signups.repo] purge failed: ${error.message}`);
  return Number(data ?? 0);
}

/**
 * Token scope for launch-list unsubscribes. generateUnsubscribeToken() signs
 * `email:scope`; price alerts pass a productId there, and this vertical has no
 * product, so it passes a constant instead. Distinct from any product id, so a
 * token minted for one list can never unsubscribe the other.
 */
export const TRAVEL_LAUNCH_SCOPE = 'travel-launch';

/** Cap on rows handled in a single dispatch, so one run cannot be unbounded. */
const DEFAULT_LIMIT = 500;

export interface LaunchDispatch {
  dryRun: boolean;
  /** Pending (never-notified) rows this run considered. */
  recipients: number;
  sent: number;
  failed: number;
  byLocale: Record<string, number>;
  /** Dry runs only: one fully rendered email per distinct locale, to read. */
  samples: { locale: string; subject: string; html: string }[];
}

export function travelUnsubscribeUrl(email: string, locale: string): string {
  const token = generateUnsubscribeToken(email, TRAVEL_LAUNCH_SCOPE);
  const q = new URLSearchParams({ email, token, locale });
  return `${siteUrl()}/api/travel-notify/unsubscribe?${q.toString()}`;
}

/**
 * Send the launch announcement to everyone who asked for it, then flip their
 * row so it can never go twice — the consent collected was for ONE message.
 *
 * `notified` is flipped only after the send succeeds, so a transport failure
 * leaves the row pending for the next run rather than silently dropping a
 * person. The reverse (flip first) would lose them permanently.
 *
 * With `dryRun` nothing is sent and nothing is flipped: it reports who WOULD be
 * mailed and returns one rendered email per locale so the copy can be read
 * before any of it reaches a real inbox.
 */
export async function notifyTravelLaunch(
  opts: { dryRun?: boolean; limit?: number } = {},
): Promise<LaunchDispatch> {
  const dryRun = opts.dryRun ?? false;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : DEFAULT_LIMIT;
  const out: LaunchDispatch = {
    dryRun,
    recipients: 0,
    sent: 0,
    failed: 0,
    byLocale: {},
    samples: [],
  };
  if (!supabaseConfigured()) return out;

  const { data, error } = await supabase()
    .from(TABLE)
    .select('id, email, locale, source_slug')
    .eq('notified', false)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`[travel-signups.repo] pending query failed: ${error.message}`);

  const rows = data ?? [];
  out.recipients = rows.length;
  const sampled = new Set<string>();

  for (const row of rows) {
    const email = row.email as string;
    const locale = (row.locale as string) || 'en';
    out.byLocale[locale] = (out.byLocale[locale] ?? 0) + 1;

    const { subject, html } = await buildTravelLaunchEmail({
      locale,
      sourceSlug: (row.source_slug as string | null) ?? null,
      unsubUrl: travelUnsubscribeUrl(email, locale),
    });

    if (dryRun) {
      if (!sampled.has(locale)) {
        sampled.add(locale);
        out.samples.push({ locale, subject, html });
      }
      continue;
    }

    const ok = await sendEmail({
      to: email,
      subject,
      html,
      // RFC 8058 one-click. Not legally mandated on its own, but Gmail and
      // Yahoo require it of bulk senders, and ePrivacy Art. 13(2) requires the
      // opt-out this header exposes.
      headers: {
        'List-Unsubscribe': `<${travelUnsubscribeUrl(email, locale)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    if (ok) {
      await supabase()
        .from(TABLE)
        .update({ notified: true, notified_at: new Date().toISOString() })
        .eq('id', row.id);
      out.sent++;
    } else {
      out.failed++;
    }
  }

  return out;
}

/**
 * Verify an unsubscribe token and delete the row. Deleting rather than flagging
 * is deliberate: the person asked to be off the list, and a launch signup holds
 * nothing worth keeping once they have — which also serves GDPR Art. 17.
 * Idempotent: a valid token succeeds even if the row is already gone.
 */
export async function unsubscribeTravelSignup(email: string, token: string): Promise<boolean> {
  if (!verifyUnsubscribeToken(email, TRAVEL_LAUNCH_SCOPE, token)) return false;
  if (supabaseConfigured()) {
    const { error } = await supabase()
      .from(TABLE)
      .delete()
      .eq('email', email.toLowerCase().trim());
    if (error) console.error('[travel-signups] unsubscribe delete failed:', error.message);
  }
  return true;
}
