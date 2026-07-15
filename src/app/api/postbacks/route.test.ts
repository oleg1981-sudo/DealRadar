import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildSubId, decodeSubId } from '@/lib/utils/affiliate';
import { signPostbackBody } from '@/lib/utils/crypto';
import { canonicalizePostbackQuery } from './canonicalize';

// Capture what the route writes to `transactions`, and let a test force one 23503.
const h = vi.hoisted(() => ({ upserts: [] as any[], failNext23503: false, seenSignatures: new Set<string>() }));

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

// Deterministic stand-ins for the Redis-backed helpers: rate limiting always
// succeeds (rate-limit behavior is covered separately in redis.test.ts), and
// the signature-replay claim is a real in-memory "first claim wins" set — the
// same contract Upstash's SET NX EX gives us, just without a live Redis.
vi.mock('@/lib/cache/redis', () => ({
  rateLimitPostbacks: async () => ({ success: true }),
  claimPostbackSignature: async (sig: string) => {
    if (h.seenSignatures.has(sig)) return false;
    h.seenSignatures.add(sig);
    return true;
  },
}));

import { POST, GET } from './route';

const SECRET = 'test-webhook-secret';

function req(method: 'POST' | 'GET', qs: string, body?: unknown, extraHeaders?: Record<string, string>) {
  const url = `https://dealradar.me/api/postbacks?${qs}`;
  return new NextRequest(url, {
    method,
    ...(body !== undefined
      ? { headers: { 'content-type': 'application/json', ...extraHeaders }, body: JSON.stringify(body) }
      : { headers: extraHeaders }),
  });
}

/**
 * A correctly HMAC-signed POST request — POST now requires this
 * unconditionally. `timestamp` defaults to "now"; pass an explicit value to
 * get a distinct signature for the SAME body (e.g. two "duplicate postback"
 * requests fired in the same test would otherwise share one timestamp and
 * therefore one signature, which the replay guard would then — correctly —
 * treat as a replay rather than two independent deliveries).
 */
function signedPostReq(body: unknown, timestamp = Math.floor(Date.now() / 1000)) {
  const bodyStr = JSON.stringify(body);
  const signature = signPostbackBody(SECRET, timestamp, bodyStr);
  return req('POST', '', body, { 'x-timestamp': String(timestamp), 'x-signature': signature });
}

/**
 * A correctly HMAC-signed GET request (`&ts=…&sig=…`), signed EXACTLY the
 * way the route verifies it — via the same canonicalizePostbackQuery import
 * — so there is no separate reimplementation to drift out of sync.
 */
function signedGetReq(params: Record<string, string>) {
  const url = new URL('https://dealradar.me/api/postbacks');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const timestamp = Math.floor(Date.now() / 1000);
  url.searchParams.set('ts', String(timestamp));
  const message = canonicalizePostbackQuery(url.searchParams);
  const signature = signPostbackBody(SECRET, timestamp, message);
  url.searchParams.set('sig', signature);
  return new NextRequest(url.toString());
}

beforeEach(() => {
  h.upserts.length = 0;
  h.failNext23503 = false;
  h.seenSignatures.clear();
  process.env.WEBHOOK_SECRET = SECRET;
});

