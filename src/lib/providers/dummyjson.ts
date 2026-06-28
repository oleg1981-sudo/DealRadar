/**
 * DummyJSON provider — a FREE, no-key "real API" test feed.
 *
 * Purpose: exercise the entire live-API path (real network fetch → normalize →
 * NormalizedDeal → registry → Supabase upsert → UI) WITHOUT any affiliate
 * approval, company, API key, or commission. The catalogue is synthetic but the
 * integration is 100% real — a dress rehearsal for Kelkoo (kelkoo.ts), which
 * later just slots in at a higher priority once you have KELKOO_API_TOKEN.
 *
 * API: https://dummyjson.com/products  (public, no auth). Returns price +
 * discountPercentage, which is exactly what a deals site needs.
 *
 * To run the site purely on this feed (no mock blending), set
 *   DEALRADAR_ONLY_PROVIDER=dummyjson
 * (see registry.ts). Unset it to restore the normal multi-provider order.
 */
import {
  type CountryCode, type CategorySlug, type DealQuery, type NormalizedDeal,
  type PriceProvider, type ProviderHealth, SUPPORTED_COUNTRIES,
  ProviderError, computeDiscountPercent,
} from './types';
import { mapExternalCategory } from './category-map';
import { queryTokens } from '../utils/search-tokens';

const BASE = 'https://dummyjson.com';
const CACHE_TTL_MS = 5 * 60 * 1000;

/** DummyJSON taxonomy → DealRadar slug (its category names don't match ours). */
const DJ_CATEGORY: Record<string, CategorySlug> = {
  smartphones: 'electronics', laptops: 'electronics', tablets: 'electronics',
  'mobile-accessories': 'electronics',
  beauty: 'beauty', fragrances: 'beauty', 'skin-care': 'beauty',
  groceries: 'food-grocery',
  furniture: 'home-garden', 'home-decoration': 'home-garden', 'kitchen-accessories': 'home-garden',
  'mens-shirts': 'fashion', 'mens-shoes': 'fashion', 'mens-watches': 'fashion',
  'womens-bags': 'fashion', 'womens-dresses': 'fashion', 'womens-jewellery': 'fashion',
  'womens-shoes': 'fashion', 'womens-watches': 'fashion', sunglasses: 'fashion', tops: 'fashion',
  'sports-accessories': 'sports',
  motorcycle: 'automotive', vehicle: 'automotive',
};

/** Placeholder retailer names so the test feed looks like a multi-shop aggregator. */
const TEST_SHOPS = ['TechMart', 'EuroShop', 'PriceHub', 'MegaStore', 'DealHaus', 'ShopBox', 'Bazaaro'];

/** Local currency + approximate EUR→local FX, so prices match the chosen market. */
const CURRENCY: Partial<Record<CountryCode, { code: string; rate: number }>> = {
  GB: { code: 'GBP', rate: 0.85 }, CH: { code: 'CHF', rate: 0.96 },
  PL: { code: 'PLN', rate: 4.3 }, SE: { code: 'SEK', rate: 11.3 },
  DK: { code: 'DKK', rate: 7.46 }, NO: { code: 'NOK', rate: 11.5 },
  RO: { code: 'RON', rate: 4.97 },
}; // everything else uses EUR (rate 1)

/** Plausible local retailers per market, so "View at" shows a real local shop. */
const SHOPS_BY_COUNTRY: Partial<Record<CountryCode, string[]>> = {
  DE: ['MediaMarkt', 'Otto', 'Saturn', 'Lidl', 'Zalando'],
  AT: ['MediaMarkt', 'Universal', 'Conrad', 'XXXLutz'],
  FR: ['Fnac', 'Cdiscount', 'Darty', 'La Redoute'],
  ES: ['El Corte Inglés', 'PcComponentes', 'MediaMarkt', 'Carrefour'],
  IT: ['MediaWorld', 'Unieuro', 'ePrice', 'Euronics'],
  PL: ['Allegro', 'Media Expert', 'x-kom', 'RTV Euro AGD', 'Empik'],
  NL: ['Bol', 'Coolblue', 'MediaMarkt', 'Wehkamp'],
  PT: ['Worten', 'Fnac', 'PCDIGA', 'El Corte Inglés'],
  BE: ['Coolblue', 'MediaMarkt', 'Vanden Borre', 'Bol'],
  SE: ['Elgiganten', 'NetOnNet', 'Webhallen', 'CDON'],
  DK: ['Elgiganten', 'Power', 'Bilka', 'Proshop'],
  FI: ['Verkkokauppa', 'Gigantti', 'Power', 'Telia'],
  NO: ['Elkjøp', 'Power', 'Komplett', 'XXL'],
  CH: ['Digitec', 'Galaxus', 'MediaMarkt', 'Microspot'],
  GB: ['Currys', 'Argos', 'John Lewis', 'Very'],
  RO: ['eMAG', 'Altex', 'Flanco', 'PC Garage'],
};

