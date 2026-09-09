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
  // Every .rpc(name, params) call the supabase path makes, in order.
  rpcCalls: [] as [string, Record<string, unknown>][],
  // The full result set; the mock serves p_limit/p_offset slices of it, the way
  // PostgREST does — so the paging loop is genuinely exercised.
  rpcRows: [] as { slug: string; last_updated: string }[],
  rpcError: null as null | { message: string },
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
  supabase: () => ({
    rpc: async (name: string, params: Record<string, unknown>) => {
      h.rpcCalls.push([name, params]);
      if (h.rpcError) return { data: null, error: h.rpcError };
      const offset = (params.p_offset as number) ?? 0;
      const limit = (params.p_limit as number) ?? h.rpcRows.length;
      return { data: h.rpcRows.slice(offset, offset + limit), error: null };
    },
  }),
}));

import { getAllDealSlugs } from './deals.repo';
import { SITEMAP_ACTIVE_COUNTRIES, SITEMAP_MAX_DEAL_URLS } from '../geo/countries';

beforeEach(() => {
  h.configured = false;
  h.queriedCountries.length = 0;
  h.rpcCalls.length = 0;
  h.rpcRows = [];
  h.rpcError = null;
});

/** `n` distinct rows, enough to fill the cap and then some. */
const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    slug: `deal-${String(i).padStart(5, '0')}`,
    last_updated: '2026-09-09T07:00:00Z',
  }));

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

  it('supabase path: restricts the crawl surface to active countries', async () => {
    // Same guarantee as before the sitemap quality gate — the country filter
    // just moved from a query-builder `.in()` into the SQL function's argument.
    // Non-legal-cleared markets must never reach the sitemap even once their
    // rows unhide.
    h.configured = true;
    h.rpcRows = rows(10);
    await getAllDealSlugs();

    expect(h.rpcCalls.length).toBeGreaterThan(0);
    for (const [name, params] of h.rpcCalls) {
      expect(name).toBe('sitemap_deals');
      expect(params.p_countries).toEqual(SITEMAP_ACTIVE_COUNTRIES);
    }
  });

  it('supabase path: caps the sitemap at SITEMAP_MAX_DEAL_URLS', async () => {
    // The cap is the whole point: advertising ~32k URLs from a low-authority
    // domain left 28,055 of them "Discovered - currently not indexed".
    h.configured = true;
    h.rpcRows = rows(SITEMAP_MAX_DEAL_URLS + 500); // more available than we want

    const out = await getAllDealSlugs();

    expect(out).toHaveLength(SITEMAP_MAX_DEAL_URLS);
    expect(SITEMAP_MAX_DEAL_URLS).toBeLessThan(32000);
  });

  it('pages past the 1000-row PostgREST cap instead of truncating', async () => {
    // This shipped once: a single .rpc() asking for 2,000 returned 1,000 with no
    // error, and the live sitemap silently carried half of what it claimed.
    h.configured = true;
    h.rpcRows = rows(SITEMAP_MAX_DEAL_URLS);

    const out = await getAllDealSlugs();

    expect(out).toHaveLength(SITEMAP_MAX_DEAL_URLS);
    // No page may ask for more than the cap allows...
    for (const [, params] of h.rpcCalls) expect(params.p_limit as number).toBeLessThanOrEqual(1000);
    // ...and the offsets must walk forward, so pages neither repeat nor skip.
    expect(h.rpcCalls.map(([, p]) => p.p_offset)).toEqual([0, 1000]);
    expect(new Set(out.map((d) => d.slug)).size).toBe(SITEMAP_MAX_DEAL_URLS);
  });

  it('stops early when the catalogue is smaller than the cap', async () => {
    h.configured = true;
    h.rpcRows = rows(12);

    expect(await getAllDealSlugs()).toHaveLength(12);
    expect(h.rpcCalls).toHaveLength(1); // no pointless second round-trip
  });

  it('maps rows to the sitemap shape', async () => {
    h.configured = true;
    h.rpcRows = [{ slug: 'a-deal-awin-1', last_updated: '2026-09-09T07:00:00Z' }];

    expect(await getAllDealSlugs()).toEqual([
      { slug: 'a-deal-awin-1', lastUpdated: '2026-09-09T07:00:00Z' },
    ]);
  });

  it('degrades to an empty sitemap rather than throwing on a DB error', async () => {
    // A sitemap route that throws is worse than one that is briefly short.
    h.configured = true;
    h.rpcError = { message: 'function public.sitemap_deals does not exist' };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getAllDealSlugs()).resolves.toEqual([]);
    expect(spy).toHaveBeenCalled(); // and it is logged, not swallowed silently
    spy.mockRestore();
  });
});
