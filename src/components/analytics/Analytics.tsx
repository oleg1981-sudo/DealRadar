'use client';

/**
 * Unified, consent-gated analytics: Microsoft Clarity + Google Analytics 4.
 *
 * GDPR posture (FR-COMP-6, strictly-EU audience): NEITHER tag is injected
 * before the visitor grants the `analytics` cookie-consent category — basic
 * Consent Mode, not advanced (advanced sends cookieless pings pre-consent,
 * which several EU DPAs treat as consent-requiring processing; the privacy
 * policy promises zero pre-consent processing). The full Consent Mode v2
 * signal sequence is still sent so Google tags behave correctly:
 * consent-default DENIED (all v2 keys) is queued before the config command,
 * then consent-update analytics_storage=granted. Ads keys stay denied
 * permanently — no Google Ads product is in use.
 *
 * Revoking consent live-stops both tools (Clarity stop + GA consent-denied)
 * and vanilla-cookieconsent's autoClear erases their first-party cookies
 * (_clck/_clsk/_ga/_ga_*). Re-granting resumes both.
 *
 * ONE delegated click listener translates declarative markup into events for
 * BOTH tools, so server components need no client wrappers:
 *   data-analytics-event   event name (fired to Clarity and GA4)
 *   data-analytics-source  attribution tag (card | pdp | …)
 *   data-analytics-item    JSON GA4 item (fires ecommerce select_item +
 *                          affiliate_click with merchant/network params)
 *
 * KPI model (affiliate feedback loop):
 *   view_item / view_item_list  impressions (TrackViewItem / TrackViewItemList)
 *   select_item + affiliate_click  the monetized outbound CTA → CTR per
 *     product, merchant, network, and placement
 *   price_alert_open / price_alert_subscribe  the alert funnel
 */
import { useEffect } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import { clarityEvent, clarityTag } from '@/lib/analytics/clarity';
import { gaEvent, gaConsentUpdate, gaFlushPending, GA_ID } from '@/lib/analytics/gtag';

const CLARITY_ID = 'xmdpyixf7i';

declare global {
  interface Window {
    __clarityLoaded?: boolean;
    __gaLoaded?: boolean;
  }
}

/** Inject the Clarity tag (idempotent) and signal cookie consent to it. */
function loadClarity(): void {
  if (window.__clarityLoaded) {
    // Re-granted after a mid-session revoke: 'stop' halts the recorder until
    // an explicit 'start' — 'consent' alone never resumes it.
    window.clarity?.('consent');
    window.clarity?.('start');
    return;
  }
  window.__clarityLoaded = true;
  const w = window as Window & { clarity?: ((...args: unknown[]) => void) & { q?: unknown[] } };
  w.clarity =
    w.clarity ||
    Object.assign(
      function (...args: unknown[]) {
        (w.clarity!.q = w.clarity!.q || []).push(args);
      },
      { q: [] as unknown[] },
    );
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
  document.head.appendChild(s);
  w.clarity('consent');
}


/* ── GA Measurement Protocol: client-side link decoration ─────────────── */
let cachedClientId: string | null = null;
let cachedSessionId: string | null = null;

function retrieveGaIds(): void {
  if (typeof window === 'undefined' || !window.gtag) return;
  try {
    window.gtag('get', GA_ID, 'client_id', (id: unknown) => {
      if (typeof id === 'string') cachedClientId = id;
    });
    window.gtag('get', GA_ID, 'session_id', (id: unknown) => {
      if (typeof id === 'string' || typeof id === 'number') cachedSessionId = String(id);
    });
  } catch {
    // never throw
  }
}

/** Maps affiliate network name → the tertiary subid query param that network
 *  passes through to postbacks. The client_id|session_id pair rides in this
 *  field so the postback handler can forward conversions to GA4 via the
 *  Measurement Protocol. */
const TERTIARY_SUBID_PARAM: Record<string, string> = {
  awin: 'clickref3',
  kelkoo: 'custom3',
  tradedoubler: 'epi3',
  strackr: 'subid3',
};

/** Append the GA client+session ID to an outbound affiliate URL's tertiary
 *  subid parameter. Uses the affiliate_network (NOT the placement/source) to
 *  pick the correct query parameter name. */
function decorateUrlWithGaIds(
  href: string,
  affiliateNetwork: string,
  clientId: string,
  sessionId?: string,
): string {
  try {
    const param = TERTIARY_SUBID_PARAM[affiliateNetwork];
    if (!param) return href;
    const url = new URL(href);
    const val = sessionId ? `${clientId}|${sessionId}` : clientId;
    url.searchParams.set(param, val);
    return url.toString();
  } catch {
    return href;
  }
}

