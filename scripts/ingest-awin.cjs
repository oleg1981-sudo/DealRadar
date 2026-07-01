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

// ── args & env ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const DO_UPSERT = has('--upsert');
const LIMIT = parseInt(opt('--limit', '0'), 10) || 0; // 0 = no cap
const COUNTRY = opt('--country', 'DE').toUpperCase();
const ALLOWED_CURRENCIES = new Set((opt('--currency', 'EUR')).toUpperCase().split(','));
const BATCH = 500;

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
  const description = g('description').trim().replace(/\s+/g, ' ').slice(0, 1500) || null;

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
function ingest(url, onHeader, onRow, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    https.get(url, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume(); // drain
        const next = new URL(res.headers.location, url).toString();
        return resolve(ingest(next, onHeader, onRow, redirects + 1));
      }
      if (code !== 200) { res.resume(); return reject(new Error(`HTTP ${code} downloading feed`)); }

      const parser = makeCsvParser(onHeader, onRow);
      const gunzip = zlib.createGunzip();
      gunzip.setEncoding('utf8');
      gunzip.on('data', (chunk) => parser.push(chunk));
      gunzip.on('end', () => { parser.end(); resolve(); });
      gunzip.on('error', reject);
      res.on('error', reject);
      res.pipe(gunzip);
    }).on('error', reject);
  });
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
 * Existing AWIN deals' prices, keyed by product_id. The live-shop verifier owns
 * prices, so re-ingesting the (lagging) feed must NOT clobber verified
 * corrections — we preserve the stored price for any product we've seen before.
 */
async function fetchExistingPrices() {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/deals?source=eq.awin&select=product_id,sale_price,original_price,discount_percent`,
      { headers: supaHeaders({ Range: `${from}-${from + 999}` }) });
    if (!res.ok) throw new Error(`read existing failed: HTTP ${res.status} ${await res.text()}`);
    const rows = await res.json();
    for (const r of rows) out.set(r.product_id, { sale_price: Number(r.sale_price), original_price: Number(r.original_price), discount_percent: Number(r.discount_percent) });
    if (rows.length < 1000) break;
  }
  return out;
}

// ── main ───────────────────────────────────────────────────────────────────────
(async () => {
  let idx = null;
  let scanned = 0, kept = 0, upserted = 0;
  const byCategory = new Map(), byMerchant = new Map();
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
  await ingest(FEED_URL,
    (header) => { idx = Object.fromEntries(header.map((name, i) => [name, i])); },
    (cols) => {
      if (capped) return;
      scanned++;
      const g = (k) => (idx[k] !== undefined ? (cols[idx[k]] ?? '') : '');
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

  // Upsert in batches AFTER parsing (the parser callback is synchronous).
  if (DO_UPSERT) {
    const all = batch; batch = [];
    // Preserve verified prices for products we already have; the feed price is
    // only used for brand-new products (until the verifier first checks them).
    const existing = await fetchExistingPrices();
    let preserved = 0;
    for (const d of all) {
      const e = existing.get(d.product_id);
      if (e && Number.isFinite(e.sale_price)) {
        d.sale_price = e.sale_price; d.original_price = e.original_price; d.discount_percent = e.discount_percent;
        preserved++;
      }
    }
    for (let i = 0; i < all.length; i += BATCH) {
      batch = all.slice(i, i + BATCH);
      await flush();
      process.stdout.write(`\r[awin] upserted ${upserted}/${all.length}…`);
    }
    process.stdout.write('\n');
    console.log(`[awin] preserved verified prices for ${preserved} existing deals; feed price used for ${all.length - preserved} new ones`);
  }

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[awin] done in ${secs}s — scanned ${scanned}, kept ${kept}${DO_UPSERT ? `, upserted ${upserted}` : ' (dry-run, no writes)'}`);
  console.log('\nby category:');
  [...byCategory.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
  console.log('\nby merchant:');
  [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
  console.log('\nsamples:');
  samples.forEach((s) => console.log(`  -${s.pct}%  ${s.price} ${s.cur} (was ${s.was})  [${s.cat}]  ${s.shop} — ${s.name}`));
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
