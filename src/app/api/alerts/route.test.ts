import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

const h = vi.hoisted(() => ({
  countValue: 0,
  shouldThrowLimit: false,
  created: [] as any[],
}));

vi.mock('@/lib/db/supabase', () => {
  const queryBuilder = {
    select: () => queryBuilder,
    eq: () => queryBuilder,
    upsert: (row: any) => {
      if (h.shouldThrowLimit) {
        return Promise.resolve({ error: { message: 'Limit of 50 active alerts exceeded', code: 'P0001' } });
      }
      h.created.push(row);
      return Promise.resolve({ error: null });
    },
    then: (resolve: any) => {
      resolve({ count: h.countValue, error: null });
    }
  };

  return {
    supabaseConfigured: () => true,
    supabase: () => ({
      from: () => queryBuilder,
    }),
  };
});

vi.mock('@/lib/cache/redis', () => ({
  rateLimitAlerts: async () => ({ success: true }),
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

beforeEach(() => {
  h.countValue = 0;
  h.shouldThrowLimit = false;
  h.created.length = 0;
});

function createReq(body: any) {
  return new NextRequest('https://dealradar.me/api/alerts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/alerts', () => {
  it('creates an alert successfully when under limits', async () => {
    const res = await POST(createReq({
      email: 'test@example.com',
      productId: 'kelkoo:123',
      productName: 'Cool Item',
      price: 100,
      currency: 'EUR',
      locale: 'en',
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(h.created).toHaveLength(1);
  });

  it('rejects with 429 when check count is over limit', async () => {
    h.countValue = 50;
    const res = await POST(createReq({
      email: 'test@example.com',
      productId: 'kelkoo:123',
      productName: 'Cool Item',
      price: 100,
      currency: 'EUR',
      locale: 'en',
    }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'too_many_alerts' });
    expect(h.created).toHaveLength(0);
  });

  it('rejects with 429 when db throws limit exception due to concurrent race', async () => {
    h.countValue = 10; // count check passes
    h.shouldThrowLimit = true; // but concurrent insert triggers the exception
    const res = await POST(createReq({
      email: 'test@example.com',
      productId: 'kelkoo:123',
      productName: 'Cool Item',
      price: 100,
      currency: 'EUR',
      locale: 'en',
    }));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'too_many_alerts' });
    expect(h.created).toHaveLength(0);
  });
});
