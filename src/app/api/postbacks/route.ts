import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/supabase';
import { timingSafeEqualStr, verifyPostbackSignature } from '@/lib/utils/crypto';
import { decodeSubId } from '@/lib/utils/affiliate';
import { rateLimitPostbacks, claimPostbackSignature } from '@/lib/cache/redis';
import { clientIp } from '@/lib/utils/request-ip';
import { canonicalizePostbackQuery } from './canonicalize';
import { GA_ID } from '@/lib/analytics/gtag';

export const runtime = 'nodejs';

// Reject a signed postback whose X-Timestamp is further than this from "now"
// (either direction — covers both a stale replay and clock-skew nonsense).
// Also doubles as the TTL for the signature-replay claim below, so a given
// signature can only ever be accepted once across its entire valid lifetime.
const POSTBACK_REPLAY_WINDOW_SECONDS = 5 * 60;

/** Network status vocabularies → the DB enum (pending|approved|declined|paid). */
const STATUS_MAP: Record<string, 'pending' | 'approved' | 'declined' | 'paid'> = {
  pending: 'pending', new: 'pending', open: 'pending',
  approved: 'approved', confirmed: 'approved', validated: 'approved', accepted: 'approved',
  declined: 'declined', rejected: 'declined', cancelled: 'declined', canceled: 'declined', void: 'declined',
  paid: 'paid', cleared: 'paid',
};

/** Per-network body field that carries our outbound sub-id (and its tertiary). */
const PRIMARY_SUBID_FIELD: Record<string, string> = {
  awin: 'clickref', kelkoo: 'custom1', tradedoubler: 'epi', strackr: 'subid',
};
const TERTIARY_SUBID_FIELD: Record<string, string> = {
  awin: 'clickref3', kelkoo: 'custom3', tradedoubler: 'epi3', strackr: 'subid3',
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Auth for a postback request. POST and GET now have DIFFERENT minimum
 * bars, because their real-world sending capabilities differ:
 *
 * POST — HMAC signature is REQUIRED, no fallback. A request body means the
 *   sender is already capable of building a JSON payload, so it must also
 *   sign it: `X-Signature: HMAC-SHA256(WEBHOOK_SECRET,
 *   ${X-Timestamp}.${rawBody})`, with `X-Timestamp` a unix-seconds value
 *   inside a ±5-minute window, and the signature usable exactly once (a
 *   Redis-backed one-time claim — see claimPostbackSignature). The old
 *   `?secret=` query-string fallback has been REMOVED for POST: a leaked
 *   secret alone can no longer authenticate an arbitrary POST postback (any
 *   transaction_id/commission/status). No live affiliate integration depends
 *   on the old fallback — T-ING-2 real-credential onboarding is still open —
 *   so nothing real breaks by requiring signing from here on.
 *
 * GET — HMAC is RECOMMENDED but cannot be made mandatory: GET postbacks are
 *   redirect-triggered tracking pixels, and many real affiliate networks
 *   structurally cannot attach anything beyond query parameters to a pixel
 *   URL (no custom headers, no body to sign). So GET supports the SAME
 *   signature + replay-guard machinery as POST, carried over query params
 *   instead of headers (`&ts=<unix>&sig=<hmac>`), and uses it automatically
 *   whenever a request carries `sig`. When `sig` is absent, GET falls back
 *   to the bare `?secret=` check — this is a DELIBERATELY ACCEPTED residual
 *   gap, narrowed specifically to networks that cannot add one query
 *   parameter to a pixel URL (a much smaller set than "any network at all").
 *   G1 provider onboarding should prefer/require the signed variant whenever
 *   the network it's integrating supports it.
 *
 * `sig` for GET = HMAC-SHA256(WEBHOOK_SECRET, `${ts}.${canonical}`), where
 * `canonical` is every query param EXCEPT `secret` and `sig` themselves,
 * sorted by (decoded) key ascending, each key/value pair re-encoded via
 * encodeURIComponent and joined as `k=v&k=v` — see canonicalizePostbackQuery.
 * Re-encoding (rather than joining the raw decoded values) closes a
 * signature-forging ambiguity: without it, two different param sets could
 * canonicalize to the identical string if a value itself contained a
 * literal `&` or `=`.
 *
 * The secret always travels in the query string, never the body, so it
 * never lands in `raw_payload`.
 */

/**
 * Shared signature verification: timestamp freshness → HMAC validity →
 * one-time-use claim. `message` is whatever was actually signed (POST: the
 * raw request body bytes; GET: canonicalizePostbackQuery's output). Returns
 * an error response, or null when the signature checks out.
 */
async function verifySignedRequest(
  secret: string,
  timestampParam: string | null,
  message: string,
  signature: string,
): Promise<NextResponse | null> {
  const timestamp = timestampParam ? Number(timestampParam) : NaN;
  if (!timestampParam || !Number.isFinite(timestamp)) {
    return NextResponse.json({ error: 'missing_timestamp' }, { status: 401 });
  }
  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > POSTBACK_REPLAY_WINDOW_SECONDS) {
    return NextResponse.json({ error: 'stale_timestamp' }, { status: 401 });
  }
  if (!verifyPostbackSignature(secret, timestamp, message, signature)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }
  // Signature is cryptographically valid and fresh — now make sure it hasn't
  // been used before (replay of a captured-but-still-valid request).
  const claimed = await claimPostbackSignature(signature, POSTBACK_REPLAY_WINDOW_SECONDS);
  if (!claimed) {
    return NextResponse.json({ error: 'replayed_signature' }, { status: 401 });
  }
  return null;
}

