/**
 * Strackr provider — affiliate META-AGGREGATOR (SECONDARY).
 *
 * Strackr unifies many affiliate networks (Awin, CJ, TradeDoubler, Rakuten, …)
 * behind a single v3 REST API, so one integration yields products across every
 * network you've connected in your Strackr account.
 *
 * Registration: https://strackr.com → connect your networks, then read the
 * API credentials (api_id + api_key) at https://app.strackr.com/aa/credentials.
 * Docs: https://strackr.com/docs/affiliate-api
 * Base: https://api.strackr.com/v3 — auth via ?api_id=&api_key= query params.
 * Products tool: GET /v3/tools/products?query=… returns products (with the
 * monetized tracking URL) across connected advertiser feeds.
 *
 * NOTE: like kelkoo.ts / tradedoubler.ts, the response slice below is a
 * best-effort mapping — verify exact field names against the live OpenAPI before
 * launch. Missing credentials → mock data, so dev/preview still shows
 * Strackr-labelled deals.
 */
import {
  type CountryCode, type DealQuery, type NormalizedDeal, type PriceProvider,
  type ProviderHealth, ProviderError, computeDiscountPercent,
} from './types';
import { generateMockDeals } from './mock-data';
import { mapExternalCategory } from './category-map';

const STRACKR_BASE = 'https://api.strackr.com/v3';

export class StrackrProvider implements PriceProvider {
  readonly id = 'strackr';
  readonly displayName = 'Strackr';
  readonly supportedCountries: CountryCode[] = ['DE','AT','FR','ES','IT','PL','NL','PT','SE','RO','GB','BE','DK','FI','NO','CH'];
  readonly priority = 25; // between AWIN (20) and Tradedoubler (30)

  private apiId = process.env.STRACKR_API_ID ?? '';
  private apiKey = process.env.STRACKR_API_KEY ?? '';
  private mock = false;

  async init(): Promise<ProviderHealth> {
    if (!this.apiId || !this.apiKey) {
      this.mock = true;
      const message =
        'STRACKR_API_ID / STRACKR_API_KEY not set — using mock data. Connect your networks at https://strackr.com, then copy credentials from https://app.strackr.com/aa/credentials.';
      console.warn(`[strackr] ${message}`);
      return { ok: true, isMock: true, message };
    }
    return { ok: true, isMock: false };
  }

  async fetchDeals(query: DealQuery): Promise<NormalizedDeal[]> {
    if (this.mock) return generateMockDeals(this.id, query);

    const params = new URLSearchParams({
      api_id: this.apiId,
      api_key: this.apiKey,
      limit: String(query.limit ?? 50),
      offset: String(query.offset ?? 0),
    });
    if (query.q) params.set('query', query.q);
    if (query.category) params.set('category', query.category);

    const res = await fetch(`${STRACKR_BASE}/tools/products?${params}`, {
      headers: { Accept: 'application/json' },
      // Upstream calls happen only on the cron refresh path, never per user request.
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new ProviderError(this.id, res.status === 429 || res.status >= 500, `HTTP ${res.status}`);
    }
    const data = (await res.json()) as StrackrProductsResponse;
    // Strackr groups products under result entries (one per connection/advertiser).
    const rows: StrackrProduct[] = (data.results ?? []).flatMap((r) =>
      (r.products ?? []).map((p) => ({ ...p, advertiser: p.advertiser ?? r.advertiser })),
    );
    return rows
      .map((p) => this.normalize(p, query))
      .filter((d): d is NormalizedDeal => d !== null)
      .filter((d) => !query.minDiscountPercent || d.discountPercent >= query.minDiscountPercent);
  }

  private normalize(p: StrackrProduct, query: DealQuery): NormalizedDeal | null {
    const sale = Number(p.price ?? p.sale_price);
    const original = Number(p.old_price ?? p.regular_price ?? p.list_price ?? p.price ?? sale);
    if (!Number.isFinite(sale) || sale <= 0) return null;
    const discountPercent = computeDiscountPercent(original, sale);
    if (discountPercent === 0) return null; // deals aggregator: skip non-discounted offers
    const trackingUrl = p.tracking_url ?? p.url ?? p.link ?? '';
    if (!trackingUrl) return null;
    return {
      productId: `strackr:${p.id ?? p.ean ?? p.title}`,
      productName: p.title ?? p.name ?? 'Unknown product',
      shopName: p.advertiser?.name ?? p.merchant ?? 'Unknown shop',
      shopUrl: trackingUrl,
      shopLogoUrl: p.advertiser?.logo ?? null,
      originalPrice: original,
      salePrice: sale,
      discountPercent,
      currency: p.currency ?? 'EUR',
      category: query.category ?? mapExternalCategory(p.category ?? ''),
      brand: p.brand ?? null,
      imageUrl: p.image ?? p.image_url ?? null,
      country: query.country,
      city: null,
      isSponsored: true,
      source: this.id,
      lastUpdated: new Date().toISOString(),
      eanCode: p.ean ?? p.gtin ?? null,
      mpn: p.mpn ?? null,
      merchantId: p.advertiser?.id != null ? String(p.advertiser.id) : null,
    };
  }
}

/** Best-effort slice of Strackr's products response — verify against live docs. */
interface StrackrProductsResponse {
  results?: {
    advertiser?: StrackrAdvertiser;
    products?: StrackrProduct[];
  }[];
}

interface StrackrAdvertiser {
  id?: string | number;
  name?: string;
  logo?: string;
}

interface StrackrProduct {
  id?: string | number;
  title?: string;
  name?: string;
  price?: string | number;
  sale_price?: string | number;
  old_price?: string | number;
  regular_price?: string | number;
  list_price?: string | number;
  currency?: string;
  tracking_url?: string;
  url?: string;
  link?: string;
  image?: string;
  image_url?: string;
  brand?: string;
  category?: string;
  ean?: string | null;
  gtin?: string | null;
  mpn?: string | null;
  merchant?: string;
  advertiser?: StrackrAdvertiser;
}
