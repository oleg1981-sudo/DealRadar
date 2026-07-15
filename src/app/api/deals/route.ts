/**
 * GET /api/deals?country=DE&city=Berlin&category=electronics&limit=12
 *     &brand=&minDiscount=&minPrice=&maxPrice=&sort=&offset=
 * Serves from Redis (30-min TTL) → Supabase → (dev) mock providers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryDeals, type DealFilters } from '@/lib/db/deals.repo';
import { cacheGet, cacheKey, cacheSet, rateLimitDeals } from '@/lib/cache/redis';
import { isSupportedCountry } from '@/lib/geo/countries';
import { CATEGORY_SLUGS, type CategorySlug } from '@/lib/providers/types';
import { clientIp } from '@/lib/utils/request-ip';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { success } = await rateLimitDeals(clientIp(req));
  if (!success) {
    return NextResponse.json({ error: 'rate_limited', message: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  const p = req.nextUrl.searchParams;
  const country = p.get('country') ?? '';
  if (!isSupportedCountry(country)) {
    return NextResponse.json({ error: 'unsupported_country' }, { status: 400 });
  }
  const category = p.get('category') ?? undefined;
  if (category && !CATEGORY_SLUGS.includes(category as CategorySlug)) {
    return NextResponse.json({ error: 'unknown_category' }, { status: 400 });
  }

  const filters: DealFilters = {
    country,
    city: p.get('city') ?? undefined,
    category: category as CategorySlug | undefined,
    q: p.get('q') ?? undefined,
    brand: p.get('brand') ?? undefined,
    minDiscountPercent: num(p.get('minDiscount')),
    minPrice: num(p.get('minPrice')),
    maxPrice: num(p.get('maxPrice')),
    sort: (p.get('sort') as DealFilters['sort']) ?? 'discount',
    seed: num(p.get('seed')),
    limit: Math.min(num(p.get('limit')) ?? 24, 100),
    offset: num(p.get('offset')) ?? 0,
  };

  const key = cacheKey('deals', {
    country: filters.country, city: filters.city, category: filters.category,
    q: filters.q, brand: filters.brand, minDiscount: filters.minDiscountPercent,
    minPrice: filters.minPrice, maxPrice: filters.maxPrice,
    sort: filters.sort, seed: filters.seed, limit: filters.limit, offset: filters.offset,
  });

  const cached = await cacheGet<unknown[]>(key);
  if (cached) {
    return NextResponse.json({ deals: cached, cached: true });
  }

  try {
    const deals = await queryDeals(filters);
    await cacheSet(key, deals);
    return NextResponse.json({ deals, cached: false });
  } catch (e) {
    console.error('[api/deals]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}

function num(v: string | null): number | undefined {
  if (v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
