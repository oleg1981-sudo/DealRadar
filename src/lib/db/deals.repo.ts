/**
 * Deal repository — the only module that talks to the `deals` table.
 *
 * Dev-mode behaviour: when Supabase is not configured, reads fall back to the
 * provider registry directly (mock data), so the app is fully browsable with
 * an empty .env. Writes are skipped with a warning.
 */
import 'server-only';
import { supabase, supabaseConfigured } from './supabase';
import { fetchDealsAcrossProviders } from '../providers/registry';
import { queryTokens } from '../utils/search-tokens';
import type { CategorySlug, CountryCode, DealQuery, NormalizedDeal } from '../providers/types';

const TABLE = 'deals';

/** Camel ⇄ snake mapping for the deals table. */
function toRow(d: NormalizedDeal) {
  return {
    product_id: d.productId, product_name: d.productName, shop_name: d.shopName,
    shop_url: d.shopUrl, shop_logo_url: d.shopLogoUrl, original_price: d.originalPrice,
    sale_price: d.salePrice, discount_percent: d.discountPercent, currency: d.currency,
    category: d.category, brand: d.brand, image_url: d.imageUrl,
    gallery: d.gallery ?? null, description: d.description ?? null,
    merchant_url: d.merchantUrl ?? null, country: d.country,
    city: d.city, is_sponsored: d.isSponsored, source: d.source, last_updated: d.lastUpdated,
  };
}

function fromRow(r: Record<string, unknown>): NormalizedDeal {
  return {
    productId: r.product_id as string, productName: r.product_name as string,
    shopName: r.shop_name as string, shopUrl: r.shop_url as string,
    shopLogoUrl: (r.shop_logo_url as string) ?? null,
    originalPrice: Number(r.original_price), salePrice: Number(r.sale_price),
    discountPercent: Number(r.discount_percent), currency: r.currency as string,
    category: r.category as CategorySlug, brand: (r.brand as string) ?? null,
    imageUrl: (r.image_url as string) ?? null,
    gallery: (r.gallery as string[]) ?? null, description: (r.description as string) ?? null,
    merchantUrl: (r.merchant_url as string) ?? null,
    country: r.country as CountryCode,
    city: (r.city as string) ?? null, isSponsored: Boolean(r.is_sponsored),
    source: r.source as string, lastUpdated: r.last_updated as string,
  };
}

export async function upsertDeals(deals: NormalizedDeal[]): Promise<number> {
  if (!supabaseConfigured()) {
    console.warn('[deals.repo] Supabase not configured — skipping persist of', deals.length, 'deals');
    return 0;
  }
  if (deals.length === 0) return 0;
  const { error } = await supabase().from(TABLE).upsert(deals.map(toRow), { onConflict: 'product_id' });
  if (error) throw new Error(`[deals.repo] upsert failed: ${error.message}`);
  return deals.length;
}

export interface DealFilters extends DealQuery {
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'discount' | 'price-asc' | 'price-desc' | 'newest';
  /** Homepage only: also exclude deals flagged `homepage_hidden` (e.g. a merchant
   *  page whose displayed price changes after JS runs). Category/search pages
   *  leave this unset so those deals stay findable there. */
  excludeHomepageHidden?: boolean;
}

export async function queryDeals(filters: DealFilters): Promise<NormalizedDeal[]> {
  if (!supabaseConfigured()) {
    // Mock-data dev path: country-scoped, filtered in memory.
    let deals = await fetchDealsAcrossProviders({ ...filters, limit: 500 });
    if (filters.brand) deals = deals.filter((d) => d.brand === filters.brand);
    if (filters.minPrice !== undefined) deals = deals.filter((d) => d.salePrice >= filters.minPrice!);
    if (filters.maxPrice !== undefined) deals = deals.filter((d) => d.salePrice <= filters.maxPrice!);
    return sortDeals(deals, filters.sort).slice(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 24));
  }

  let q = supabase().from(TABLE).select('*').eq('country', filters.country).eq('hidden', false);
  if (filters.excludeHomepageHidden) q = q.eq('homepage_hidden', false);
  // City scoping: prefer city matches but never exclude country-wide deals (city IS NULL).
  if (filters.city) q = q.or(`city.eq.${filters.city},city.is.null`);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.brand) q = q.eq('brand', filters.brand);
  // Token-AND match: each term must appear in the product name or brand, so
  // menu terms like "OLED TVs" match "LG 4K OLED TV 55\"". Tokens are stripped
  // to [a-z0-9] by queryTokens, so they're safe to interpolate into ilike.
  for (const tok of filters.q ? queryTokens(filters.q) : []) {
    q = q.or(`product_name.ilike.%${tok}%,brand.ilike.%${tok}%`);
  }
  if (filters.minDiscountPercent) q = q.gte('discount_percent', filters.minDiscountPercent);
  if (filters.minPrice !== undefined) q = q.gte('sale_price', filters.minPrice);
  if (filters.maxPrice !== undefined) q = q.lte('sale_price', filters.maxPrice);

  switch (filters.sort) {
    case 'price-asc': q = q.order('sale_price', { ascending: true }); break;
    case 'price-desc': q = q.order('sale_price', { ascending: false }); break;
    case 'newest': q = q.order('last_updated', { ascending: false }); break;
    default: q = q.order('discount_percent', { ascending: false });
  }
  q = q.range(filters.offset ?? 0, (filters.offset ?? 0) + (filters.limit ?? 24) - 1);

  const { data, error } = await q;
  if (error) throw new Error(`[deals.repo] query failed: ${error.message}`);
  return (data ?? []).map(fromRow);
}

export async function distinctBrands(country: CountryCode, category?: CategorySlug): Promise<string[]> {
  if (!supabaseConfigured()) {
    const deals = await fetchDealsAcrossProviders({ country, category, limit: 500 });
    return [...new Set(deals.map((d) => d.brand).filter((b): b is string => Boolean(b)))].sort();
  }
  // Supabase has no DISTINCT in the JS client; use the RPC defined in schema.sql.
  const { data, error } = await supabase().rpc('distinct_brands', {
    p_country: country,
    p_category: category ?? null,
  });
  if (error) throw new Error(`[deals.repo] distinct_brands failed: ${error.message}`);
  return ((data ?? []) as { brand: string }[]).map((r) => r.brand);
}

function sortDeals(deals: NormalizedDeal[], sort?: DealFilters['sort']): NormalizedDeal[] {
  const copy = [...deals];
  switch (sort) {
    case 'price-asc': return copy.sort((a, b) => a.salePrice - b.salePrice);
    case 'price-desc': return copy.sort((a, b) => b.salePrice - a.salePrice);
    case 'newest': return copy.sort((a, b) => b.lastUpdated.localeCompare(a.lastUpdated));
    default: return copy.sort((a, b) => b.discountPercent - a.discountPercent);
  }
}
