/**
 * Kelkoo Group Shopping API provider — PRIMARY source.
 *
 * Registration: https://www.kelkoogroup.com (publisher sign-up). After approval,
 * your account manager creates an "application"; generate API tokens per country
 * in the Publisher Center (Account → API Token).
 * Docs: https://docs.kelkoogroup.com/for-publishers/
 * Endpoint family: https://api.kelkoogroup.net/publisher/shopping/v2/...
 * Auth: JWT bearer token (KELKOO_API_TOKEN).
 *
 * NOTE: Kelkoo's category taxonomy must be mapped to DealRadar slugs. The map
 * below covers top-level categories; extend per country as your account exposes
 * more verticals (taxonomy ids vary by locale — verify in the request builder:
 * https://requestbuilder.kelkoogroup.com).
 */
import {
  type CountryCode, type DealQuery, type NormalizedDeal, type PriceProvider,
  type ProviderHealth, type CategorySlug, ProviderError, computeDiscountPercent,
} from './types';
import { generateMockDeals } from './mock-data';

const KELKOO_BASE = 'https://api.kelkoogroup.net/publisher/shopping/v2';

/** DealRadar slug → Kelkoo search category hint (free-text fallback used when unmapped). */
const CATEGORY_HINT: Record<CategorySlug, string> = {
  electronics: 'electronics', fashion: 'fashion', 'home-garden': 'home garden',
  sports: 'sports', beauty: 'beauty health', 'food-grocery': 'food drink',
  toys: 'toys games', automotive: 'car accessories', books: 'books', travel: 'travel luggage',
};

export class KelkooProvider implements PriceProvider {
  readonly id = 'kelkoo';
  readonly displayName = 'Kelkoo Group';
  readonly supportedCountries: CountryCode[] = ['DE','AT','FR','ES','IT','PL','NL','PT','SE','RO','GB','BE','DK','FI','NO','CH'];
  readonly priority = 10;

  private token = process.env.KELKOO_API_TOKEN ?? '';
  private mock = false;

  async init(): Promise<ProviderHealth> {
    if (!this.token) {
      this.mock = true;
      const message =
        'KELKOO_API_TOKEN not set — using mock data. Apply at https://www.kelkoogroup.com (publisher sign-up), then create a token in the Publisher Center.';
      console.warn(`[kelkoo] ${message}`);
      return { ok: true, isMock: true, message };
    }
    return { ok: true, isMock: false };
  }

  async fetchDeals(query: DealQuery): Promise<NormalizedDeal[]> {
    if (this.mock) return generateMockDeals(this.id, query);

    const params = new URLSearchParams({
      country: query.country.toLowerCase(),
      limit: String(query.limit ?? 50),
      offset: String(query.offset ?? 0),
    });
    const text = [query.q, query.category ? CATEGORY_HINT[query.category] : '']
      .filter(Boolean).join(' ');
    if (text) params.set('query', text);
    if (query.minDiscountPercent) params.set('minDiscount', String(query.minDiscountPercent));

    const res = await fetch(`${KELKOO_BASE}/search/offers?${params}`, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
      // Upstream calls are only made from the cron refresh route; never per user request.
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new ProviderError(this.id, res.status === 429 || res.status >= 500, `HTTP ${res.status}`);
    }
    const data = (await res.json()) as { offers?: KelkooOffer[] };
    return (data.offers ?? [])
      .map((o) => this.normalize(o, query))
      .filter((d): d is NormalizedDeal => d !== null);
  }

  private normalize(o: KelkooOffer, query: DealQuery): NormalizedDeal | null {
    const sale = Number(o.price?.amount);
    const original = Number(o.previousPrice?.amount ?? o.price?.amount);
    if (!Number.isFinite(sale) || sale <= 0) return null;
    const discount = computeDiscountPercent(original, sale);
    if (discount === 0) return null; // deals aggregator: skip non-discounted offers
    return {
      productId: `kelkoo:${o.id}`,
      productName: o.title ?? 'Unknown product',
      shopName: o.merchant?.name ?? 'Unknown shop',
      shopUrl: o.goUrl ?? o.url ?? '',
      shopLogoUrl: o.merchant?.logoUrl ?? null,
      originalPrice: original,
      salePrice: sale,
      discountPercent: discount,
      currency: o.price?.currency ?? 'EUR',
      category: query.category ?? 'electronics',
      brand: o.brand?.name ?? null,
      imageUrl: o.images?.[0]?.url ?? null,
      country: query.country,
      city: null,
      isSponsored: true, // Kelkoo pays per click → always affiliate
      source: this.id,
      lastUpdated: new Date().toISOString(),
      eanCode: o.ean ?? o.gtin ?? null,
    };
  }
}

/** Minimal slice of Kelkoo's offer shape — verify against live docs before launch. */
interface KelkooOffer {
  id: string;
  title?: string;
  url?: string;
  goUrl?: string; // monetized redirect URL
  brand?: { name?: string };
  merchant?: { name?: string; logoUrl?: string };
  price?: { amount?: string | number; currency?: string };
  previousPrice?: { amount?: string | number };
  images?: { url?: string }[];
  ean?: string | null;
  gtin?: string | null;
}