/** POST auth: HMAC signature required, no query-secret fallback (see comment above). */
async function checkAuthPost(req: NextRequest, rawBody: string): Promise<NextResponse | null> {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) {
    console.error('[postback] WEBHOOK_SECRET not configured — rejecting');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const signature = req.headers.get('x-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing_signature' }, { status: 401 });
  }
  return verifySignedRequest(expected, req.headers.get('x-timestamp'), rawBody, signature);
}

/** GET auth: `ts`+`sig` query params when present, else the bare `?secret=` fallback. */
async function checkAuthGet(req: NextRequest): Promise<NextResponse | null> {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) {
    console.error('[postback] WEBHOOK_SECRET not configured — rejecting');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }

  const signature = req.nextUrl.searchParams.get('sig');
  if (signature) {
    const message = canonicalizePostbackQuery(req.nextUrl.searchParams);
    return verifySignedRequest(expected, req.nextUrl.searchParams.get('ts'), message, signature);
  }

  // Documented residual fallback (GET only): bare shared secret, for
  // networks that cannot attach `ts`/`sig` params to a tracking pixel.
  const provided = req.nextUrl.searchParams.get('secret') || '';
  if (!timingSafeEqualStr(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * GET /api/postbacks?secret=…&transaction_id=…&… (or …&ts=…&sig=… for the
 * signed variant) — query-string postbacks. Some networks (Strackr) default
 * to GET pixels rather than POST/JSON. Fields arrive as query params;
 * `secret` and `sig`/`ts` are stripped so neither lands in raw_payload.
 */
export async function GET(req: NextRequest) {
  const { success } = await rateLimitPostbacks(clientIp(req));
  if (!success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const unauthorized = await checkAuthGet(req);
  if (unauthorized) return unauthorized;
  const body: Record<string, unknown> = {};
  for (const [k, v] of req.nextUrl.searchParams) {
    if (k !== 'secret' && k !== 'sig' && k !== 'ts') body[k] = v;
  }
  return processPostback(body);
}

export async function POST(req: NextRequest) {
  const { success } = await rateLimitPostbacks(clientIp(req));
  if (!success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  // Read the RAW body text (not req.json()) so a signature can be verified
  // against the exact bytes the sender signed — re-serializing via
  // JSON.stringify could reorder keys / change whitespace and break a
  // legitimate signature.
  const rawBody = await req.text();

  const unauthorized = await checkAuthPost(req, rawBody);
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  return processPostback(body);
}

async function processPostback(body: Record<string, unknown>): Promise<NextResponse> {
  const transactionId = str(body.transaction_id) || str(body.id);
  if (!transactionId) {
    return NextResponse.json({ error: 'missing_transaction_id' }, { status: 400 });
  }

  const network = (str(body.network) || 'unknown').toLowerCase();

  // Commission: finite, non-negative (mirrors transactions_commission_chk).
  const commission = Number(body.commission_earned ?? body.commission ?? 0);
  if (!Number.isFinite(commission) || commission < 0) {
    return NextResponse.json({ error: 'invalid_commission' }, { status: 400 });
  }

  // Status: normalize network vocab to the enum; unknown → pending (+ warn).
  const rawStatus = str(body.status).toLowerCase().trim();
  const status = STATUS_MAP[rawStatus] ?? 'pending';
  if (rawStatus && !STATUS_MAP[rawStatus]) {
    console.warn(`[postback] unknown status "${rawStatus}" from ${network} — defaulting to pending`);
  }

  // Network-aware sub-id extraction, with generic fallbacks.
  const primaryField = PRIMARY_SUBID_FIELD[network];
  const subid =
    (primaryField ? str(body[primaryField]) : '') ||
    str(body.subid) || str(body.clickref) || str(body.custom1) || str(body.epi);
  const tertiaryField = TERTIARY_SUBID_FIELD[network];
  const subid3 =
    ((tertiaryField ? str(body[tertiaryField]) : '') || str(body.subid3) || str(body.clickref3)) || null;

  // Recover the exact productId we encoded into the sub-id (lossless round-trip).
  const productId = decodeSubId(subid)?.productId ?? null;

  if (!supabaseConfigured()) {
    console.warn('[postback] Supabase unconfigured — logging transaction:', {
      transactionId, network, commission, status,
    });
    if ((status === 'approved' || status === 'paid') && subid3) {
      forwardToMeasurementProtocol(subid3, transactionId, commission, network);
    }
    return NextResponse.json({ ok: true, persisted: false });
  }

  const row = {
    transaction_id: transactionId,
    product_id: productId,
    network,
    commission_earned: commission,
    status,
    subid3,
    raw_payload: body,
    received_at: new Date().toISOString(),
  };

  let { error } = await supabase().from('transactions').upsert(row, { onConflict: 'transaction_id' });
  // FK guard: a postback can reference a product no longer in `deals`. Persist
  // the commission record with a null product_id rather than dropping it.
  if (error?.code === '23503' && productId) {
    console.warn(`[postback] product_id ${productId} absent from deals — persisting with null FK`);
    ({ error } = await supabase()
      .from('transactions')
      .upsert({ ...row, product_id: null }, { onConflict: 'transaction_id' }));
  }
  if (error) {
    console.error('[postback] DB write failed:', error.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  // ── GA4 Measurement Protocol: forward approved/paid conversions ──────
  // The client-side Analytics.tsx decorates outbound affiliate links with
  // the visitor's GA client_id|session_id in the network's tertiary subid
  // field. When the postback comes back with those IDs, we forward a
  // `purchase` event server-side, closing the attribution loop for
  // conversions that happen off-site (on the merchant's domain).
  if ((status === 'approved' || status === 'paid') && subid3) {
    forwardToMeasurementProtocol(subid3, transactionId, commission, network);
  }

  return NextResponse.json({ ok: true, persisted: true });
}

/**
 * Fire-and-forget: send a `purchase` event to GA4 via the Measurement Protocol.
 * The subid3 value is expected to be `<client_id>|<session_id>` (decorated by
 * the client-side Analytics.tsx). If the format doesn't match or the API key
 * isn't configured, this is a silent no-op — postback handling is never affected.
 */
function forwardToMeasurementProtocol(
  subid3: string,
  transactionId: string,
  commission: number,
  network: string,
): void {
  const apiSecret = process.env.GA_MEASUREMENT_PROTOCOL_API_KEY;
  if (!apiSecret) return;

  const parts = subid3.split('|');
  const clientId = parts[0];
  if (!clientId) return;
  const sessionId = parts[1] || undefined;

  const payload: Record<string, unknown> = {
    client_id: clientId,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: transactionId,
          value: commission,
          currency: 'EUR',
          affiliation: network,
          ...(sessionId ? { session_id: sessionId } : {}),
        },
      },
    ],
  };

  const debug = process.env.NODE_ENV === 'development' || process.env.GA_MP_DEBUG === 'true';
  const baseUrl = debug
    ? 'https://www.google-analytics.com/debug/mp/collect'
    : 'https://www.google-analytics.com/mp/collect';

  const url = `${baseUrl}?measurement_id=${GA_ID}&api_secret=${apiSecret}`;
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(async (res) => {
      const text = await res.text();
      console.log(`[postback] GA4 MP (${debug ? 'debug' : 'production'}) status: ${res.status}, body: ${text}`);
    })
    .catch((err) => {
      // Log but never throw — postback handling must not be affected.
      console.warn('[postback] GA4 MP forwarding failed:', err instanceof Error ? err.message : err);
    });
}
