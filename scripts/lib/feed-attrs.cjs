// Feed-attrs collection [FR-2.1, docs/specs/pdp-full-content/2026-07-16_v1]:
// every non-empty feed column that is NOT already mapped to a first-class
// deals column lands in deals.feed_attrs (jsonb) — "fetch everything the feed
// offers, keep what's populated". Values are clamped; tracking/noise columns
// are excluded. Dependency-free, same contract as description.cjs.
'use strict';

const MAX_VALUE_LEN = 300;

// Columns already mapped to first-class deals columns (never duplicated into
// attrs), per normalizer.
const ENHANCED_MAPPED = new Set([
  'availability', 'advertiser_id', 'id', 'aw_deep_link', 'price', 'sale_price',
  'google_product_category', 'image_link', 'additional_image_link', 'title',
  'advertiser_name', 'brand', 'description', 'link', 'gtin', 'mpn',
]);
const LEGACY_MAPPED = new Set([
  'in_stock', 'currency', 'search_price', 'rrp_price', 'product_price_old',
  'aw_product_id', 'aw_deep_link', 'aw_image_url', 'large_image',
  'alternate_image', 'alternate_image_two', 'alternate_image_three',
  'alternate_image_four', 'description', 'product_short_description',
  'product_name', 'merchant_name', 'category_name', 'merchant_category',
  'brand_name', 'merchant_image_url', 'merchant_deep_link', 'ean',
  'product_GTIN', 'mpn', 'model_number', 'product_model',
  'merchant_product_id', 'merchant_id',
]);
// Tracking/duplicate-link noise — of no PDP/SEO value, never stored.
const NOISE = new Set([
  'mobile_link', 'ads_redirect', 'canonical_link', 'aw_image_url',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3',
  'custom_label_4', 'promotion_id', 'display_ads_link', 'merchant_thumb_url',
  'aw_thumb_url', 'data_feed_id', 'promotional_text', 'commission_group',
]);

/** Build a collector bound to a feed's header list. Returns (g) => attrs|null. */
function makeAttrCollector(headers, format, onFill) {
  const mapped = format === 'google' ? ENHANCED_MAPPED : LEGACY_MAPPED;
  const cols = (headers || []).filter((h) => h && !mapped.has(h) && !NOISE.has(h));
  return (g) => {
    const attrs = {};
    for (const h of cols) {
      const v = String(g(h) || '').trim();
      if (!v) continue;
      attrs[h] = v.length > MAX_VALUE_LEN ? `${v.slice(0, MAX_VALUE_LEN)}…` : v;
      if (onFill) onFill(h);
    }
    return Object.keys(attrs).length ? attrs : null;
  };
}

/** Per-advertiser × per-column non-empty counters over KEPT rows [EC-5]. */
class FillRates {
  constructor() { this.byAdv = new Map(); }
  bump(advId, col) {
    let a = this.byAdv.get(advId);
    if (!a) { a = { rows: 0, cols: new Map() }; this.byAdv.set(advId, a); }
    a.cols.set(col, (a.cols.get(col) || 0) + 1);
  }
  row(advId) {
    let a = this.byAdv.get(advId);
    if (!a) { a = { rows: 0, cols: new Map() }; this.byAdv.set(advId, a); }
    a.rows++;
  }
  /** Compact {adv: {rows, cols: {col: pct}}} for ops_metrics.meta. */
  summary() {
    const out = {};
    for (const [adv, a] of this.byAdv) {
      const cols = {};
      for (const [c, n] of a.cols) cols[c] = a.rows ? Math.round((n / a.rows) * 100) : 0;
      out[adv] = { rows: a.rows, cols };
    }
    return out;
  }
  /** Pinned log grammar [EC-5]: `[ingest] fill-rate adv=<id> col=<col> pct=<n>`. */
  logLines() {
    const lines = [];
    for (const [adv, a] of this.byAdv) {
      for (const [c, n] of a.cols) {
        const pct = a.rows ? Math.round((n / a.rows) * 100) : 0;
        if (pct > 0) lines.push(`[ingest] fill-rate adv=${adv} col=${c} pct=${pct}`);
      }
    }
    return lines;
  }
}

module.exports = { makeAttrCollector, FillRates, ENHANCED_MAPPED, LEGACY_MAPPED, NOISE, MAX_VALUE_LEN };
