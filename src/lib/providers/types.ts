/**
 * PriceProvider abstraction — the core architectural contract of DealRadar.
 * APPROVED interface (2026-06-12). Do not change shapes without a migration plan:
 * every provider, the registry, the Supabase repo and the API routes depend on it.
 */

export const SUPPORTED_COUNTRIES = [
  'DE', 'AT', 'FR', 'ES', 'IT', 'PL', 'NL', 'PT', 'SE', 'RO',
  'GB', 'BE', 'DK', 'FI', 'NO', 'CH',
] as const;
export type CountryCode = (typeof SUPPORTED_COUNTRIES)[number];

export const CATEGORY_SLUGS = [
  'electronics', 'fashion', 'home-garden', 'sports', 'beauty',
  'food-grocery', 'toys', 'automotive', 'books', 'travel',
  'pets', 'health',
] as const;
export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

/** A single normalized deal — the only shape that ever leaves a provider. */
export interface NormalizedDeal {
  /** Provider-prefixed, globally unique: e.g. "kelkoo:12345". */
  productId: string;
  productName: string;
  shopName: string;
  /** Raw merchant / deeplink URL. Affiliate decoration is applied at render time. */
  shopUrl: string;
  shopLogoUrl: string | null;
  originalPrice: number;
  salePrice: number;
  /** Computed from prices when the provider omits it. */
  discountPercent: number;
  /** ISO 4217. */
  currency: string;
  /** Mapped from the provider taxonomy via the provider's own category map. */
  category: CategorySlug;
  brand: string | null;
  imageUrl: string | null;
  /** Extra real product images for the detail modal (provider feed). Optional. */
  gallery?: string[] | null;
  /** Real product description for the detail modal (provider feed). Optional. */
  description?: string | null;
  /**
   * Merchant-page description HTML, captured by the daily live-shop verifier
   * (reduced at write time, sanitized again at render). READ-ONLY for
   * providers/app writers — only scripts/verify-awin.cjs populates it.
   */
  descriptionHtml?: string | null;
  /** Direct merchant product URL (not the affiliate link) — for live price/stock verification. */
  merchantUrl?: string | null;
  country: CountryCode;
  city: string | null;
  /** True for every affiliate-derived deal — drives the "sponsored" badge. */
  isSponsored: boolean;
  /** Provider id, for debugging/attribution. */
  source: string;
  /** ISO 8601. */
  lastUpdated: string;
  /** Optional URL slug for SSR pages. */
  slug?: string;
  eanCode?: string | null;
  upcCode?: string | null;
  mpn?: string | null;
  modelNumber?: string | null;
  /** Merchant's own product ID (AWIN merchant_product_id) → JSON-LD Product.sku. */
  merchantSku?: string | null;
  historicalLowPrice?: number | null;
  merchantId?: string | null;
  affiliateSubid?: string | null;
  /**
   * True when the daily live-shop verifier marked this deal gone/sold-out/
   * undiscounted (`scripts/verify-awin.cjs`). Undefined/false for deals from
   * providers that don't track this (mock/dev fallback) — treat as visible.
   * Only `getDealBySlug` surfaces hidden rows; other read paths still filter
   * them out at the query level (sitemap, list/search, alert reconciliation).
   */
  hidden?: boolean;
}

export interface DealQuery {
  country: CountryCode;
  city?: string;
  category?: CategorySlug;
  /** Free-text search. */
  q?: string;
  minDiscountPercent?: number;
  /** Providers should respect this; default 50. */
  limit?: number;
  offset?: number;
}

export interface ProviderHealth {
  ok: boolean;
  isMock: boolean;
  message?: string;
}

export interface PriceProvider {
  readonly id: string;
  readonly displayName: string;
  readonly supportedCountries: CountryCode[];
  /** Lower = preferred. The registry sorts providers by this, per country. */
  readonly priority: number;

  /**
   * Validates env/credentials at startup.
   * Mock fallbacks return { ok: true, isMock: true } and log a visible warning.
   */
  init(): Promise<ProviderHealth>;

  /**
   * Fetch deals matching the query.
   * MUST throw ProviderError (never return []) on upstream failure, so the
   * registry can distinguish "no deals" from "provider down" and fall through.
   */
  fetchDeals(query: DealQuery): Promise<NormalizedDeal[]>;

  /** Optional lightweight typeahead; registry falls back to fetchDeals({ q }). */
  searchSuggest?(q: string, country: CountryCode): Promise<NormalizedDeal[]>;
}

export class ProviderError extends Error {
  constructor(
    public providerId: string,
    public retryable: boolean,
    message: string,
  ) {
    super(`[${providerId}] ${message}`);
    this.name = 'ProviderError';
  }
}

/** Guard: recompute / clamp discount so bad upstream data never renders "-3000%". */
export function computeDiscountPercent(original: number, sale: number): number {
  if (!Number.isFinite(original) || !Number.isFinite(sale) || original <= 0 || sale < 0 || sale > original) {
    return 0;
  }
  return Math.round(((original - sale) / original) * 100);
}
