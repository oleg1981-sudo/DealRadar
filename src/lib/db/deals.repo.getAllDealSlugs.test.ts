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
  // Captures the .rpc(name, params) call the supabase path now makes.
  rpcArgs: null as null | [string, Record<string, unknown>],
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
      h.rpcArgs = [name, params];
      return h.rpcError ? { data: null, error: h.rpcError } : { data: h.rpcRows, error: null };
    },
  }),
}));

import { getAllDealSlugs } from './deals.repo';
import { SITEMAP_ACTIVE_COUNTRIES, SITEMAP_MAX_DEAL_URLS } from '../geo/countries';

beforeEach(() => {
  h.configured = false;
  h.queriedCountries.length = 0;
  h.rpcArgs = null;
  h.rpcRows = [];
  h.rpcError = null;
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

  it('supabase path: restricts the crawl surface to active countries', async () => {
    // Same guarantee as before the sitemap quality gate — the country filter
    // just moved from a query-builder `.in()` into the SQL function's argument.
    // Non-legal-cleared markets must never reach the sitemap even once their
    // rows unhide.
    h.configured = true;
    await getAllDealSlugs();

    expect(h.rpcArgs).not.toBeNull();
    expect(h.rpcArgs![0]).toBe('sitemap_deals');
    expect(h.rpcArgs![1].p_countries).toEqual(SITEMAP_ACTIVE_COUNTRIES);
  });

  it('supabase path: caps the sitemap at SITEMAP_MAX_DEAL_URLS', async () => {
    // The cap is the whole point: advertising ~32k URLs from a low-authority
    // domain left 28,055 of them "Discovered - currently not indexed".
    h.configured = true;
    await getAllDealSlugs();

    expect(h.rpcArgs![1].p_limit).toBe(SITEMAP_MAX_DEAL_URLS);
    expect(SITEMAP_MAX_DEAL_URLS).toBeLessThan(32000);
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
