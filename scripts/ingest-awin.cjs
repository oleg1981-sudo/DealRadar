// AWIN feed ingestion — the source of truth for live AWIN deals.
//
// AWIN serves one large combined PRODUCT FEED (gzipped CSV, ~300 MB / ~200k
// rows), not a per-query search API — so it cannot live behind the per-request
// provider path. This script downloads the feed once, keeps only the rows that
// are genuine in-stock discounts, normalises them to the `deals` table shape,
// and (with --upsert) writes them to Supabase. The user-facing app then reads
// those rows from Supabase exactly like any other provider's deals.
//
// Run it on a schedule (GitHub Action / cron). It is dependency-free (Node
// built-ins + Supabase REST) so it needs no `pnpm install` on the runner.
//
//   node scripts/ingest-awin.cjs              # dry-run: download, filter, print a summary + samples
//   node scripts/ingest-awin.cjs --upsert     # also upsert into Supabase (needs SUPABASE_* env)
//   node scripts/ingest-awin.cjs --limit 50   # cap kept rows (faster smoke test)
//   node scripts/ingest-awin.cjs --country AT  # tag rows with a different country (default DE)
//
// Required env (from .env.local or the CI environment):
//   AWIN_FEED_URL              the full datafeed download URL (CONTAINS YOUR API KEY — keep secret)
//   SUPABASE_URL               only needed for --upsert
//   SUPABASE_SERVICE_ROLE_KEY  only needed for --upsert (server-only, bypasses RLS)
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { feedDescription } = require('./lib/description.cjs');
const { normalizeEnhancedRow } = require('./lib/enhanced-feed.cjs');

// ── args & env ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const DO_UPSERT = has('--upsert');
const LIMIT = parseInt(opt('--limit', '0'), 10) || 0; // 0 = no cap
const COUNTRY = opt('--country', 'DE').toUpperCase();
const ALLOWED_CURRENCIES = new Set((opt('--currency', 'EUR')).toUpperCase().split(','));
const BATCH = 500;
// Ingest-v2 (audit/2026-07-16): additionally pull every ACTIVE Google-format
// feed via the feed-list endpoint. Google feeds are invisible to the
// category-based AWIN_FEED_URL and carry no sale_price — their rows land
// HIDDEN (discount 0) and the daily live-shop verifier promotes the genuinely
// discounted ones (it already reads Shopify compare-at prices and un-hides).
const ENHANCED = !has('--no-enhanced');
const PUBLISHER_ID = (process.env.AWIN_PUBLISHER_ID || '2951525').trim();
// Feed-list Language values are full names; only same-language feeds join the
// market's catalog (EN/NL feeds are a deliberate non-goal for now).
const ENHANCED_LANGUAGE = opt('--enhanced-language', 'German');
// Per-feed cap for LEGACY per-fid rows (top-N by discount). 0 = uncapped —
// the user's 2026-07-19 call: take everything (Aliva Apotheke alone ships
// 20k+ genuine UVP discounts). The flag stays as the emergency brake if
// capacity (Netlify usage, verifier, price_history) bites.
const LEGACY_FEED_CAP = parseInt(opt('--legacy-cap', '0'), 10) || 0;

loadEnvLocal();
const FEED_URL = process.env.AWIN_FEED_URL;
if (!FEED_URL) {
  console.error('AWIN_FEED_URL is not set. Put the AWIN datafeed download URL in .env.local or the environment.');
  process.exit(1);
}
// Tolerate a SUPABASE_URL secret that's missing the scheme or has a trailing slash.
function normalizeBaseUrl(u) {
  u = (u || '').trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}
