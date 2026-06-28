import crypto from 'crypto';

const SECRET = process.env.CRON_SECRET || 'dealradar-default-cron-secret';

/**
 * Generates an HMAC SHA-256 token for email unsubscribe requests.
 */
export function generateUnsubscribeToken(email: string, productId: string): string {
  const data = `${email.toLowerCase().trim()}:${productId}`;
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}

/**
 * Timing-safe verification of email unsubscribe tokens.
 */
export function verifyUnsubscribeToken(email: string, productId: string, token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const expected = generateUnsubscribeToken(email, productId);
  if (expected.length !== token.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(token, 'hex'));
  } catch {
    return false;
  }
}
