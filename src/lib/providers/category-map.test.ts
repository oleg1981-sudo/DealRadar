import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  mapExternalCategory,
  uncategorisedExternals,
  resetUncategorisedExternals,
} from './category-map';

// mapExternalCategory warns on every fall-through by design; silence it so the
// deliberate-miss tests do not spam the run.
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetUncategorisedExternals();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe('mapExternalCategory', () => {
  it('maps the common English taxonomies', () => {
    expect(mapExternalCategory('Consumer Electronics')).toBe('electronics');
    expect(mapExternalCategory('Womens Clothing')).toBe('fashion');
    expect(mapExternalCategory('Garden Furniture')).toBe('home-garden');
    expect(mapExternalCategory('Fitness Equipment')).toBe('sports');
    // Rule ORDER matters and is load-bearing: fashion is checked before sports,
    // so anything matching `shoe` lands in fashion even when it says "Running".
    // Documented rather than "fixed" — changing it would silently recategorise
    // existing rows.
    expect(mapExternalCategory('Running Shoes')).toBe('fashion');
  });

  it('does not let a substring steal a category (Rundreise is not Sports)', () => {
    expect(mapExternalCategory('Rundreise Italien')).toBe('travel');
    expect(mapExternalCategory('Trail Run')).toBe('sports');
    expect(mapExternalCategory('Running')).toBe('sports');
  });

  // The whole TravelDeal vertical depends on this: a cruise landing in
  // `electronics` is the exact defect that shipped three times on the AWIN side.
  it('maps cruises and organised travel to travel, in English AND German', () => {
    for (const s of ['Ocean Cruise', 'River Cruises', 'Safari Tours', 'Expedition']) {
      expect(mapExternalCategory(s)).toBe('travel');
    }
    for (const s of ['Kreuzfahrt', 'Kreuzfahrten Mittelmeer', 'Rundreise', 'Pauschalreise']) {
      expect(mapExternalCategory(s)).toBe('travel');
    }
  });

  it('still defaults to electronics when nothing matches', () => {
    expect(mapExternalCategory('Zzzz Unmappable Taxonomy')).toBe('electronics');
  });

  // The point of the change: the default is allowed, silence is not.
  it('RECORDS every fall-through so a new source cannot fail silently', () => {
    expect(uncategorisedExternals()).toEqual([]);

    mapExternalCategory('Bettwaren');
    mapExternalCategory('Bettwaren');
    mapExternalCategory('Schlafbekleidung');

    const seen = uncategorisedExternals();
    expect(seen).toEqual([
      { external: 'Bettwaren', count: 2 },
      { external: 'Schlafbekleidung', count: 1 },
    ]);
    // Keyed by the raw string, so the report names what needs a rule.
    expect(seen[0].external).toBe('Bettwaren');
  });

  it('does not record anything when every input matches a rule', () => {
    mapExternalCategory('Electronics');
    mapExternalCategory('Kreuzfahrt');
    expect(uncategorisedExternals()).toEqual([]);
  });

  it('normalises an empty external to a reportable key rather than dropping it', () => {
    mapExternalCategory('');
    mapExternalCategory('   ');
    expect(uncategorisedExternals()).toEqual([{ external: '(empty)', count: 2 }]);
  });
});
