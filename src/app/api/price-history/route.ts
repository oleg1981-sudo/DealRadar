/**
 * GET /api/price-history?productId=awin:12345
 * Recorded daily prices for one deal (oldest → newest), for the cardiogram.
 * History only grows once a day, so the 30-min Redis TTL is comfortably fresh.
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryPriceHistory } from '@/lib/db/price-history.repo';
import { cacheGet, cacheKey, cacheSet } from '@/lib/cache/redis';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const productId = req.nextUrl.searchParams.get('productId') ?? '';
  // provider-prefixed ids like "awin:12345" — reject junk before it hits the DB
  if (!/^[a-z0-9]+:[\w.-]{1,64}$/i.test(productId)) {
    return NextResponse.json({ error: 'bad_product_id' }, { status: 400 });
  }

  const key = cacheKey('price-history', { productId });
  const cached = await cacheGet<unknown[]>(key);
  if (cached) {
    return NextResponse.json({ points: cached, cached: true });
  }

  try {
    const points = await queryPriceHistory(productId);
    await cacheSet(key, points);
    return NextResponse.json({ points, cached: false });
  } catch (e) {
    console.error('[api/price-history]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