/** Inject gtag.js (idempotent) with the Consent Mode v2 sequence. */
function loadGa(): void {
  if (window.__gaLoaded) {
    gaConsentUpdate(true); // re-granted after a revoke
    retrieveGaIds();
    return;
  }
  window.__gaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  // gtag MUST push the arguments object itself (not a rest-args array) — the
  // GA snippet contract; gtag.js inspects the Arguments instance.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  } as unknown as (...args: unknown[]) => void;
  // Consent Mode v2: default DENIED for every key, queued BEFORE any command
  // that could read/write storage (per the consent-mode docs).
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  });
  window.gtag('js', new Date());
  // Belt-and-braces for the "no Google-advertising features" policy promise:
  // signals off explicitly, on top of the permanently-denied ads consent keys.
  window.gtag('config', GA_ID, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  // This branch only runs post-grant — release analytics storage immediately,
  // then drain impressions buffered before the tag existed (landing-page
  // TrackView effects run before this component's effect).
  gaConsentUpdate(true);
  gaFlushPending();
  // Retrieve GA client/session IDs for Measurement Protocol link decoration.
  // Retry once after 1s in case the gtag.js library hasn't finished loading.
  retrieveGaIds();
  setTimeout(retrieveGaIds, 1000);
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

export function Analytics() {
  useEffect(() => {
    const granted = () => CookieConsent.acceptedCategory('analytics');
    const sync = () => {
      if (granted()) {
        loadClarity();
        loadGa();
      } else {
        if (window.__clarityLoaded) {
          window.clarity?.('consent', false);
          window.clarity?.('stop');
        }
        if (window.__gaLoaded) gaConsentUpdate(false);
      }
    };
    // Covers a returning visitor whose stored consent was applied before this
    // effect ran (sibling-effect ordering with CookieConsent.run()).
    sync();
    window.addEventListener('cc:onConsent', sync);
    window.addEventListener('cc:onChange', sync);

    // Declarative CTA instrumentation → both tools (capture phase, so it also
    // runs for target=_blank navigations).
    const onClick = (e: MouseEvent) => {
      // Defense-in-depth: zero analytics calls without granted consent.
      if (!granted()) return;
      const el = (e.target as Element | null)?.closest?.('[data-analytics-event]');
      if (!el) return;
      const ds = (el as HTMLElement).dataset;
      const name = ds.analyticsEvent;
      if (!name) return;
      const source = ds.analyticsSource;
      // Clarity: named smart event + attribution tag.
      if (source) clarityTag('cta_source', source);
      clarityEvent(name);
      // GA4: item context → ecommerce select_item (built-in reports) plus the
      // flat affiliate_click custom event (simple explorations/BigQuery KPI).
      let payload: Record<string, unknown> | null = null;
      if (ds.analyticsItem) {
        try { payload = JSON.parse(ds.analyticsItem); } catch { /* malformed → flat event only */ }
      }
      if (payload) {
        // currency is event-level in GA4, not an item field — split it out.
        const { currency, ...item } = payload;
        const network = typeof item.affiliate_network === 'string' ? item.affiliate_network : '';

        // Decorate the outbound link with GA client+session IDs for
        // server-side Measurement Protocol conversion tracking.
        if (!cachedClientId) retrieveGaIds();
        const a = el.closest('a');
        if (a && a.href && network && cachedClientId) {
          a.href = decorateUrlWithGaIds(
            a.href, network, cachedClientId, cachedSessionId || undefined,
          );
        }

        gaEvent('select_item', {
          // Joins with view_item_list's item_list_name (the CTR denominator):
          // data-analytics-list carries the grid's listName; the PDP sets "pdp".
          item_list_name: ds.analyticsList ?? source ?? 'unknown',
          items: [item],
        });
        gaEvent('affiliate_click', {
          cta_source: source ?? 'unknown',
          merchant: item.item_brand ?? 'unknown',
          affiliate_network: item.affiliate_network ?? 'unknown',
          item_id: item.item_id,
          price: item.price,
          currency,
        });
      } else {
        gaEvent(name, source ? { cta_source: source } : undefined);
      }
    };
    document.addEventListener('click', onClick, true);

    return () => {
      window.removeEventListener('cc:onConsent', sync);
      window.removeEventListener('cc:onChange', sync);
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