const SUPABASE_URL = normalizeBaseUrl(process.env.SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// ── category mapping: AWIN `category_name` (clean English taxonomy) → our slug ──
// Exact matches first (precise for the high-volume categories), regex fallback
// after. Keep in sync with src/lib/providers/types.ts CATEGORY_SLUGS.
const CATEGORY_EXACT = {
  // fashion
  "Men's Outerwear": 'fashion', "Women's Outerwear": 'fashion', "Men's Tops": 'fashion',
  "Women's Tops": 'fashion', "Men's Trousers": 'fashion', "Women's Trousers": 'fashion',
  "Men's Footwear": 'fashion', "Women's Footwear": 'fashion', "Men's Underwear": 'fashion',
  "Women's Underwear": 'fashion', "Women's Accessories": 'fashion', "Men's Accessories": 'fashion',
  "Women's Jewellery": 'fashion', "Men's Jewellery": 'fashion', 'Jewellery': 'fashion',
  'Bags': 'fashion', 'Socks & Hosiery': 'fashion', 'Watches': 'fashion', 'Dresses': 'fashion',
  // electronics
  'Cables': 'electronics', 'Cables, Parts & Power Supplies': 'electronics', 'Headsets': 'electronics',
  'Input Devices': 'electronics', 'Mobile Phone Accessories': 'electronics', 'Printers': 'electronics',
  'Printer Consumables': 'electronics', 'Peripherals': 'electronics', 'RAM': 'electronics',
  'Software': 'electronics', 'Power Supplies': 'electronics', 'Cameras': 'electronics',
  'Monitors': 'electronics', 'Storage': 'electronics', 'Networking': 'electronics',
  // home & garden
  'Bathrooms & Accessories': 'home-garden', 'Lighting': 'home-garden', 'Tables': 'home-garden',
  'House Accessories': 'home-garden', 'Power Tools': 'home-garden', 'Tools': 'home-garden',
  'Furniture': 'home-garden', 'Kitchen': 'home-garden', 'Garden': 'home-garden',
  'Office Supplies': 'home-garden',
  // sports / beauty / food / toys / books / auto
  'Fitness': 'sports', 'Fitness Equipment': 'sports', 'Outdoor': 'sports',
  'Beauty': 'beauty', 'Cosmetics': 'beauty', 'Fragrance': 'beauty', 'Skincare': 'beauty',
  'Wine': 'food-grocery', 'Food': 'food-grocery', 'Drinks': 'food-grocery',
  'Toy Models': 'toys', 'Toys': 'toys', 'Games': 'toys',
  'Books': 'books',
  'Automotive': 'automotive', 'Car Parts': 'automotive',
};
const CATEGORY_RULES = [
  [/outerwear|footwear|trouser|underwear|hosiery|jewell|\bbags?\b|dress|\bshoe|clothing|apparel|scarf|\btops?\b/i, 'fashion'],
  [/bath|lighting|furnitur|kitchen|garden|\btools?\b|table|bedroom|decor|house|office/i, 'home-garden'],
  [/cable|printer|periph|\bram\b|software|power suppl|camera|headset|input|monitor|storage|network|electronic|computer|phone|laptop|tablet|audio|\btv\b/i, 'electronics'],
  [/fitness|sport|outdoor|cycl|\bbike/i, 'sports'],
  [/beaut|cosmetic|skincare|fragrance|perfume|health/i, 'beauty'],
  [/wine|food|drink|grocer|beverage|coffee/i, 'food-grocery'],
  [/\btoys?\b|model|\bgame|lego|puzzle/i, 'toys'],
  [/book|ebook/i, 'books'],
  [/\bcar\b|auto|tyre|tire|motor/i, 'automotive'],
];
// AWIN's own category_name/merchant_category is INCONSISTENT within a single
// product line — e.g. balcony solar kits get tagged "Power Supplies" for some
// SKUs and "Power Tools" for others, and the generic `\btools?\b` home-garden
// rule above then wrongly claims the "Power Tools" ones. Product-NAME keywords
// are more reliable for these specific, well-known lines; checked before the
// feed-taxonomy mapping so a bad category_name can't override a clear name match.
const NAME_CATEGORY_OVERRIDES = [
  [/balkonkraftwerk|solarmodul|solarpanel|wechselrichter|erweiterungsakku|photovoltaik|\bsolar\b/i, 'electronics'],
];
function nameOverrideCategory(productName) {
  for (const [re, slug] of NAME_CATEGORY_OVERRIDES) if (re.test(productName || '')) return slug;
  return null;
}
function mapCategory(categoryName, merchantCategory) {
  if (CATEGORY_EXACT[categoryName]) return CATEGORY_EXACT[categoryName];
  const hay = `${categoryName} ${merchantCategory}`;
  for (const [re, slug] of CATEGORY_RULES) if (re.test(hay)) return slug;
  return 'electronics'; // least-bad default
}

// ── normalise one CSV row → a `deals` table row (snake_case), or null to skip ──
const num = (v) => { v = (v || '').trim(); if (!v) return null; const f = parseFloat(v); return Number.isFinite(f) ? f : null; };
function normalizeRow(g) {
  if (g('in_stock').trim() !== '1') return null;            // only buyable items
  const currency = (g('currency') || 'EUR').trim().toUpperCase();
  if (!ALLOWED_CURRENCIES.has(currency)) return null;       // keep the market's currency only

  const sale = num(g('search_price'));
  const rrp = num(g('rrp_price'));
  const oldPrice = num(g('product_price_old'));
  // A "deal" needs a genuine higher original price. AWIN's `saving`/
  // `savings_percent` columns are empty in this feed, so derive it ourselves.
  const original = (rrp !== null && rrp > sale) ? rrp : ((oldPrice !== null && oldPrice > sale) ? oldPrice : null);
  if (sale === null || original === null) return null;
  const discountPercent = Math.round(((original - sale) / original) * 100);
  if (discountPercent <= 0) return null;

  const awId = g('aw_product_id').trim();
  const deepLink = g('aw_deep_link').trim();
  if (!awId || !deepLink) return null;

  // Real gallery: the card image (productserve proxy) + any merchant images the
  // feed ships. Deduped, http(s) only.
  const gallery = [...new Set([
    g('aw_image_url'), g('large_image'), g('alternate_image'),
    g('alternate_image_two'), g('alternate_image_three'), g('alternate_image_four'),
  ].map((u) => (u || '').trim()).filter((u) => /^https?:\/\//.test(u)))];
  // Paragraph-preserving, word-boundary-capped (the old `\s+→' '` + slice(0,1500)
  // flattened every paragraph and cut 423/836 catalog descriptions mid-word).
  // product_short_description is the fallback when the feed's main column is empty.
  const description = feedDescription(g('description')) ?? feedDescription(g('product_short_description'));

  return {
    product_id: `awin:${awId}`,
    product_name: g('product_name').trim(),
    shop_name: g('merchant_name').trim(),
    shop_url: deepLink,                                      // monetised AWIN tracking link
    shop_logo_url: null,
    original_price: original,
    sale_price: sale,
    discount_percent: discountPercent,
    currency,
    category: nameOverrideCategory(g('product_name')) ?? mapCategory(g('category_name').trim(), g('merchant_category').trim()),
    brand: g('brand_name').trim() || null,
    image_url: g('aw_image_url').trim() || g('merchant_image_url').trim() || null, // productserve proxy first
    gallery: gallery.length ? gallery : null,
    description,
    merchant_url: g('merchant_deep_link').trim() || null, // direct shop URL for the live verifier
    // Identifier columns — populated only when the Create-a-Feed URL requests
    // these columns (g() returns '' for absent ones). They feed the PDP spec
    // block and Product JSON-LD gtin/mpn.
    ean_code: g('ean').trim() || g('product_GTIN').trim() || null,
    mpn: g('mpn').trim() || null,
    model_number: g('model_number').trim() || g('product_model').trim() || null,
    merchant_sku: g('merchant_product_id').trim() || null,
    merchant_id: g('merchant_id').trim() || null,
    country: COUNTRY,
    city: null,
    is_sponsored: true,
    source: 'awin',
    last_updated: new Date().toISOString(),
  };
}

// ── streaming RFC-4180 CSV parser (quotes, embedded commas/quotes/newlines) ────
// Calls onHeader(fields[]) once, then onRow(fields[]) per record. State persists
// across chunk boundaries so it is safe on an arbitrarily chunked stream.
function makeCsvParser(onHeader, onRow) {
  let field = '', row = [], inQuotes = false, headerDone = false, quoteEnd = false;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); if (!headerDone) { onHeader(row); headerDone = true; } else onRow(row); row = []; };
  return {
    push(chunk) {
      const s = chunk; // string
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inQuotes) {
          if (quoteEnd) {                  // we saw a '"' inside quotes; decide now
            if (c === '"') { field += '"'; quoteEnd = false; }   // escaped quote ""
            else { inQuotes = false; quoteEnd = false; i--; }    // it was the closing quote; reprocess c
          } else if (c === '"') { quoteEnd = true; }
          else field += c;
        } else {
          if (c === '"') inQuotes = true;
          else if (c === ',') endField();
          else if (c === '\n') endRow();
          else if (c === '\r') { /* ignore */ }
          else field += c;
        }
      }
    },
    end() { if (field.length || row.length) endRow(); },
  };
}