describe('POST /api/postbacks (HMAC signature required — no query-secret fallback)', () => {
  it('persists a valid AWIN postback and recovers the productId from the sub-id (lossless round-trip)', async () => {
    const pid = 'awin:DE:12345';
    const clickref = buildSubId('DE', 'electronics', pid);
    const res = await POST(
      signedPostReq({
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
    const now = Math.floor(Date.now() / 1000);
    // Two DISTINCT signed requests for the SAME payload (different
    // timestamps → different signatures), so this exercises transaction_id
    // upsert idempotency specifically, not the signature-replay guard (an
    // identical signature sent twice is a replay, correctly rejected — that
    // path is covered separately below).
    const r1 = await POST(signedPostReq(payload, now));
    const r2 = await POST(signedPostReq(payload, now + 1));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(h.upserts.every((u) => u.transaction_id === 'dup')).toBe(true);
  });

  it('rejects a negative/NaN commission with 400', async () => {
    const res = await POST(signedPostReq({ transaction_id: 'tx', network: 'awin', commission_earned: -5 }));
    expect(res.status).toBe(400);
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a missing transaction_id with 400', async () => {
    const res = await POST(signedPostReq({ network: 'awin', commission_earned: 1 }));
    expect(res.status).toBe(400);
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a POST with a VALID secret but NO X-Signature — the legacy fallback was removed for POST', async () => {
    // This is the behavior change: before, ?secret=<correct> alone was enough
    // to authenticate ANY postback body. A leaked secret can no longer do
    // that for POST — a signature is unconditionally required.
    const res = await POST(req('POST', `secret=${SECRET}`, { transaction_id: 'tx', network: 'awin', commission_earned: 1 }));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'missing_signature' });
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a POST with a wrong secret AND no signature (still 401, for the same reason)', async () => {
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
      signedPostReq({
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

describe('POST /api/postbacks — HMAC signature details', () => {
  it('rejects a tampered body — valid signature, but for a DIFFERENT body than what was sent', async () => {
    const original = { transaction_id: 'tx-tamper', network: 'awin', commission_earned: 1 };
    const tampered = { ...original, commission_earned: 999 };
    const timestamp = Math.floor(Date.now() / 1000);
    // Sign the ORIGINAL payload but send the TAMPERED one on the wire.
    const signature = signPostbackBody(SECRET, timestamp, JSON.stringify(original));

    const res = await POST(req('POST', '', tampered, { 'x-timestamp': String(timestamp), 'x-signature': signature }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'invalid_signature' });
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a signed request with no X-Timestamp header', async () => {
    const payload = { transaction_id: 'tx-no-ts', network: 'awin', commission_earned: 1 };
    const signature = signPostbackBody(SECRET, Math.floor(Date.now() / 1000), JSON.stringify(payload));

    const res = await POST(req('POST', '', payload, { 'x-signature': signature }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'missing_timestamp' });
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a stale timestamp outside the ±5-minute replay window (replay guard)', async () => {
    const payload = { transaction_id: 'tx-stale', network: 'awin', commission_earned: 1 };
    const staleTimestamp = Math.floor(Date.now() / 1000) - 10 * 60; // 10 min old
    const signature = signPostbackBody(SECRET, staleTimestamp, JSON.stringify(payload));

    const res = await POST(req('POST', '', payload, { 'x-timestamp': String(staleTimestamp), 'x-signature': signature }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'stale_timestamp' });
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a signature that has already been used once (replay guard, dedicated nonce check)', async () => {
    const payload = { transaction_id: 'tx-replay', network: 'awin', commission_earned: 1 };
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPostbackBody(SECRET, timestamp, JSON.stringify(payload));
    const makeReq = () => req('POST', '', payload, { 'x-timestamp': String(timestamp), 'x-signature': signature });

    const first = await POST(makeReq());
    expect(first.status).toBe(200);

    const replay = await POST(makeReq());
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ error: 'replayed_signature' });
    // Only the first request's row was written.
    expect(h.upserts).toHaveLength(1);
  });

  it('a signature computed with the WRONG secret is rejected (not just a body mismatch)', async () => {
    const payload = { transaction_id: 'tx-wrong-secret', network: 'awin', commission_earned: 1 };
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPostbackBody('not-the-real-secret', timestamp, JSON.stringify(payload));

    const res = await POST(req('POST', '', payload, { 'x-timestamp': String(timestamp), 'x-signature': signature }));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'invalid_signature' });
    expect(h.upserts).toHaveLength(0);
  });
});

describe('GET /api/postbacks (query-string postbacks)', () => {
  it('accepts a GET postback via the bare ?secret= fallback (documented residual path, GET-only)', async () => {
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

  it('accepts a GET postback with a valid ts+sig query-param signature (no ?secret= needed)', async () => {
    const clickref = buildSubId('DE', 'electronics', 'awin:DE:get-sig-ok');
    const request = signedGetReq({
      transaction_id: 'tx-get-sig-ok',
      network: 'awin',
      commission_earned: '2',
      status: 'approved',
      clickref,
    });
    const res = await GET(request);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true });
    expect(h.upserts[0].product_id).toBe('awin:DE:get-sig-ok');
    // ts/sig must not leak into raw_payload either, same as secret.
    expect(h.upserts[0].raw_payload.sig).toBeUndefined();
    expect(h.upserts[0].raw_payload.ts).toBeUndefined();
  });

  it('rejects a GET postback with a tampered sig (a query param changed after signing)', async () => {
    const signed = signedGetReq({ transaction_id: 'tx-get-tamper', network: 'awin', commission_earned: '2' });
    const tamperedUrl = new URL(signed.url);
    tamperedUrl.searchParams.set('commission_earned', '999'); // changed AFTER signing
    const res = await GET(new NextRequest(tamperedUrl.toString()));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'invalid_signature' });
    expect(h.upserts).toHaveLength(0);
  });

  it('rejects a replayed GET sig (the identical signed URL requested twice)', async () => {
    const request = signedGetReq({ transaction_id: 'tx-get-replay', network: 'awin', commission_earned: '1' });
    const urlStr = request.url;

    const first = await GET(request);
    expect(first.status).toBe(200);

    const replay = await GET(new NextRequest(urlStr));
    expect(replay.status).toBe(401);
    expect(await replay.json()).toMatchObject({ error: 'replayed_signature' });
    expect(h.upserts).toHaveLength(1);
  });
});
