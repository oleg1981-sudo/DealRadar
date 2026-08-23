/**
 * The TravelDeal launch announcement — the one email a `travel_signups` row
 * exists to trigger.
 *
 * Localized from the recipient's stored `locale`. The signup form sits on 13
 * translated pages, so a German signup receiving an English announcement would
 * be exactly the defect CLAUDE.md §2 describes. (The price-drop email in
 * alerts.repo.ts is still English-only for every locale — a known gap, and the
 * reason this one does not copy its shape.)
 *
 * The CTA deep-links to the travel category the person signed up from, which is
 * the whole reason `source_slug` is stored. That value is untrusted input, so it
 * is resolved against the real slug table rather than interpolated.
 */
import 'server-only';
import { getTranslations } from 'next-intl/server';
import { findTravelBySlug, travelSlug } from '../travel-categories';
import { siteUrl } from '../utils/site-url';
import { escapeHtml } from '../utils/escape-html';

/** Where the CTA lands when the stored slug is absent or no longer valid. */
const FALLBACK_SLUG = travelSlug('Cruises');

export interface LaunchEmailInput {
  locale: string;
  /** Stored, untrusted — resolved against the slug table before use. */
  sourceSlug: string | null;
  /** Absolute one-click unsubscribe URL, already HMAC-signed. */
  unsubUrl: string;
}

export interface LaunchEmail {
  subject: string;
  html: string;
}

export async function buildTravelLaunchEmail(input: LaunchEmailInput): Promise<LaunchEmail> {
  const { locale, sourceSlug, unsubUrl } = input;
  const t = await getTranslations({ locale, namespace: 'travelLaunchEmail' });

  const slug = sourceSlug && findTravelBySlug(sourceSlug) ? sourceSlug : FALLBACK_SLUG;
  const ctaUrl = `${siteUrl()}/${locale}/traveldeal/${slug}`;

  const subject = t('subject');
  const safeCta = escapeHtml(ctaUrl);
  const safeUnsub = escapeHtml(unsubUrl);

  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;color:#18181b">
  <h2 style="margin:0 0 12px">${escapeHtml(t('heading'))}</h2>
  <p style="margin:0 0 20px">${escapeHtml(t('body'))}</p>
  <p style="margin:0 0 20px"><a href="${safeCta}" style="display:inline-block;background:#EA580C;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:500">${escapeHtml(t('cta'))}</a></p>
  <p style="color:#71717a;font-size:12px;margin:0">${escapeHtml(t('footerReason'))} · <a href="${safeUnsub}" style="color:#71717a">${escapeHtml(t('unsubscribeLabel'))}</a></p>
</div>`;

  return { subject, html };
}