// ── download (follows 30x redirects) → gunzip → parser ─────────────────────────
// `stats.bytes` accumulates the COMPRESSED bytes actually received over the
// wire (before gunzip) — that IS the network egress the cost guardrail cares
// about (NFR-COST-2), distinct from the larger decompressed CSV the parser
// sees. It threads through redirect recursion so a 30x hop's (tiny) body
// doesn't get double-counted against the real payload. Resolves with the
// final byte count so the caller can persist it for scripts/check-budgets.mjs.
function ingest(url, onHeader, onRow, redirects = 0, stats = { bytes: 0 }) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume(); // drain
        const next = new URL(res.headers.location, url).toString();
        return resolve(ingest(next, onHeader, onRow, redirects + 1, stats));
      }
      if (code !== 200) { res.resume(); return reject(new Error(`HTTP ${code} downloading feed`)); }

      res.on('data', (chunk) => { stats.bytes += chunk.length; });

      const parser = makeCsvParser(onHeader, onRow);
      const gunzip = zlib.createGunzip();
      gunzip.setEncoding('utf8');
      gunzip.on('data', (chunk) => parser.push(chunk));
      gunzip.on('end', () => { parser.end(); resolve(stats.bytes); });
      gunzip.on('error', reject);
      res.on('error', reject);
      res.pipe(gunzip);
    }).on('error', reject);
  });
}

