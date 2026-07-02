/**
 * POST /api/alerts — subscribe an email to a product's price-drop alert.
 * Body: { email, productId, productName, price, currency }
 * Stored via alerts.repo; emails are sent later by the refresh job when the
 * product's sale price drops below `price`.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createPriceAlert, countActiveAlerts, MAX_ALERTS_PER_EMAIL } from '@/lib/db/alerts.repo';

export const runtime = 'nodejs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const productName = typeof body.productName === 'string' ? body.productName.slice(0, 300) : '';
  const currency = typeof body.currency === 'string' ? body.currency : '';
  const price = Number(body.price);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }
  if (!productId || !Number.isFinite(price) || price < 0) {
    return NextResponse.json({ error: 'invalid_product' }, { status: 400 });
  }

  try {
    // Per-email cap: prevents abusing this open endpoint to flood a third
    // party's inbox with alert subscriptions (each would email on a price drop).
    if ((await countActiveAlerts(email)) >= MAX_ALERTS_PER_EMAIL) {
      return NextResponse.json({ error: 'too_many_alerts' }, { status: 429 });
    }
    await createPriceAlert({ email, productId, productName, targetPrice: price, currency });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[api/alerts]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
