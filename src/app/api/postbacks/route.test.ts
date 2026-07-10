import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSubId, decodeSubId } from '@/lib/utils/affiliate';

// Capture what the route writes to `transactions`, and let a test force one 23503.
const h = vi.hoisted(() => ({ upserts: [] as any[], failNext23503: false }));

vi.mock('@/lib/db/supabase', () => ({
  supabaseConfigured: () => true,
  supabase: () => ({
    from: () => ({
      upsert: (row: any) => {
        h.upserts.push(row);
        if (h.failNext23503 && row.product_id != null) {
          h.failNext23503 = false;
          return Promise.resolve({ error: { code: '23503', message: 'fk violation' } });
        }
        return Promise.resolve({ error: null });
      },
    }),
  }),
}));

import { POST, GET } from './route';

const SECRET = 'test-webhook-secret';

function req(method: 'POST' | 'GET', qs: string, body?: unknown) {
  const url = `https://dealradar.me/api/postbacks?${qs}`;
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
}

beforeEach(() => {
  h.upserts.length = 0;
  h.failNext23503 = false;
  process.env.WEBHOOK_SECRET = SECRET;
});

describe('POST /api/postbacks', () => {
  it('persists a valid AWIN postback and recovers the productId from the sub-id (lossless round-trip)', async () => {
    const pid = 'awin:DE:12345';
    const clickref = buildSubId('DE', 'electronics', pid);
    const res = await POST(
      req('POST', `secret=${SECRET}`, {
        transaction_id: 'tx-1',
        network: 'awin',
        commission_earned: 2.5,
        status: 'approved',
        clickref,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true });
    expect(h.upserts).toHaveLength(1);
    // The route must decode our clickref back to the exact productId we encoded.
    expect(h.upserts[0].product_id).toBe(decodeSubId(clickref)?.productId);
    expect(h.upserts[0].product_id).toBe(pid);
    expect(h.upserts[0].commission_earned).toBe(2.5);
    expect(h.upserts[0].status).toBe('approved');
    expect(h.upserts[0].transaction_id).toBe('tx-1');
  });

  it('is idempotent on transaction_id — a duplicate upserts (onConflict), never 500s', async () => {
    const payload = { transaction_id: 'dup', network: 'awin', commission_earned: 1, status: 'pending' };
    const r1 = await POST(req('POST', `secret=${SECRET}`, payload));
    const r2 = await POST(req('POST', `secret=${SECRET}`, payload));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(h.upserts.every((u) => u.transaction_id === 'dup')).toBe(true);
  });

  it('rejects a negative/NaN commission with 400', async () => {
    const res = await POST(
      req('POST', `secret=${SECRET}`, { transaction_id: 'tx', network: 'awin', commission_earned: -5 }),
    );
    expect(res.status).toBe(400);
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a missing transaction_id with 400', async () => {
    const res = await POST(req('POST', `secret=${SECRET}`, { network: 'awin', commission_earned: 1 }));
    expect(res.status).toBe(400);
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a wrong secret with 401 and writes nothing', async () => {
    const res = await POST(req('POST', 'secret=wrong', { transaction_id: 'tx', commission_earned: 1 }));
    expect(res.status).toBe(401);
    expect(h.upserts).toHaveLength(0);
  });

  it('returns 503 when WEBHOOK_SECRET is unconfigured (fails closed)', async () => {
    delete process.env.WEBHOOK_SECRET;
    const res = await POST(req('POST', 'secret=anything', { transaction_id: 'tx', commission_earned: 1 }));
    expect(res.status).toBe(503);
    expect(h.upserts).toHaveLength(0);
  });

  it('on FK 23503 retries with a null product_id rather than dropping the commission', async () => {
    h.failNext23503 = true;
    const clickref = buildSubId('DE', 'electronics', 'awin:DE:gone');
    const res = await POST(
      req('POST', `secret=${SECRET}`, {
        transaction_id: 'tx-fk',
        network: 'awin',
        commission_earned: 3,
        status: 'approved',
        clickref,
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ persisted: true });
    expect(h.upserts).toHaveLength(2);
    expect(h.upserts[0].product_id).toBe('awin:DE:gone'); // first attempt (23503)
    expect(h.upserts[1].product_id).toBeNull(); // fallback re-upsert
  });
});

describe('GET /api/postbacks (query-string postbacks)', () => {
  it('accepts a GET postback and never persists the secret into raw_payload', async () => {
    const clickref = buildSubId('DE', 'electronics', 'awin:DE:9');
    const res = await GET(
      req(
        'GET',
        `secret=${SECRET}&transaction_id=tx-get&network=awin&commission_earned=1.5&status=pending&clickref=${encodeURIComponent(clickref)}`,
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true });
    expect(h.upserts[0].product_id).toBe('awin:DE:9');
    expect(h.upserts[0].raw_payload.secret).toBeUndefined();
    expect(JSON.stringify(h.upserts[0].raw_payload)).not.toContain(SECRET);
  });
});