// ── enhanced (Google-format) feeds: feed-list-driven acquisition ───────────────
// The feed-list endpoint (same api key as AWIN_FEED_URL) enumerates every feed
// with a format flag and a per-feed .csv.gz URL — the ONLY route that reaches
// Google-format advertisers without freezing an advertiser list (they are not
// selectable in category-based Create-a-Feed). Schema verified empirically
// 2026-07-16: 62 columns, BOM+UTF-8, identical across all active feeds.

/** Plain-text GET with redirects (the feed list itself is uncompressed CSV). */
function fetchText(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).toString(), redirects + 1));
      }
      if (code !== 200) { res.resume(); return reject(new Error(`HTTP ${code} downloading ${url.split('/').pop()}`)); }
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { out += c; });
      res.on('end', () => resolve(out));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** CSV string → array of header-keyed objects (reuses the streaming parser). */
function parseCsvString(text) {
  let header = null;
  const rows = [];
  const parser = makeCsvParser(
    (h) => { header = h.map((n) => n.replace(/^\uFEFF/, '')); },
    (cols) => { if (header) rows.push(Object.fromEntries(header.map((n, i) => [n, cols[i] ?? '']))); },
  );
  parser.push(text);
  parser.end();
  return rows;
}

// Canonical column set for per-fid LEGACY downloads. The feed list's example
// URLs carry arbitrary per-feed column sets, so we build our own fid URL with
// exactly the columns normalizeRow reads. (Why per-fid at all: feeds without
// AWIN category mapping — empty category_id, blank Vertical — are structurally
// invisible to ANY cid-based Create-a-Feed URL; GSMnet's 34,863 products were
// the proof, audit/2026-07-16 follow-up 2026-07-19.)
const LEGACY_FID_COLUMNS = [
  'aw_deep_link', 'product_name', 'aw_product_id', 'merchant_product_id',
  'merchant_image_url', 'description', 'product_short_description',
  'merchant_category', 'search_price', 'merchant_name', 'merchant_id',
  'category_name', 'aw_image_url', 'currency', 'delivery_cost',
  'merchant_deep_link', 'brand_name', 'rrp_price', 'product_price_old',
  'delivery_time', 'in_stock', 'large_image', 'alternate_image',
  'alternate_image_two', 'alternate_image_three', 'alternate_image_four',
  'ean', 'mpn', 'model_number', 'product_model', 'condition', 'product_GTIN',
].join(',');

/**
 * Download + normalize every ACTIVE feed in the market language from the feed
 * list — Google format via the enhanced normalizer (rows land hidden until a
 * discount is proven), legacy Awin format via the standard deal gate (these
 * feeds DO carry discount signal). Returns null (with a log line) when the
 * feed list is unreachable or the api key can't be derived — the combined cid
 * ingest must never fail because of this.
 */
