/**
 * GET /api/search?q=...&country=DE&limit=8
 * Typeahead endpoint: products + matched categories + matched brands,
 * grouped for the dropdown panel. Cached 5 min (shorter than deals — queries
 * are long-tail and the index churns).
 */
import { NextRequest, NextResponse } from 'next/server';
import { queryDeals, distinctBrands } from '@/lib/db/deals.repo';
import { cacheGet, cacheKey, cacheSet, rateLimitSearch } from '@/lib/cache/redis';
import { isSupportedCountry } from '@/lib/geo/countries';
import { CATEGORIES } from '@/lib/categories';
import { clientIp } from '@/lib/utils/request-ip';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { success } = await rateLimitSearch(clientIp(req));
  if (!success) {
    return NextResponse.json({ error: 'rate_limited', message: 'Too many search requests. Please slow down.' }, { status: 429 });
  }

  const p = req.nextUrl.searchParams;
  const q = (p.get('q') ?? '').trim();
  const country = p.get('country') ?? '';
  const limit = Math.min(Number(p.get('limit') ?? 8), 20);

  if (q.length < 3) return NextResponse.json({ products: [], categories: [], brands: [] });
  if (!isSupportedCountry(country)) {
    return NextResponse.json({ error: 'unsupported_country' }, { status: 400 });
  }

  const key = cacheKey('search', { q: q.toLowerCase(), country, limit });
  const cached = await cacheGet<object>(key);
  if (cached) return NextResponse.json(cached);

  try {
    const [deals, brands] = await Promise.all([
      queryDeals({ country, q, limit, sort: 'discount' }),
      distinctBrands(country),
    ]);

    const ql = q.toLowerCase();
    const result = {
      products: deals.map((d) => ({
        productId: d.productId, productName: d.productName, imageUrl: d.imageUrl,
        salePrice: d.salePrice, currency: d.currency, discountPercent: d.discountPercent,
      })),
      categories: CATEGORIES.filter((c) => c.slug.replace('-', ' ').includes(ql)).map((c) => c.slug),
      brands: brands.filter((b) => b.toLowerCase().includes(ql)).slice(0, 5),
    };

    await cacheSet(key, result, 5 * 60);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[api/search]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
