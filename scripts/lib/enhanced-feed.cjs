// AWIN enhanced-feed (Google Shopping format) normalizer — ingest-v2.
//
// Empirical schema (audit/2026-07-16_ingest-v2-google-feeds): 62 columns,
// byte-identical header across every active feed; UTF-8 with BOM; prices as
// "26.99 EUR"; availability enum in_stock/out_of_stock; `sale_price` EMPTY in
// every active feed today. Discounts for these advertisers are therefore
// DERIVED later (live-shop verifier reads Shopify compare-at; price history
// records drops) — rows normalized here land with discount 0 and are inserted
// hidden by the caller until a discount is proven. `aw_deep_link` is the
// monetized link and is mandatory: a row we can't attribute is worthless.
//
// Identity (M2 URL-spec D3, locked): product_id = awin:{COUNTRY}:adv{advertiserId}:{id}
// — countried from day one, with a tail that can never collide with classic
// `awin:{aw_product_id}` rows. This namespace is PERMANENT (public_id will be
// an md5 of it once M2 lands); never rename it.
//
// Dependency-free (Node built-ins only), same contract as description.cjs.
'use strict';

const PRICE_RE = /^(\d+(?:[.,]\d+)?) ?([A-Z]{3})$/;

/** "26.99 EUR" → { value, currency } | null (dot or comma decimals). */
function parseEnhancedPrice(s) {
  const m = PRICE_RE.exec((s || '').trim());
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? { value, currency: m[2] } : null;
}

// `google_product_category` is a TEXT taxonomy path ("Sporting Goods > Outdoor
// Recreation > Cycling > …") — map on the top-level segment. Unknown/empty
// paths return null; the caller falls back to its own rules and logs the path
// so the map can grow deliberately (never silently mis-shelve).
const GOOGLE_TOP_LEVEL = {
  'Electronics': 'electronics',
  'Cameras & Optics': 'electronics',
  'Software': 'electronics',
  'Office Supplies': 'electronics',
  'Apparel & Accessories': 'fashion',
  // Live feeds use AWIN's taxonomy name at the top level, not Google's
  // ("Clothing & Accessories" — 1,035 rows fell back on the first dry-run).
  'Clothing & Accessories': 'fashion',
  'Luggage & Bags': 'fashion',
  'Home & Garden': 'home-garden',
  'Furniture': 'home-garden',
  'Hardware': 'home-garden',
  'Animals & Pet Supplies': 'pets',
  'Business & Industrial': 'home-garden',
  'Sporting Goods': 'sports',
  'Health & Beauty': 'beauty',
  'Food, Beverages & Tobacco': 'food-grocery',
  'Toys & Games': 'toys',
  'Baby & Toddler': 'toys',
  'Arts & Entertainment': 'toys',
  'Vehicles & Parts': 'automotive',
  'Media': 'books',
};

/** Top-level Google taxonomy segment → CategorySlug, or null when unmapped. */
function mapGoogleCategory(pathText) {
  const top = String(pathText || '').split('>')[0].trim();
  if (!top) return null;
  return GOOGLE_TOP_LEVEL[top] || null;
}

/** gtin cleaned to the numeric form Google requires, or null. */
function cleanGtin(s) {
  const digits = String(s || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

/** `additional_image_link` is empty in every active feed today, but the spec
 *  allows a JSON array or a comma-separated list — accept both defensively. */
function parseAdditionalImages(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) ? arr.filter((u) => /^https?:\/\//.test(u)) : [];
    } catch { return []; }
  }
  return s.split(',').map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
}

/**
 * Normalize one enhanced-feed CSV record to a `deals` row (snake_case), or
 * null to skip. `g(name)` reads a column by header name ('' when absent).
 *
 * ctx: {
 *   country          — ISO country the catalog run targets (identity + row)
 *   allowedCurrencies — Set of ISO 4217 codes
 *   feedDescription  — shared text normalizer (scripts/lib/description.cjs)
 *   fallbackCategory — (title) => CategorySlug, used when the Google path is unmapped
 *   onUnmappedCategory — optional (pathText) => void, for the unmapped-path digest
 * }
 */
function normalizeEnhancedRow(g, ctx) {
  // Only currently-buyable, NEW-condition items: the PDP JSON-LD declares
  // NewCondition, so shipping a used/refurbished row would be a lie.
  if (g('availability').trim() !== 'in_stock') return null;
  const condition = g('condition').trim().toLowerCase();
  if (condition && condition !== 'new') return null;

  const advertiserId = g('advertiser_id').trim();
  const id = g('id').trim();
  const deepLink = g('aw_deep_link').trim();
  if (!advertiserId || !id || !deepLink) return null;

  // Drop prescription-only medicines — not advertisable to the public (HWG).
  // Optional-guarded so older callers without the predicate still work.
  if (ctx.isPrescriptionOnly && ctx.isPrescriptionOnly(g('title'), g('description'))) return null;

  const price = parseEnhancedPrice(g('price'));
  if (!price || !ctx.allowedCurrencies.has(price.currency)) return null;

  // Enhanced semantics INVERT the legacy ones: `price` is the base/was price,
  // `sale_price` (when present) is the deal price. Empty in every active feed
  // today — kept for the day advertisers start filling it.
  const sale = parseEnhancedPrice(g('sale_price'));
  const genuine = !!sale && sale.currency === price.currency && sale.value < price.value;
  const salePrice = genuine ? sale.value : price.value;
  const originalPrice = price.value;
  const discountPercent = genuine ? Math.round(((originalPrice - salePrice) / originalPrice) * 100) : 0;

  const googleCat = mapGoogleCategory(g('google_product_category'));
  if (!googleCat && g('google_product_category').trim() && ctx.onUnmappedCategory) {
    ctx.onUnmappedCategory(g('google_product_category').trim());
  }

  const gallery = [...new Set([g('image_link').trim(), ...parseAdditionalImages(g('additional_image_link'))]
    .filter((u) => /^https?:\/\//.test(u)))];

  return {
    product_id: `awin:${ctx.country}:adv${advertiserId}:${id}`,
    product_name: g('title').trim(),
    shop_name: g('advertiser_name').trim(),
    shop_url: deepLink,
    shop_logo_url: null,
    original_price: originalPrice,
    sale_price: salePrice,
    discount_percent: discountPercent,
    currency: price.currency,
    // Advertiser identity is the strongest signal for single-vertical
    // merchants (a pharmacy's product titles vary wildly but the shop is 100%
    // health), so it wins over the feed taxonomy and the title fallback.
    // Optional-guarded so older callers without the field still work.
    category: (ctx.advertiserCategory && ctx.advertiserCategory(g('advertiser_name')))
      ?? googleCat ?? ctx.fallbackCategory(g('title')),
    brand: g('brand').trim() || null,
    image_url: g('image_link').trim() || null,
    gallery: gallery.length ? gallery : null,
    description: ctx.feedDescription(g('description')),
    merchant_url: g('link').trim() || null, // direct shop URL → live-shop verifier (the discount-promotion engine)
    ean_code: cleanGtin(g('gtin')),
    mpn: g('mpn').trim() || null,
    model_number: null,
    merchant_sku: id, // the advertiser's own product id IS the enhanced `id`
    merchant_id: advertiserId,
    country: ctx.country,
    city: null,
    is_sponsored: true,
    source: 'awin',
    last_updated: new Date().toISOString(),
  };
}

module.exports = { parseEnhancedPrice, mapGoogleCategory, cleanGtin, parseAdditionalImages, normalizeEnhancedRow };