async function runFeedListFeeds(counters) {
  const key = (FEED_URL.match(/\/apikey\/([0-9a-f]+)/i) || [])[1];
  if (!key) { console.log('[awin] feed-list pass: cannot derive feed api key from AWIN_FEED_URL — skipped'); return null; }
  const listUrl = `https://ui.awin.com/productdata-darwin-download/publisher/${PUBLISHER_ID}/${key}/1/feedList`;
  const feeds = parseCsvString(await fetchText(listUrl));
  const activeLang = feeds.filter((f) => f['Membership Status'] === 'active' && f['Language'] === ENHANCED_LANGUAGE);
  const googleAdv = new Set(feeds
    .filter((f) => f['Membership Status'] === 'active' && f['Datafeed Format'] === 'Google')
    .map((f) => f['Advertiser ID']));
  // Google feeds via their listed URL; legacy feeds via a canonical fid URL —
  // skipping legacy feeds of dual-format advertisers (Google wins: ROCKBROS's
  // legacy feed was 2 months stale when v2 shipped).
  const selected = activeLang.filter((f) =>
    f['Datafeed Format'] === 'Google' ? !!f['URL'] : !googleAdv.has(f['Advertiser ID']));
  // Every advertiser consumed per-fid is excluded from the combined cid pass so
  // the two acquisition paths can never double-publish one advertiser.
  const advertiserIds = new Set(selected.map((f) => f['Advertiser ID']));

  const rows = [];
  const enhancedRows = [];
  const unmapped = new Map();
  const perFeed = [];
  const legacyScannedById = new Map();
  const ctx = {
    country: COUNTRY,
    allowedCurrencies: ALLOWED_CURRENCIES,
    feedDescription,
    fallbackCategory: (title) => nameOverrideCategory(title) ?? 'electronics',
    onUnmappedCategory: (p) => unmapped.set(p, (unmapped.get(p) || 0) + 1),
  };
  for (const f of selected) {
    const isGoogle = f['Datafeed Format'] === 'Google';
    const url = isGoogle
      ? f['URL']
      : `https://productdata.awin.com/datafeed/download/apikey/${key}/fid/${f['Feed ID'].replace(/^F/i, '')}/columns/${LEGACY_FID_COLUMNS}/format/csv/delimiter/%2C/compression/gzip/`;
    let idx2 = null;
    let scanned2 = 0, kept2 = 0;
    const feedRows2 = []; // legacy rows buffer per feed (capped below)
    try {
      await ingest(url,
        (header) => { idx2 = Object.fromEntries(header.map((name, i) => [name.replace(/^\uFEFF/, ''), i])); },
        (cols) => {
          scanned2++;
          const g = (k) => (idx2[k] !== undefined ? (cols[idx2[k]] ?? '') : '');
          if (isGoogle) {
            const row = normalizeEnhancedRow(g, ctx);
            if (!row) return;
            kept2++;
            enhancedRows.push(row);
            counters.byCategory.set(row.category, (counters.byCategory.get(row.category) || 0) + 1);
            counters.byMerchant.set(row.shop_name, (counters.byMerchant.get(row.shop_name) || 0) + 1);
          } else {
            const mid = g('merchant_id').trim() || f['Advertiser ID'];
            legacyScannedById.set(mid, (legacyScannedById.get(mid) || 0) + 1);
            const row = normalizeRow(g);
            if (!row) return;
            kept2++;
            if (!row.merchant_id) row.merchant_id = f['Advertiser ID'];
            feedRows2.push(row);
          }
        });
      let taken = feedRows2;
      if (!isGoogle && LEGACY_FEED_CAP && feedRows2.length > LEGACY_FEED_CAP) {
        // Highest discounts win the cap — the deal-site lens on a mega-feed.
        taken = [...feedRows2].sort((a, b) => b.discount_percent - a.discount_percent).slice(0, LEGACY_FEED_CAP);
      }
      for (const row of taken) {
        rows.push(row);
        counters.byCategory.set(row.category, (counters.byCategory.get(row.category) || 0) + 1);
        counters.byMerchant.set(row.shop_name, (counters.byMerchant.get(row.shop_name) || 0) + 1);
      }
      perFeed.push({ feed: f['Feed ID'], advertiser: f['Advertiser Name'], format: f['Datafeed Format'], scanned: scanned2, kept: kept2, taken: taken.length });
    } catch (e) {
      // Per-feed isolation: one advertiser's broken feed must not sink the rest.
      perFeed.push({ feed: f['Feed ID'], advertiser: f['Advertiser Name'], format: f['Datafeed Format'], scanned: scanned2, kept: kept2, error: e.message });
    }
  }
  return { rows, enhancedRows, advertiserIds, unmapped, perFeed, legacyScannedById };
}

/**
 * Persist the feed's compressed byte size to a tiny ops_metrics KV table so
 * scripts/check-budgets.mjs can compare it against the 350MB/run AWIN-egress
 * budget (NFR-COST-2) without this script and that one needing to share any
 * other state. Best-effort: a failure here must never fail the ingest run —
 * it only means one cost-guardrail check reports "unmeasured" on its next
 * pass instead of a fresh number.
 */
