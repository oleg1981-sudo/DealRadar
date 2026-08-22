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
