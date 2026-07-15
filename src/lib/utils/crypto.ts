import crypto from 'node:crypto';

/**
 * Resolve the HMAC / cron signing secret at CALL time (never at module load) so
 * an empty-`.env` `next build` (NODE_ENV=production) does not throw on import.
 * In production a missing secret fails the request rather than silently using a
 * known default (audit T2.2-default-secret / R-SEC-1). Dev/test get a clearly
 * non-production fallback so the local flow works without keys.
 */
function signingSecret(): string {
  const s = process.env.CRON_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRON_SECRET is required in production for token signing');
  }
  return 'dealradar-dev-only-secret';
}

/**
 * Generates an HMAC SHA-256 token for email unsubscribe requests.
 */
export function generateUnsubscribeToken(email: string, productId: string): string {
  const data = `${email.toLowerCase().trim()}:${productId}`;
  return crypto.createHmac('sha256', signingSecret()).update(data).digest('hex');
}

/**
 * Timing-safe verification of email unsubscribe tokens. Fails closed if the
 * secret is unavailable (production-missing) or the token is malformed.
 */
export function verifyUnsubscribeToken(email: string, productId: string, token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  let expected: string;
  try {
    expected = generateUnsubscribeToken(email, productId);
  } catch {
    return false;
  }
  if (expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Constant-time comparison of two arbitrary UTF-8 strings (length-guarded).
 * Used for shared-secret checks on cron/webhook endpoints (R-SEC-5).
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

/**
 * HMAC-SHA256 signature scheme for the postback webhook
 * (src/app/api/postbacks/route.ts — NFR-SEC-4/6, T-INF-7).
 *
 * Signs `${timestampSeconds}.${message}` with WEBHOOK_SECRET. `message` is
 * whatever was actually signed on the sender's side — for POST that's the
 * exact raw request body bytes (NOT a re-serialized JSON.stringify — key
 * order / whitespace must round-trip byte-for-byte or a legitimate signature
 * won't verify); for GET (no body) it's the canonicalized query string, see
 * canonicalizePostbackQuery in the route. Binding the timestamp INTO the
 * signature means a captured signature cannot be replayed against a
 * different timestamp — see verifyPostbackSignature and the route's
 * replay-window + one-time-claim checks for the rest of the defense.
 *
 * POST requires this signature unconditionally (no fallback). GET accepts it
 * as the preferred path (via `ts`/`sig` query params) but still falls back to
 * a bare shared secret for networks that cannot attach anything beyond query
 * params to a pixel URL — see the route's top-level comment for the full
 * POST-required / GET-recommended rationale.
 */
export function signPostbackBody(secret: string, timestampSeconds: number, message: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestampSeconds}.${message}`).digest('hex');
}

/**
 * Timing-safe verification of a postback signature. Fails closed on any
 * malformed input (mirrors verifyUnsubscribeToken's shape).
 */
export function verifyPostbackSignature(
  secret: string,
  timestampSeconds: number,
  message: string,
  signatureHex: string,
): boolean {
  if (!signatureHex || typeof signatureHex !== 'string') return false;
  let expected: string;
  try {
    expected = signPostbackBody(secret, timestampSeconds, message);
  } catch {
    return false;
  }
  if (expected.length !== signatureHex.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}