async function recordFeedBytes(bytes, meta) {
  if (!SUPABASE_URL || !KEY) {
    console.log('[awin] SUPABASE_URL/KEY not set — skipping feed-size metric write (cost-guardrail egress check will see no data)');
    return;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ops_metrics?on_conflict=key`, {
      method: 'POST',
      headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify([{ key: 'awin_feed_bytes', value: bytes, recorded_at: new Date().toISOString(), meta }]),
    });
    if (!res.ok) {
      console.warn(`[awin] failed to record feed-size metric: HTTP ${res.status} ${await res.text()}`);
      return;
    }
    console.log(`[awin] recorded feed-size metric: ${(bytes / (1024 * 1024)).toFixed(1)} MB compressed`);
  } catch (e) {
    console.warn('[awin] failed to record feed-size metric:', e.message);
  }
}

// ── Supabase REST (no @supabase/supabase-js needed) ────────────────────────────
function supaHeaders(extra) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra };
}

async function upsertBatch(rows) {
  if (!SUPABASE_URL || !KEY) throw new Error('--upsert needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/deals?on_conflict=product_id`, {
    method: 'POST',
    headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase upsert failed: HTTP ${res.status} ${await res.text()}`);
}

/**
 * Existing AWIN deals' verifier/enrichment-owned fields, keyed by product_id.
 * The live-shop verifier owns prices and the gallery enricher tops up sparse
 * galleries, so re-ingesting the (lagging) feed must NOT clobber either — we
 * preserve the stored price for any product we've seen before, and the stored
 * gallery whenever it is RICHER than what the feed ships (the enricher adds
 * merchant images the feed lacks; without this the nightly upsert reverted
 * them until the next ~05:00 enrich pass). description_html needs no
 * preservation: it is never a key in the upsert payload, and PostgREST
 * merge-duplicates only touches payload columns.
 */
async function fetchExistingPrices() {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/deals?source=eq.awin&select=product_id,sale_price,original_price,discount_percent,gallery`,
      { headers: supaHeaders({ Range: `${from}-${from + 999}` }) });
    if (!res.ok) throw new Error(`read existing failed: HTTP ${res.status} ${await res.text()}`);
    const rows = await res.json();
    for (const r of rows) out.set(r.product_id, { sale_price: Number(r.sale_price), original_price: Number(r.original_price), discount_percent: Number(r.discount_percent), gallery: Array.isArray(r.gallery) ? r.gallery : null });
    if (rows.length < 1000) break;
  }
  return out;
}

