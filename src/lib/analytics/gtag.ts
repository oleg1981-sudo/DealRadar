/**
 * Safe wrappers around gtag.js (GA4, property G-BJEXNZXL9Q), loaded lazily by
 * the Analytics component ONLY after the `analytics` consent category is
 * granted (basic Consent Mode v2). Guarantees encoded here:
 *
 *  - No consent → gaEvent drops the event entirely (never queued, never sent).
 *  - Consent granted but tag not yet loaded (effect-ordering race on a
 *    returning visitor's landing page: TrackView effects run before the
 *    Analytics component's effect) → events buffer in a capped queue that
 *    loadGa() flushes AFTER the consent-default/config commands.
 *  - Consent revoked mid-session → the GA_DISABLE kill switch stops gtag.js
 *    transmitting anything (a loaded tag with denied consent would otherwise
 *    keep sending cookieless pings — advanced-mode behavior we must not have),
 *    and gaEvent's consent check drops app events at the source.
 */
import * as CookieConsent from 'vanilla-cookieconsent';

export const GA_ID = 'G-BJEXNZXL9Q';
const GA_DISABLE = `ga-disable-${GA_ID}`;

export type GaParams = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
  }
}

const pending: { name: string; params: GaParams }[] = [];
const PENDING_MAX = 30;

/** Stored consent read straight from the cc_cookie — the fallback for the
 *  init race: impression effects (TrackView) run BEFORE CookieConsent.run()
 *  on a fresh page load, where acceptedCategory() still returns false even
 *  for a visitor whose stored consent says granted. Without this, every
 *  full-page-load impression from consented visitors is silently dropped
 *  (the CTR denominator starves — found by live E2E, 2026-07-14). */
function cookieSaysGranted(): boolean {
  try {
    const m = document.cookie.match(/(?:^|;\s*)cc_cookie=([^;]+)/);
    if (!m) return false;
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    return Array.isArray(parsed.categories) && parsed.categories.includes('analytics');
  } catch {
    return false;
  }
}

function consentGranted(): boolean {
  try {
    return CookieConsent.acceptedCategory('analytics') || cookieSaysGranted();
  } catch {
    return cookieSaysGranted();
  }
}

/** Log a GA4 event. Drops without consent; buffers during the load race. */
export function gaEvent(name: string, params?: GaParams): void {
  try {
    if (typeof window === 'undefined' || !consentGranted()) return;
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params ?? {});
    } else if (pending.length < PENDING_MAX) {
      pending.push({ name, params: params ?? {} });
    }
  } catch {
    /* analytics must never break the app */
  }
}

/** Drain events buffered before the tag existed (called by loadGa post-config). */
export function gaFlushPending(): void {
  try {
    while (pending.length > 0 && typeof window.gtag === 'function' && consentGranted()) {
      const e = pending.shift()!;
      window.gtag('event', e.name, e.params);
    }
    pending.length = 0;
  } catch {
    /* never throw */
  }
}

/** Consent Mode v2 update + the documented measurement kill switch. */
export function gaConsentUpdate(granted: boolean): void {
  try {
    if (typeof window === 'undefined') return;
    // ga-disable-<ID> fully stops a loaded tag from transmitting — required on
    // revoke because denied consent alone still emits cookieless pings.
    window[GA_DISABLE] = !granted;
    window.gtag?.('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      // No Google Ads product in use — advertising signals stay denied
      // permanently (data minimisation; GA4 analytics works without them).
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  } catch {
    /* never throw */
  }
}
