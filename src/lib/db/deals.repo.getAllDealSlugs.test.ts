/**
 * Tests for getAllDealSlugs — verifies the active-country guard introduced in
 * fix(seo): sitemap lists active-market (DE) deals only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted shared state — must live outside vi.mock factory functions so both
// the mock implementations and the test bodies can read/write it.
// ---------------------------------------------------------------------------
const h = vi.hoisted(() => ({
  configured: false,
  queriedCountries: [] as string[],
  // Captures the first .in(col, vals) call made on the supabase chain builder.
  inArgs: null as null | [string, unknown[]],
}));

// Bypass Next.js server-only guard.
vi.mock('server-only', () => ({}));

// Mock fetchDealsAcrossProviders so we can record which countries it is called with.
vi.mock('../providers/registry', () => ({
  fetchDealsAcrossProviders: vi.fn(async (query: { country: string; limit: number }) => {
    h.queriedCountries.push(query.country);
    return [];
  }),
}));

vi.mock('./supabase', () => ({
  supabaseConfigured: () => h.configured,
  supabase: () => {
    // Minimal chainable Thenable that records .in() arguments and resolves to
    // an empty page (so the pagination loop terminates after the first pass).
    const b: any = {};
    const chain = () => b;
    b.from     = chain;
    b.select   = chain;
    b.eq       = chain;
    b.not      = chain;
    b.order    = chain;
    b.range    = chain;
    b.in = (col: string, vals: unknown[]) => {
      // Only capture the first call (country guard).
      if (h.inArgs === null) h.inArgs = [col, vals];
      return b;
    };
    // Implements the Thenable protocol so `await supabase()...range()` works.
    b.then = (resolve: (r: any) => void) => resolve({ data: [], error: null });
    return b;
  },
}));

import { getAllDealSlugs } from './deals.repo';
import { SITEMAP_ACTIVE_COUNTRIES } from '../geo/countries';

beforeEach(() => {
  h.configured = false;
  h.queriedCountries.length = 0;
  h.inArgs = null;
});

describe('getAllDealSlugs', () => {
  it('mock-fallback: only queries countries in SITEMAP_ACTIVE_COUNTRIES', async () => {
    // supabaseConfigured() === false → takes the mock fallback branch.
    await getAllDealSlugs();

    // Every country passed to the registry must be an active country.
    for (const country of h.queriedCountries) {
      expect(SITEMAP_ACTIVE_COUNTRIES).toContain(country);
    }
    // Each active country must have been queried exactly once.
    expect([...h.queriedCountries].sort()).toEqual([...SITEMAP_ACTIVE_COUNTRIES].sort());
  });

  it('supabase path: applies .in("country", SITEMAP_ACTIVE_COUNTRIES) filter', async () => {
    h.configured = true;
    await getAllDealSlugs();

    expect(h.inArgs).not.toBeNull();
    expect(h.inArgs![0]).toBe('country');
    expect(h.inArgs![1]).toEqual(SITEMAP_ACTIVE_COUNTRIES);
  });
});
