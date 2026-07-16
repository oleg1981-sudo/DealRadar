import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { generateUnsubscribeToken } from '@/lib/utils/crypto';

// Setup Supabase Mock
const h = vi.hoisted(() => ({
  deletions: [] as any[],
  supabaseConfigured: true,
}));

vi.mock('@/lib/db/supabase', () => ({
  supabaseConfigured: () => h.supabaseConfigured,
  supabase: () => ({
    from: () => ({
      delete: () => ({
        eq: (k1: string, v1: any) => ({
          eq: (k2: string, v2: any) => {
            h.deletions.push({ [k1]: v1, [k2]: v2 });
            return Promise.resolve({ error: null });
          },
        }),
      }),
    }),
  }),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    return (key: string) => `trans_${key}`;
  },
}));

import { GET, POST } from './route';

const EMAIL = 'user@example.com';
const PRODUCT_ID = 'kelkoo:123';
let token = '';

beforeEach(() => {
  h.deletions.length = 0;
  h.supabaseConfigured = true;
  process.env.CRON_SECRET = 'test-secret-key';
  token = generateUnsubscribeToken(EMAIL, PRODUCT_ID);
});

describe('GET /api/alerts/unsubscribe', () => {
  it('returns a confirmation HTML page for a valid token without calling unsubscribe', async () => {
    const req = new NextRequest(`https://dealradar.me/api/alerts/unsubscribe?email=${encodeURIComponent(EMAIL)}&productId=${PRODUCT_ID}&token=${token}&locale=en`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('trans_confirmTitle');
    expect(html).toContain('<form method="POST">');
    // Ensure DB unsubscribe was not called yet
    expect(h.deletions).toHaveLength(0);
  });

  it('returns an error HTML page for an invalid token', async () => {
    const req = new NextRequest(`https://dealradar.me/api/alerts/unsubscribe?email=${encodeURIComponent(EMAIL)}&productId=${PRODUCT_ID}&token=invalid-token&locale=en`);
    const res = await GET(req);

    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('trans_errorTitle');
    expect(h.deletions).toHaveLength(0);
  });
});

describe('POST /api/alerts/unsubscribe', () => {
  it('performs unsubscribe and returns plain text for RFC 8058 one-click background MUA request', async () => {
    const req = new NextRequest(
      `https://dealradar.me/api/alerts/unsubscribe?email=${encodeURIComponent(EMAIL)}&productId=${PRODUCT_ID}&token=${token}&locale=en`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'List-Unsubscribe=One-Click',
      }
    );
    const res = await POST(req);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('unsubscribed');
    expect(h.deletions).toHaveLength(1);
    expect(h.deletions[0]).toEqual({ email: EMAIL, product_id: PRODUCT_ID });
  });

  it('performs unsubscribe and returns confirmation success HTML page for browser form submit', async () => {
    const req = new NextRequest(
      `https://dealradar.me/api/alerts/unsubscribe?email=${encodeURIComponent(EMAIL)}&productId=${PRODUCT_ID}&token=${token}&locale=en`,
      {
        method: 'POST',
      }
    );
    const res = await POST(req);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('trans_successTitle');
    expect(h.deletions).toHaveLength(1);
  });

  it('returns error HTML page for invalid token on browser POST', async () => {
    const req = new NextRequest(
      `https://dealradar.me/api/alerts/unsubscribe?email=${encodeURIComponent(EMAIL)}&productId=${PRODUCT_ID}&token=invalid-token&locale=en`,
      {
        method: 'POST',
      }
    );
    const res = await POST(req);

    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('trans_errorTitle');
    expect(h.deletions).toHaveLength(0);
  });
});
