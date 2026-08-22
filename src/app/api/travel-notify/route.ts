/**
 * POST /api/travel-notify — register an email for the TravelDeal launch.
 * Body: { email, locale, sourceSlug? }
 *
 * Separate from /api/alerts on purpose: that subscribes to ONE product's price
 * drop and needs productId/targetPrice. This is a one-shot "tell me when this
 * section exists", so conflating them would mean storing fake product data.
 *
 * Reuses rateLimitAlerts — same abuse shape (an unauthenticated email form),
 * same budget, and no reason to invent a second bucket.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createTravelSignup } from '@/lib/db/travel-signups.repo';
import { rateLimitAlerts } from '@/lib/cache/redis';
import { clientIp } from '@/lib/utils/request-ip';
import { LOCALES, type Locale } from '@/i18n/routing';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LEN = 254; // RFC 5321
const MAX_SLUG_LEN = 64;

export async function POST(req: NextRequest) {
  const { success } = await rateLimitAlerts(clientIp(req));
  if (!success) {
    return NextResponse.json(
      { error: 'rate_limited', message: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || email.length > MAX_EMAIL_LEN || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const rawLocale = typeof body.locale === 'string' ? body.locale : '';
  const locale: Locale = (LOCALES as readonly string[]).includes(rawLocale)
    ? (rawLocale as Locale)
    : 'en';

  // Only ever stored, never rendered back — but bound the length so a caller
  // cannot use it to write arbitrarily large rows.
  const rawSlug = typeof body.sourceSlug === 'string' ? body.sourceSlug.trim() : '';
  const sourceSlug = rawSlug && rawSlug.length <= MAX_SLUG_LEN ? rawSlug : null;

  try {
    const result = await createTravelSignup({ email, locale, sourceSlug });
    // 'already_subscribed' and 'not_configured' are both successes from the
    // visitor's point of view: they asked to be told, and they will be.
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[travel-notify]', (e as Error).message);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
