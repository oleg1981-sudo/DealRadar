/** Best-effort mapping of arbitrary external category strings → DealRadar slugs. */
import type { CategorySlug } from './types';

const RULES: [RegExp, CategorySlug][] = [
  [/electro|computer|phone|tv|audio|camera|gaming|tech/i, 'electronics'],
  [/fashion|cloth|apparel|shoe|sneaker|bag|jewel|watch(?!.*smart)/i, 'fashion'],
  [/home|garden|furnit|kitchen|diy|tool|decor/i, 'home-garden'],
  // `run` was unanchored and matched any word CONTAINING it — German
  // "Rundreise" (round trip) was being filed under Sports. Anchored so it needs
  // the whole word or "running": the same substring-greed that put a pyjama in
  // Elektronik, caught here before the travel feed makes it visible.
  [/sport|fitness|outdoor|bike|cycl|running|\brun\b/i, 'sports'],
  [/beaut|cosmetic|perfume|skincare|health/i, 'beauty'],
  [/food|grocer|drink|beverage|wine|coffee/i, 'food-grocery'],
  [/toy|game(?!.*video)|lego|puzzle|kids/i, 'toys'],
  [/auto|car|tyre|tire|motor/i, 'automotive'],
  [/book|ebook|literature/i, 'books'],
  [/travel|luggage|holiday|flight|hotel/i, 'travel'],
  // Cruises & organised travel — TravelDeal's vertical. Added ahead of the feed
  // so a cruise cannot land in `electronics` the moment one first arrives.
  // German included deliberately: every previous mis-filing was an English-only
  // rule set meeting a German catalogue.
  [/cruise|kreuzfahrt|sailing|voyage|safari|tour|rundreise|pauschalreise|expedition/i, 'travel'],
];

/**
 * Fall-throughs seen this process, by the raw string that failed to match.
 *
 * The `electronics` return below is the SAME defect that mis-filed three AWIN
 * merchants (Profichemie 2026-07-19, Zizzz.de 2026-08-20 — a child's pyjama
 * under Elektronik). The default was never the problem; the silence was. Each
 * time it was found by a person noticing a wrong page, never by the code.
 *
 * `scripts/ingest-awin.cjs` now tracks and fails on this for AWIN. This module
 * is the OTHER path — Strackr, Tradedoubler, and any provider added later
 * (TourRadar) — so it needs the same treatment or the next new API repeats it.
 */
const fallbacks = new Map<string, number>();

export function mapExternalCategory(external: string): CategorySlug {
  for (const [re, slug] of RULES) if (re.test(external)) return slug;
  // Record before returning. Keyed by the raw external string so the report
  // names the taxonomy value that needs a rule, not just a count.
  const key = (external || '').trim() || '(empty)';
  fallbacks.set(key, (fallbacks.get(key) ?? 0) + 1);
  // eslint-disable-next-line no-console -- a silent default is exactly the bug
  console.warn(
    `[category-map] no rule matched "${key}" — defaulting to "electronics". ` +
      'Add a rule in category-map.ts before these publish.',
  );
  return 'electronics';
}

/** Unmatched external categories seen so far, most frequent first. */
export function uncategorisedExternals(): { external: string; count: number }[] {
  return [...fallbacks.entries()]
    .map(([external, count]) => ({ external, count }))
    .sort((a, b) => b.count - a.count);
}

/** Reset the tracker — for tests, and for callers that report per batch. */
export function resetUncategorisedExternals(): void {
  fallbacks.clear();
}
