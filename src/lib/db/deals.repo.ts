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
  sort?: 'discount' | 'price-asc' | 'price-desc' | 'newest' | 'random';
  /** Stable shuffle seed for sort:'random' — pagination links carry it so
   *  pages 2…n continue the SAME shuffle instead of re-rolling per request. */
  seed?: number;
  /** Homepage only: also exclude deals flagged `homepage_hidden` (e.g. a merchant
   *  page whose displayed price changes after JS runs). Category/search pages
   *  leave this unset so those deals stay findable there. */
  excludeHomepageHidden?: boolean;
}

export interface PagedDeals {
  deals: NormalizedDeal[];
  /** Rows matching the filters, ignoring limit/offset (-1 when not counted). */
  total: number;
}

export async function queryDeals(filters: DealFilters): Promise<NormalizedDeal[]> {
  return (await runQuery(filters, false)).deals;
}

/**
 * Like queryDeals, but also returns the total match count and clamps the offset
 * onto the last page (?page=999 shows the final page instead of a PostgREST
 * out-of-range error). The browse pages use this for numbered pagination.
 */
export async function queryDealsPaged(filters: DealFilters): Promise<PagedDeals> {
  return runQuery(filters, true);
}

// Builder deliberately untyped: supabase-js generics add noise without safety here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDealFilters(q: any, filters: DealFilters): any {
  q = q.eq('country', filters.country).eq('hidden', false);
  if (filters.excludeHomepageHidden) q = q.eq('homepage_hidden', false);
  // City scoping: prefer city matches but never exclude country-wide deals
  // (city IS NULL). The value comes from a user-controlled cookie / query param
  // and is interpolated into a PostgREST or= filter, so it MUST be sanitized —
  // unquoted specials (, . ( ) ") would alter the filter or 400 the whole query.
  const city = sanitizeCity(filters.city);
  if (city) q = q.or(`city.eq."${city}",city.is.null`);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.brand) q = q.eq('brand', filters.brand);
  // Token-AND match: each term must appear in the product name or brand, so
  // menu terms like "OLED TVs" match "LG 4K OLED TV 55\"". Tokens are stripped
  // to letters/digits only by queryTokens (no PostgREST specials, no LIKE
  // wildcards), so they're safe to interpolate into ilike.
  for (const tok of filters.q ? queryTokens(filters.q) : []) {
    q = q.or(`product_name.ilike.%${tok}%,brand.ilike.%${tok}%`);
  }
  if (filters.minDiscountPercent) q = q.gte('discount_percent', filters.minDiscountPercent);
  if (filters.minPrice !== undefined) q = q.gte('sale_price', filters.minPrice);
  if (filters.maxPrice !== undefined) q = q.lte('sale_price', filters.maxPrice);
  return q;
}

// sort:'random' loads the whole (filtered) result set to shuffle it — cap it.
// Fine at the current catalogue size; revisit if a single filter set can exceed it.
const RANDOM_POOL_MAX = 1000;

async function runQuery(filters: DealFilters, withTotal: boolean): Promise<PagedDeals> {
  const limit = filters.limit ?? 24;

  if (!supabaseConfigured()) {
    // Mock-data dev path: country-scoped, filtered in memory.
    let deals = await fetchDealsAcrossProviders({ ...filters, limit: 500 });
    if (filters.brand) deals = deals.filter((d) => d.brand === filters.brand);
    if (filters.minPrice !== undefined) deals = deals.filter((d) => d.salePrice >= filters.minPrice!);
    if (filters.maxPrice !== undefined) deals = deals.filter((d) => d.salePrice <= filters.maxPrice!);
    const sorted = filters.sort === 'random'
      ? seededShuffle(deals, filters.seed ?? newSeed())
      : sortDeals(deals, filters.sort);
    const offset = clampOffset(filters.offset ?? 0, sorted.length, limit, withTotal);
    return { deals: sorted.slice(offset, offset + limit), total: withTotal ? sorted.length : -1 };
  }

  // Random order can't be expressed as a PostgREST `order`, and page N of a
  // fresh per-request shuffle would repeat/skip items. So: fetch the whole
  // filtered set once, shuffle it DETERMINISTICALLY from the seed (the pages
  // carry it in their links), then slice the requested page.
  if (filters.sort === 'random') {
    const { data, error } = await applyDealFilters(supabase().from(TABLE).select('*'), filters)
      .range(0, RANDOM_POOL_MAX - 1);
    if (error) throw new Error(`[deals.repo] query failed: ${error.message}`);
    const rows = (data ?? []) as Record<string, unknown>[];
    const all = seededShuffle(rows.map(fromRow), filters.seed ?? newSeed());
    const offset = clampOffset(filters.offset ?? 0, all.length, limit, withTotal);
    return { deals: all.slice(offset, offset + limit), total: withTotal ? all.length : -1 };
  }

  let total = -1;
  let offset = filters.offset ?? 0;
  if (withTotal) {
    const { count, error } = await applyDealFilters(
      supabase().from(TABLE).select('product_id', { count: 'exact', head: true }),
      filters,
    );
    if (error) throw new Error(`[deals.repo] count failed: ${error.message}`);
    total = count ?? 0;
    offset = clampOffset(offset, total, limit, true);
  }

  let q = applyDealFilters(supabase().from(TABLE).select('*'), filters);
  switch (filters.sort) {
    case 'price-asc': q = q.order('sale_price', { ascending: true }); break;
    case 'price-desc': q = q.order('sale_price', { ascending: false }); break;
    case 'newest': q = q.order('last_updated', { ascending: false }); break;
    default: q = q.order('discount_percent', { ascending: false });
  }
  q = q.range(offset, offset + limit - 1);

  const { data, error } = await q;
  if (error) throw new Error(`[deals.repo] query failed: ${error.message}`);
  return { deals: (data ?? []).map(fromRow), total };
}

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** Deterministic PRNG (mulberry32) — same seed, same shuffle, every request. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const rnd = mulberry32(seed);
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Clamp the offset onto the start of the last page. */
function clampOffset(offset: number, total: number, limit: number, withTotal: boolean): number {
  const safe = Math.max(0, offset);
  if (!withTotal || total <= 0) return safe;
  const lastPageStart = Math.floor((total - 1) / limit) * limit;
  return Math.min(safe, lastPageStart);
}

/**
 * Fetch specific deals by product id — used by the alert-notification pass to
 * compare current prices against subscribers' targets. Hidden (sold-out/gone)
 * deals are excluded: we never email about a deal we wouldn't show.
 */
export async function dealsByIds(productIds: string[]): Promise<NormalizedDeal[]> {
  if (!supabaseConfigured() || productIds.length === 0) return [];
  const out: NormalizedDeal[] = [];
  for (let i = 0; i < productIds.length; i += 100) {
    const { data, error } = await supabase()
      .from(TABLE)
      .select('*')
      .in('product_id', productIds.slice(i, i + 100))
      .eq('hidden', false);
    if (error) throw new Error(`[deals.repo] dealsByIds failed: ${error.message}`);
    out.push(...(data ?? []).map(fromRow));
  }
  return out;
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

/**
 * City names for the PostgREST filter: keep letters/digits/space/.-' (covers
 * "St. Gallen", "Frankfurt am Main", "Villingen-Schwenningen"), drop everything
 * else — including the PostgREST-reserved " , ( ) — and cap the length. The
 * kept charset contains nothing that can escape the double-quoted literal.
 */
function sanitizeCity(city: string | undefined): string | undefined {
  if (!city) return undefined;
  const clean = city.replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 80);
  return clean || undefined;
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
