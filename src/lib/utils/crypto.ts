import crypto from 'crypto';

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
