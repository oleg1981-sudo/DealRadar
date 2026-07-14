/**
 * Thin, safe wrappers around Microsoft Clarity's queue API. Clarity is loaded
 * lazily by ClarityAnalytics ONLY after the visitor grants the `analytics`
 * consent category, so every call here must no-op when the tag is absent
 * (SSR, consent not granted, script blocked). Never throw from analytics.
 */

type ClarityFn = (...args: unknown[]) => void;

declare global {
  // eslint-disable-next-line no-var
  var clarity: ClarityFn | undefined;
}

function clarity(...args: unknown[]): void {
  try {
    if (typeof window !== 'undefined' && typeof window.clarity === 'function') {
      window.clarity(...args);
    }
  } catch {
    /* analytics must never break the app */
  }
}

/** Log a named custom event (shows up under Clarity → Smart events). */
export function clarityEvent(name: string): void {
  clarity('event', name);
}

/** Attach a custom tag to the current session (filterable in Clarity). */
export function clarityTag(key: string, value: string): void {
  clarity('set', key, value);
}
