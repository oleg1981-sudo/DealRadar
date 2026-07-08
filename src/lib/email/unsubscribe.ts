/**
 * Unsubscribe-link signing for alert emails (GDPR/PECR: every marketing-ish
 * email needs a working opt-out). The link carries an HMAC of the email address
 * so only the mail's recipient can unsubscribe that address — no DB token
 * column needed. Keyed off CRON_SECRET (already required for the refresh cron);
 * when it's unset (bare dev env) no link can be built or verified.
 */
import 'server-only';
import { createHmac, timingSafeEqual } from 'crypto';

function secret(): string | null {
  return process.env.CRON_SECRET || null;
}

export function unsubscribeToken(email: string): string | null {
  const s = secret();
  if (!s) return null;
  return createHmac('sha256', s).update(email.trim().toLowerCase()).digest('hex').slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = unsubscribeToken(email);
  if (!expected || !token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

/** Absolute site origin for links in emails (Netlify injects URL; fallback = prod domain). */
export function siteOrigin(): string {
  return (process.env.URL || 'https://dealradar.me').replace(/\/+$/, '');
}

export function unsubscribeUrl(email: string): string | null {
  const token = unsubscribeToken(email);
  if (!token) return null;
  return `${siteOrigin()}/api/alerts/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}
