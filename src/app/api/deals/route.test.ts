import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Route-level check that GET /api/deals actually returns 429 to the client
 * when its rate limiter is exhausted — i.e. the (N+1)th request in the
 * window gets denied. The limiter's own sliding-window math is tested in
 * src/lib/cache/redis.test.ts; this test is about the ROUTE's wiring: does
 * it check the limiter first, short-circuit before doing any real work, and
 * surface a 429 with a sensible error body.
 */
const h = vi.hoisted(() => ({ rateLimitSuccess: true, queryDealsCalls: 0 }));

vi.mock('@/lib/db/deals.repo', () => ({
  queryDeals: vi.fn(async () => {
    h.queryDealsCalls++;
    return [];
  }),
}));

vi.mock('@/lib/cache/redis', () => ({
  cacheGet: vi.fn(async () => null),
  cacheKey: vi.fn(() => 'dealradar:deals:test'),
  cacheSet: vi.fn(async () => {}),
  rateLimitDeals: vi.fn(async () => ({ success: h.rateLimitSuccess })),
}));

import { GET } from './route';

function req(qs: string) {
  return new NextRequest(`https://dealradar.me/api/deals?${qs}`);
}

beforeEach(() => {
  h.rateLimitSuccess = true;
  h.queryDealsCalls = 0;
});

describe('GET /api/deals — rate limiting', () => {
  it('returns 429 and does not touch the DB when the rate limiter reports exhausted', async () => {
    h.rateLimitSuccess = false;
    const res = await GET(req('country=DE'));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: 'rate_limited' });
    expect(h.queryDealsCalls).toBe(0);
  });

  it('serves normally (200) when the rate limiter allows the request', async () => {
    h.rateLimitSuccess = true;
    const res = await GET(req('country=DE'));
    expect(res.status).toBe(200);
    expect(h.queryDealsCalls).toBe(1);
  });
});
