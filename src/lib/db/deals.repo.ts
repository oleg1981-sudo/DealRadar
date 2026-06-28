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
import { slugify } from '../utils/slug';
import type { CategorySlug, CountryCode, DealQuery, NormalizedDeal } from '../providers/types';

const TABLE = 'deals';

/** Camel ⇄ snake mapping for the deals table. */
function toRow(d: NormalizedDeal) {
  const generatedSlug = d.slug || `${slugify(d.productName)}-${d.productId.replace(/[^a-z0-9]/gi, '-')}`;
  return {
    product_id: d.productId, product_name: d.productName, shop_name: d.shopName,
    shop_url: d.shopUrl, shop_logo_url: d.shopLogoUrl, original_price: d.originalPrice,
    sale_price: d.salePrice, discount_percent: d.discountPercent, currency: d.currency,
    category: d.category, brand: d.brand, image_url: d.imageUrl, country: d.country,
    city: d.city, is_sponsored: d.isSponsored, source: d.source, last_updated: d.lastUpdated,
    slug: generatedSlug, ean_code: d.eanCode ?? null, upc_code: d.upcCode ?? null,
    mpn: d.mpn ?? null, model_number: d.modelNumber ?? null,
    historical_low_price: d.historicalLowPrice ?? null,
    merchant_id: d.merchantId ?? null, affiliate_subid: d.affiliateSubid ?? null,
  };
}

function fromRow(r: Record<string, unknown>): NormalizedDeal {
  const productId = r.product_id as string;
  const productName = r.product_name as string;
  const slug = (r.slug as string) || `${slugify(productName)}-${productId.replace(/[^a-z0-9]/gi, '-')}`;
  return {
    productId, productName,
    shopName: r.shop_name as string, shopUrl: r.shop_url as string,
    shopLogoUrl: (r.shop_logo_url as string) ?? null,
    originalPrice: Number(r.original_price), salePrice: Number(r.sale_price),
    discountPercent: Number(r.discount_percent), currency: r.currency as string,
    category: r.category as CategorySlug, brand: (r.brand as string) ?? null,
    imageUrl: (r.image_url as string) ?? null, country: r.country as CountryCode,
    city: (r.city as string) ?? null, isSponsored: Boolean(r.is_sponsored),
    source: r.source as string, lastUpdated: r.last_updated as string,
    slug, eanCode: (r.ean_code as string) ?? null, upcCode: (r.upc_code as string) ?? null,
    mpn: (r.mpn as string) ?? null, modelNumber: (r.model_number as string) ?? null,
    historicalLowPrice: r.historical_low_price != null ? Number(r.historical_low_price) : null,
    merchantId: (r.merchant_id as string) ?? null, affiliateSubid: (r.affiliate_subid as string) ?? null,
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

  let q = supabase().from(TABLE).select('*').eq('country', filters.country);
  // City scoping: prefer city matches but never exclude country-wide deals (city IS NULL).
  // Strip PostgREST or()-grammar metacharacters ( , ( ) " ) to prevent filter
  // injection from the user-supplied city param while keeping real names intact.
  if (filters.city) {
    const city = filters.city.replace(/[(),"]/g, '').trim().slice(0, 100);
    if (city) q = q.or(`city.eq.${city},city.is.null`);
  }
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

export async function getDealBySlug(slug: string, country?: CountryCode): Promise<NormalizedDeal | null> {
  if (!slug) return null;
  if (!supabaseConfigured()) {
    const deals = await fetchDealsAcrossProviders({ country: country || 'DE', limit: 500 });
    return deals.find((d) => d.slug === slug || slugify(d.productName) === slug) || null;
  }
  let q = supabase().from(TABLE).select('*').eq('slug', slug);
  if (country) q = q.eq('country', country);
  const { data, error } = await q.maybeSingle();
  if (error) {
    console.error(`[deals.repo] getDealBySlug failed for ${slug}:`, error.message);
    return null;
  }
  return data ? fromRow(data) : null;
}

/**
 * Deals whose row was written/updated since `sinceIso`. Used by the
 * /api/refresh-alerts pass so feed-ingested (AWIN) deals — which never flow
 * through the per-query refresh path — still trigger price-drop alerts.
 */
export async function getRecentlyUpdatedDeals(sinceIso: string): Promise<NormalizedDeal[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase()
    .from(TABLE)
    .select('*')
    .gte('last_updated', sinceIso)
    .order('last_updated', { ascending: false })
    .limit(5000);
  if (error) {
    console.error('[deals.repo] getRecentlyUpdatedDeals failed:', error.message);
    return [];
  }
  return (data ?? []).map(fromRow);
}

/**
 * All persisted deal slugs (every partner/country) for the sitemap. Slugs are
 * globally unique, so one query covers Awin/Kelkoo/Tradedoubler/Strackr alike.
 * Dev/mock fallback samples the registry so the sitemap is non-empty locally.
 */
export async function getAllDealSlugs(limit = 5000): Promise<{ slug: string; lastUpdated: string }[]> {
  if (!supabaseConfigured()) {
    const deals = await fetchDealsAcrossProviders({ country: 'DE', limit: 200 });
    return deals.map((d) => ({ slug: d.slug || slugify(d.productName), lastUpdated: d.lastUpdated }));
  }
  const { data, error } = await supabase()
    .from(TABLE)
    .select('slug,last_updated')
    .not('slug', 'is', null)
    .limit(limit);
  if (error) {
    console.error('[deals.repo] getAllDealSlugs failed:', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({ slug: r.slug as string, lastUpdated: r.last_updated as string }));
}

export async function updateHistoricalLows(): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    const { error } = await supabase().rpc('update_historical_lows_batch');
    if (error) console.error('[deals.repo] updateHistoricalLows error:', error.message);
  } catch (e) {
    console.error('[deals.repo] updateHistoricalLows exception:', e);
  }
}