// ── main ───────────────────────────────────────────────────────────────────────
(async () => {
  let idx = null;
  let scanned = 0, kept = 0, upserted = 0;
  const byCategory = new Map(), byMerchant = new Map();
  const legacyScannedById = new Map(); // merchant_id → rows seen in the cid feed (pre-gate)
  const samples = [];
  let batch = [];
  const t0 = Date.now();

  async function flush() {
    if (!DO_UPSERT || batch.length === 0) { batch = []; return; }
    await upsertBatch(batch);
    upserted += batch.length;
    batch = [];
  }

  console.log(`[awin] downloading feed → filtering (country=${COUNTRY}, currency=${[...ALLOWED_CURRENCIES].join(',')}, upsert=${DO_UPSERT}${LIMIT ? `, limit=${LIMIT}` : ''})…`);

  let capped = false;
  const feedBytes = await ingest(FEED_URL,
    (header) => { idx = Object.fromEntries(header.map((name, i) => [name.replace(/^\uFEFF/, ''), i])); },
    (cols) => {
      if (capped) return;
      scanned++;
      const g = (k) => (idx[k] !== undefined ? (cols[idx[k]] ?? '') : '');
      // Per-merchant scan counts (BEFORE the deal gate) — the coverage watchdog
      // uses these to tell "scanned but nothing discounted" (fine, v1 drops
      // non-deals) from "absent from the feed entirely" (a genuine gap).
      const scanMid = g('merchant_id').trim();
      if (scanMid) legacyScannedById.set(scanMid, (legacyScannedById.get(scanMid) || 0) + 1);
      const deal = normalizeRow(g);
      if (!deal) return;
      kept++;
      byCategory.set(deal.category, (byCategory.get(deal.category) || 0) + 1);
      byMerchant.set(deal.shop_name, (byMerchant.get(deal.shop_name) || 0) + 1);
      if (samples.length < 8) samples.push({
        name: deal.product_name.slice(0, 42), price: deal.sale_price, was: deal.original_price,
        pct: deal.discount_percent, cur: deal.currency, cat: deal.category, shop: deal.shop_name,
      });
      // NOTE: synchronous push; we collect into batches and flush between records
      // is not possible here (onRow is sync), so buffer and flush after parsing.
      batch.push(deal);
      if (LIMIT && kept >= LIMIT) capped = true;
    },
  );

  let legacyRows = batch; batch = [];

  // ── ingest-v2: enhanced (Google-format) feeds — see audit/2026-07-16 ────────
  // Skipped on --limit smoke runs; a failure here never sinks the legacy pass.
  let feedListPass = null;
  if (ENHANCED && !LIMIT) {
    try { feedListPass = await runFeedListFeeds({ byCategory, byMerchant }); }
    catch (e) { console.warn('[awin] feed-list pass FAILED (cid ingest unaffected):', e.message); }
  }
  let excludedLegacy = 0;
  if (feedListPass) {
    if (feedListPass.advertiserIds.size) {
      // Advertisers consumed per-fid (both formats) are dropped from the cid
      // pass so the two acquisition paths never double-publish one advertiser.
      const before = legacyRows.length;
      legacyRows = legacyRows.filter((r) => !feedListPass.advertiserIds.has(String(r.merchant_id || '')));
      excludedLegacy = before - legacyRows.length;
      kept -= excludedLegacy;
    }
    kept += feedListPass.rows.length + feedListPass.enhancedRows.length;
    for (const f of feedListPass.perFeed) {
      console.log(`[awin] feed ${f.advertiser} (${f.feed}, ${f.format}): scanned ${f.scanned}, kept ${f.kept}${f.error ? ` — ERROR: ${f.error}` : ''}`);
    }
    if (excludedLegacy) console.log(`[awin] feed-list pass: skipped ${excludedLegacy} cid rows from per-fid advertisers`);
    if (feedListPass.unmapped.size) {
      console.log('[awin] enhanced: UNMAPPED google categories (fell back):',
        [...feedListPass.unmapped.entries()].map(([p, n]) => `${p} ×${n}`).join(' | '));
    }
    // Per-fid scan counts join the cid pass's (watchdog evidence for both paths).
    for (const [mid, n] of feedListPass.legacyScannedById) {
      legacyScannedById.set(mid, (legacyScannedById.get(mid) || 0) + n);
    }
  }
  const enhancedRows = feedListPass ? feedListPass.enhancedRows : [];

  // Upsert in batches AFTER parsing (the parser callback is synchronous).
  if (DO_UPSERT) {
    // Dedupe by product_id: advertisers sometimes list the SAME feed twice
    // (Lyra Pet: 102589+104303) — duplicate keys in one PostgREST payload 400.
    const all = [...new Map(
      [...legacyRows, ...(feedListPass ? feedListPass.rows : []), ...enhancedRows]
        .map((r) => [r.product_id, r]),
    ).values()];
    // Preserve verified prices for products we already have; the feed price is
    // only used for brand-new products (until the verifier first checks them).
    const existing = await fetchExistingPrices();
    let preserved = 0, galleriesKept = 0;
    for (const d of all) {
      const e = existing.get(d.product_id);
      if (!e) continue;
      if (Number.isFinite(e.sale_price)) {
        d.sale_price = e.sale_price; d.original_price = e.original_price; d.discount_percent = e.discount_percent;
        preserved++;
      }
      // Keep the enriched gallery when it holds MORE images than the feed's.
      if (e.gallery && e.gallery.length > (d.gallery?.length ?? 0)) {
        d.gallery = e.gallery;
        galleriesKept++;
      }
    }
    // Hidden-split (ingest-v2): brand-new enhanced rows with no provable
    // discount land HIDDEN — populated, price-tracked, verifier-visited, but
    // not published until the live-shop verifier finds a genuine compare-at
    // discount (it un-hides + sets prices itself). Existing rows never get a
    // `hidden` key here, so promotion/demotion stays verifier-owned.
    // Separate flushes: PostgREST needs uniform keys per request.
    const enhancedIds = new Set(enhancedRows.map((r) => r.product_id));
    const updates = [];
    const hiddenNew = [];
    for (const d of all) {
      if (enhancedIds.has(d.product_id) && !existing.has(d.product_id) && d.discount_percent <= 0) {
        hiddenNew.push({ ...d, hidden: true });
      } else {
        updates.push(d);
      }
    }
    const total = updates.length + hiddenNew.length;
    for (const group of [updates, hiddenNew]) {
      for (let i = 0; i < group.length; i += BATCH) {
        batch = group.slice(i, i + BATCH);
        await flush();
        process.stdout.write(`\r[awin] upserted ${upserted}/${total}…`);
      }
    }
    process.stdout.write('\n');
    if (hiddenNew.length) console.log(`[awin] enhanced: ${hiddenNew.length} new products inserted HIDDEN (await verifier-proven discounts)`);

    // Persist the run summary for the coverage watchdog (programmes-sync reads
    // it at 04:30 to reconcile "what the ingest actually consumed" against the
    // feed list and the DB). Best-effort like the feed-size metric: a failure
    // here surfaces as a watchdog red ("no ingest summary"), never a run fail.
    // ONLY full runs write it: a manual --limit smoke or --no-enhanced run must
    // not clobber the nightly evidence with a fresh-but-partial snapshot.
    if (LIMIT || !ENHANCED) {
      console.log('[awin] partial run (--limit/--no-enhanced) — ingest summary NOT recorded');
    } else try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ops_metrics?on_conflict=key`, {
        method: 'POST',
        headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify([{
          key: 'awin_ingest_summary',
          value: kept,
          recorded_at: new Date().toISOString(),
          meta: {
            ranAt: new Date().toISOString(),
            scanned, kept, upserted, excludedLegacy,
            hiddenNew: hiddenNew.length,
            feeds: feedListPass ? feedListPass.perFeed : null,
            enhancedUnmapped: feedListPass ? Object.fromEntries(feedListPass.unmapped) : null,
            legacyScannedById: Object.fromEntries(legacyScannedById),
          },
        }]),
      });
      if (!res.ok) console.warn(`[awin] ingest-summary metric write failed: HTTP ${res.status}`);
      else console.log('[awin] ingest summary recorded for the coverage watchdog');
    } catch (e) {
      console.warn('[awin] ingest-summary metric write failed:', e.message);
    }
    console.log(`[awin] preserved verified prices for ${preserved} existing deals; feed price used for ${all.length - preserved} new ones`);
    console.log(`[awin] kept ${galleriesKept} enriched galleries (richer than the feed's)`);

    // Stale-hide: this upsert refreshed last_updated for every deal still in the
    // feed, and the daily verifier touches every deal it can confirm live. So a
    // row untouched for 3+ days has BOTH dropped out of the feed AND been
    // unverifiable — hide it (not delete: it un-hides automatically if the
    // verifier later confirms it live again).
    const cutoff = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const staleRes = await fetch(
      `${SUPABASE_URL}/rest/v1/deals?source=eq.awin&hidden=eq.false&last_updated=lt.${encodeURIComponent(cutoff)}`,
      {
        method: 'PATCH',
        headers: supaHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal,count=exact' }),
        body: JSON.stringify({ hidden: true }),
      },
    );
    if (!staleRes.ok) throw new Error(`stale-hide failed: HTTP ${staleRes.status} ${await staleRes.text()}`);
    const staleCount = (staleRes.headers.get('content-range') || '').split('/')[1] || '0';
    console.log(`[awin] stale-hide: ${staleCount} deals unseen for 3+ days hidden`);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[awin] done in ${secs}s — scanned ${scanned}, kept ${kept}${DO_UPSERT ? `, upserted ${upserted}` : ' (dry-run, no writes)'}`);
  console.log(`[awin] feed size: ${(feedBytes / (1024 * 1024)).toFixed(1)} MB compressed (network egress)`);
  console.log('\nby category:');
  [...byCategory.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
  console.log('\nby merchant:');
  [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
  console.log('\nsamples:');
  samples.forEach((s) => console.log(`  -${s.pct}%  ${s.price} ${s.cur} (was ${s.was})  [${s.cat}]  ${s.shop} — ${s.name}`));

  // Only record the metric on a real (non-dry-run) pass — dry-run's whole
  // point is "preview without writing", and this is a write (to ops_metrics).
  if (DO_UPSERT) {
    await recordFeedBytes(feedBytes, { scanned, kept, upserted });
  }
})().catch((e) => { console.error('\n[awin] FAILED:', e.message); process.exit(1); });

// ── tiny .env.local loader (no dependency) ─────────────────────────────────────
function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
