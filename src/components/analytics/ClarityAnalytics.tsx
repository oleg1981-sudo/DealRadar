'use client';

/**
 * Microsoft Clarity, consent-gated (GDPR / FR-COMP-6): the tag is injected
 * ONLY after the visitor grants the `analytics` cookie-consent category —
 * zero non-essential script/cookie before consent, matching the site's
 * opt-in-default-OFF consent design. Revoking consent live-stops recording.
 *
 * Also installs ONE delegated click listener translating declarative
 * `data-clarity-event` (+ optional `data-clarity-source`) attributes into
 * Clarity custom events — so server components (PDP CTA) and client
 * components (DealCard CTA) are instrumented with plain markup, no wrappers.
 *
 * KPI events emitted site-wide:
 *   cta_go_to_deal        the monetized outbound click (source: card | pdp)
 *   price_alert_open      alert funnel step 1 (button → email field)
 *   price_alert_subscribe alert funnel step 2 (successful POST /api/alerts)
 */
import { useEffect } from 'react';
import * as CookieConsent from 'vanilla-cookieconsent';
import { clarityEvent, clarityTag } from '@/lib/analytics/clarity';

const CLARITY_ID = 'xmdpyixf7i';

declare global {
  interface Window {
    __clarityLoaded?: boolean;
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
  // Official bootstrap, minus document.write patterns: queue shim + async tag.
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
  // The project targets EU only: tell Clarity cookie consent WAS granted
  // (this component only ever runs post-grant).
  w.clarity('consent');
}

export function ClarityAnalytics() {
  useEffect(() => {
    const granted = () => CookieConsent.acceptedCategory('analytics');
    const sync = () => {
      if (granted()) {
        loadClarity();
      } else if (window.__clarityLoaded) {
        // Consent revoked mid-session: stop recording + drop cookie consent.
        window.clarity?.('consent', false);
        window.clarity?.('stop');
      }
    };
    // Covers a returning visitor whose stored consent was applied before this
    // effect ran (sibling-effect ordering race with CookieConsent.run()).
    sync();
    window.addEventListener('cc:onConsent', sync);
    window.addEventListener('cc:onChange', sync);

    // Declarative CTA instrumentation: any element carrying
    // data-clarity-event fires that event on click (capture phase, so it
    // also runs for target=_blank navigations).
    const onClick = (e: MouseEvent) => {
      // Defense-in-depth: zero analytics calls without granted consent, even
      // though Clarity itself also honors the stop/consent-false signals.
      if (!granted()) return;
      const el = (e.target as Element | null)?.closest?.('[data-clarity-event]');
      if (!el) return;
      const name = (el as HTMLElement).dataset.clarityEvent;
      if (!name) return;
      const source = (el as HTMLElement).dataset.claritySource;
      if (source) clarityTag('cta_source', source);
      clarityEvent(name);
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