/** Deterministic [0,1) hash from a string (FNV-1a based). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^= h >>> 16) >>> 0) / 4294967296;
}

interface DummyProduct {
  id: number;
  title: string;
  price: number;
  discountPercentage?: number;
  brand?: string;
  category: string;
  thumbnail?: string;
  images?: string[];
  meta?: { barcode?: string };
}

export class DummyJsonProvider implements PriceProvider {
  readonly id = 'dummyjson';
  readonly displayName = 'DummyJSON (test feed)';
  readonly supportedCountries: CountryCode[] = [...SUPPORTED_COUNTRIES];
  readonly priority = 1; // preferred over the mock fallbacks during testing

  private cache?: { at: number; products: DummyProduct[] };

  async init(): Promise<ProviderHealth> {
    console.warn('[dummyjson] live TEST feed active — real API, synthetic catalogue, no commission.');
    return { ok: true, isMock: false };
  }

  private async load(): Promise<DummyProduct[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_TTL_MS) return this.cache.products;
    const url = `${BASE}/products?limit=100&select=id,title,price,discountPercentage,brand,category,thumbnail,images,meta`;
    let res = await fetch(url, { cache: 'no-store' });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, 800)); // brief backoff on rate-limit, then one retry
      res = await fetch(url, { cache: 'no-store' });
    }
    if (!res.ok) throw new ProviderError(this.id, res.status === 429 || res.status >= 500, `HTTP ${res.status}`);
    const data = (await res.json()) as { products?: DummyProduct[] };
    const products = data.products ?? [];
    this.cache = { at: now, products };
    return products;
  }

  async fetchDeals(query: DealQuery): Promise<NormalizedDeal[]> {
    let products: DummyProduct[];
    try {
      products = await this.load();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError(this.id, true, `fetch failed: ${String(e)}`);
    }

    // Each product is "available" in ~55% of markets, deterministic per country,
    // so every country gets its own distinct (overlapping) selection. A real
    // provider returns country-specific deals natively — this just mimics it.
    let deals = products
      .filter((p) => hash01(`${p.id}|${query.country}`) > 0.45)
      .map((p) => this.normalize(p, query.country))
      .filter((d): d is NormalizedDeal => d !== null);

    if (query.category) deals = deals.filter((d) => d.category === query.category);
    if (query.minDiscountPercent) deals = deals.filter((d) => d.discountPercent >= query.minDiscountPercent!);
    for (const tok of query.q ? queryTokens(query.q) : []) {
      deals = deals.filter((d) => `${d.productName} ${d.brand ?? ''}`.toLowerCase().includes(tok));
    }

    const offset = query.offset ?? 0;
    return deals.slice(offset, offset + (query.limit ?? 50));
  }

  private normalize(p: DummyProduct, country: CountryCode): NormalizedDeal | null {
    const eur = Number(p.price);
    const discount = Number(p.discountPercentage) || 0;
    if (!Number.isFinite(eur) || eur <= 0) return null;
    const cur = CURRENCY[country] ?? { code: 'EUR', rate: 1 };
    const original = Math.round(eur * cur.rate * 100) / 100; // priced in the local currency
    const sale = Math.round(original * (1 - discount / 100) * 100) / 100;
    const discountPercent = computeDiscountPercent(original, sale);
    if (discountPercent === 0) return null; // deals aggregator: skip non-discounted offers
    const shops = SHOPS_BY_COUNTRY[country] ?? TEST_SHOPS;
    return {
      // Country-scoped so the same product in two markets is two distinct rows
      // (the deals table is keyed by product_id).
      productId: `dummyjson:${country.toLowerCase()}:${p.id}`,
      productName: p.title,
      shopName: shops[p.id % shops.length],
      // Test feed has no real storefronts, so link to a product search instead.
      // Real providers (e.g. Kelkoo) supply the actual merchant deeplink here.
      shopUrl: `https://www.google.com/search?q=${encodeURIComponent(p.title)}`,
      shopLogoUrl: null,
      originalPrice: original,
      salePrice: sale,
      discountPercent,
      currency: cur.code,
      category: DJ_CATEGORY[p.category] ?? mapExternalCategory(p.category),
      brand: p.brand ?? null,
      imageUrl: p.thumbnail ?? p.images?.[0] ?? null,
      country,
      city: null,
      isSponsored: true,
      source: this.id,
      lastUpdated: new Date().toISOString(),
      eanCode: p.meta?.barcode ?? null,
    };
  }
}
