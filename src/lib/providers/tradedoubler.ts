/**
 * Tradedoubler Products API provider — TERTIARY source (strong Nordics + PL/RO).
 *
 * Registration: https://www.tradedoubler.com → publisher sign-up → join
 * programmes → My Account → Manage Tokens for the Products REST API token.
 * Docs: https://dev.tradedoubler.com/products/publisher/
 * Endpoint: https://api.tradedoubler.com/1.0/products.json;q=...?token=...
 */
import {
  type CountryCode, type DealQuery, type NormalizedDeal, type PriceProvider,
  type ProviderHealth, ProviderError, computeDiscountPercent,
} from './types';
import { generateMockDeals } from './mock-data';
import { mapExternalCategory } from './category-map';

const TD_BASE = 'https://api.tradedoubler.com/1.0';

export class TradedoublerProvider implements PriceProvider {
  readonly id = 'tradedoubler';
  readonly displayName = 'Tradedoubler';
  readonly supportedCountries: CountryCode[] = ['SE','DK','FI','NO','PL','RO','DE','FR','ES','IT','NL','GB','CH','BE'];
  readonly priority = 30;

  private token = process.env.TRADEDOUBLER_TOKEN ?? '';
  private mock = false;

  async init(): Promise<ProviderHealth> {
    if (!this.token) {
      this.mock = true;
      const message =
        'TRADEDOUBLER_TOKEN not set — using mock data. Apply at https://www.tradedoubler.com (publisher sign-up), then create a token under My Account → Manage Tokens.';
      console.warn(`[tradedoubler] ${message}`);
      return { ok: true, isMock: true, message };
    }
    return { ok: true, isMock: false };
  }

  async fetchDeals(query: DealQuery): Promise<NormalizedDeal[]> {
    if (this.mock) return generateMockDeals(this.id, query);

    // Matrix-parameter style per Tradedoubler docs; language ≈ country for our use.
    const matrix = [
      query.q ? `q=${encodeURIComponent(query.q)}` : '',
      `language=${query.country.toLowerCase()}`,
      `limit=${query.limit ?? 50}`,
      `page=${Math.floor((query.offset ?? 0) / (query.limit ?? 50)) + 1}`,
    ].filter(Boolean).join(';');

    const res = await fetch(`${TD_BASE}/products.json;${matrix}?token=${this.token}`, { cache: 'no-store' });
    if (!res.ok) {
      throw new ProviderError(this.id, res.status === 429 || res.status >= 500, `HTTP ${res.status}`);
    }
    const data = (await res.json()) as { products?: TdProduct[] };
    return (data.products ?? [])
      .map((p) => this.normalize(p, query.country))
      .filter((d): d is NormalizedDeal => d !== null)
      .filter((d) => !query.minDiscountPercent || d.discountPercent >= query.minDiscountPercent);
  }

  private normalize(p: TdProduct, country: CountryCode): NormalizedDeal | null {
    const offer = p.offers?.[0];
    if (!offer) return null;
    const sale = Number(offer.priceHistory?.[0]?.price?.value ?? NaN);
    const original = Number(p.previousPrice?.value ?? sale);
    if (!Number.isFinite(sale) || sale <= 0) return null;
    const discountPercent = computeDiscountPercent(original, sale);
    if (discountPercent === 0) return null;
    return {
      productId: `tradedoubler:${offer.id ?? p.identifiers?.sku ?? p.name}`,
      productName: p.name ?? 'Unknown product',
      shopName: offer.programName ?? 'Unknown shop',
      shopUrl: offer.productUrl ?? '',
      shopLogoUrl: null,
      originalPrice: original,
      salePrice: sale,
      discountPercent,
      currency: offer.priceHistory?.[0]?.price?.currency ?? 'EUR',
      category: mapExternalCategory(p.categories?.[0]?.name ?? ''),
      brand: p.brand ?? null,
      imageUrl: p.productImage?.url ?? null,
      country,
      city: null,
      isSponsored: true,
      source: this.id,
      lastUpdated: new Date().toISOString(),
      eanCode: p.identifiers?.ean ?? p.fields?.ean ?? null,
      mpn: p.identifiers?.mpn ?? null,
    };
  }
}

interface TdProduct {
  name?: string;
  brand?: string;
  previousPrice?: { value?: string | number };
  productImage?: { url?: string };
  identifiers?: { sku?: string; ean?: string | null; mpn?: string | null };
  fields?: { ean?: string | null };
  categories?: { name?: string }[];
  offers?: {
    id?: string;
    programName?: string;
    productUrl?: string;
    priceHistory?: { price?: { value?: string | number; currency?: string } }[];
  }[];
}
