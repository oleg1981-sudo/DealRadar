// Live-shop price/stock verifier — keeps deals honest BETWEEN feed pulls.
//
// AWIN's feed lags the merchant's live store (it can show a price/stock that's
// already wrong). This job checks the REAL shop for each deal and corrects it:
//   - out of stock                  -> HIDE the deal (kept in DB so the next feed
//   - no live discount any more      -> HIDE the deal   ingest can't resurrect it;
//   - product page gone (404)        -> HIDE the deal   un-hidden automatically if
//                                                       it comes back)
//   - price / compare-at changed     -> update price + recompute discount
//   - checked & unchanged            -> touch last_updated (confirms the deal is
//                                       alive, so the ingest's stale-hide never
//                                       hides a deal this job just verified)
//
// AWIN merchants are Shopify, which exposes product data at `…/products/<handle>`:
//   .js   → live price + compare_at + AVAILABILITY (cents)   ← preferred
//   .json → live price + compare_at only (no stock)          ← fallback
// Some stores aggressively rate-limit/bot-block these. The verifier is therefore
// BEST-EFFORT and respectful: per-host pacing, a single gentle retry, and it
// ABANDONS a host that keeps blocking (those deals stay as-is, covered by the
// daily feed + the on-card freshness note). It never hammers a store.
//
// Dependency-free (Node built-ins + Supabase REST). Reads deals from Supabase.
// Run on a daily cron (see .github/workflows/verify-awin.yml).
//
//   node scripts/verify-awin.cjs                 # dry-run: report what would change
//   node scripts/verify-awin.cjs --apply         # write updates + removals
//   node scripts/verify-awin.cjs --limit 50      # check only N (smoke test)
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
'use strict';

const fs = require('fs');
const path = require('path');
const { reduceMerchantHtml } = require('./lib/description.cjs');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const APPLY = has('--apply');
const LIMIT = parseInt(opt('--limit', '0'), 10) || 0;
const DELAY_MS = parseInt(opt('--delay', '1000'), 10) || 1000;  // pacing per host
const ABANDON_AFTER = 5;                                        // consecutive blocks on a host -> skip the rest
// A real browser UA (not a bot string) — same as a price-checking browser would send.
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
};

loadEnvLocal();
// Tolerate a SUPABASE_URL secret that's missing the scheme or has a trailing slash.
function normalizeBaseUrl(u) {
  u = (u || '').trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}
const BASE = normalizeBaseUrl(process.env.SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!BASE || !KEY) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'); process.exit(1); }
const SUPA = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round2 = (n) => Math.round(n * 100) / 100;
const hostOf = (u) => { try { return new URL(u).host; } catch { return '?'; } };

// ── Shopify live lookup ────────────────────────────────────────────────────────
/** GET a URL, one gentle retry on 429. Returns {status, url, json} or {status, url, error}. */
async function fetchUrl(url, attempt = 0) {
  let res;
  try { res = await fetch(url, { headers: HEADERS }); }
  catch (e) { return { status: 0, error: `fetch:${e.message}` }; }
  if (res.status === 429 && attempt < 1) {
    const ra = parseInt(res.headers.get('retry-after') || '', 10);
    await sleep(Number.isFinite(ra) ? Math.min(ra * 1000, 5000) : 2000);
    return fetchUrl(url, attempt + 1);
  }
  if (!res.ok) return { status: res.status, url: res.url, error: `http-${res.status}` };
  try { return { status: res.status, url: res.url, json: await res.json() }; } catch { return { status: res.status, url: res.url, error: 'bad-json' }; }
}

/** Pick the variant: by the ?variant=<id> in the deal URL, else price-closest. */
function pickVariant(variants, deal, variantId) {
  if (!variants || !variants.length) return null;
  if (variantId) { const m = variants.find((v) => String(v.id) === String(variantId)); if (m) return m; }
  if (variants.length === 1) return variants[0];
  let best = variants[0], bestDiff = Infinity;
  for (const v of variants) {
    const diff = Math.abs((v.price ?? 0) / 100 - deal.sale_price);
    if (diff < bestDiff) { bestDiff = diff; best = v; }
  }
  return best;
}

const toState = (obj, v, hasStock) => ({
  ok: true,
  available: hasStock ? (v.available ?? obj.available ?? true) : null,
  price: (v.price ?? 0) / 100,
  compareAt: v.compare_at_price ? v.compare_at_price / 100 : null,
  // The merchant's full rendered product description — the same rich HTML the
  // merchant PDP shows (`description` on the .js payload, `body_html` on .json).
  // Fetched here anyway for the price check; capturing it costs nothing extra.
  descriptionHtml:
    (typeof obj.description === 'string' && obj.description.trim() && obj.description) ||
    (typeof obj.body_html === 'string' && obj.body_html.trim() && obj.body_html) || null,
});

/**
 * Live state for a deal — IN THE DEAL'S CURRENCY. Multi-market Shopify stores
 * (e.g. kuishi.com) serve GBP on the base path and EUR under the `/de/` market
 * path; reading the wrong one stores a GBP number as EUR. So we read the
 * localized market path (`<origin>/<cc>/products/<handle>`) first, and only fall
 * back to the base path for a German/EUR domain (`*.de` / `de.*`). We never read
 * a foreign-currency storefront, and we drop a market URL that redirects out of
 * its market (it may have switched currency).
 */
async function liveState(deal) {
  let u, variantId = null;
  try { u = new URL(deal.merchant_url); variantId = u.searchParams.get('variant'); } catch { return { error: 'no-product-url' }; }
  const m = u.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) return { error: 'no-product-url' };
  const handle = m[1];
  const cc = (deal.country || 'DE').toLowerCase();
  const CC = cc.toUpperCase();
  const market = `/${cc}/`;
  const germanDomain = u.host.endsWith('.de') || u.host.startsWith('de.');

  // `?country=<CC>` forces the Shopify market for that country, so prices come
  // back in the market's currency (e.g. EUR for DE) — WITHOUT it, a UK store
  // like kuishi.com returns GBP and we'd store a GBP number as EUR.
  const q = `?country=${CC}`;
  const candidates = [{ base: `${u.origin}/${cc}/products/${handle}`, isMarket: true }];
  if (germanDomain) candidates.push({ base: `${u.origin}/products/${handle}`, isMarket: false });

  // Classify every failed attempt so the caller can tell a REMOVED product
  // (all attempts 404 → hide it) from a flaky/blocking shop (skip, never hide).
  let blocked = false, any404 = false, anyTransient = false;
  const note = (r) => {
    if (r.status === 429 || r.status === 403) blocked = true;
    else if (r.status === 404) any404 = true;
    else anyTransient = true; // network error, 5xx, bad JSON — assume temporary
  };
  const inMarket = (url) => { try { return new URL(url).pathname.startsWith(market); } catch { return false; } };

  for (const { base, isMarket } of candidates) {
    // .js — price + stock, in the deal's market currency
    const js = await fetchUrl(`${base}.js${q}`);
    if (js.json && (!isMarket || inMarket(js.url))) {
      const v = pickVariant(js.json.variants, deal, variantId);
      if (v) return toState(js.json, v, true);
      return { error: 'no-variant' };
    }
    note(js);
    // .json — price only; only for the base German-domain path (EUR-safe).
    if (!isMarket) {
      const jn = await fetchUrl(`${base}.json${q}`);
      if (jn.json) {
        const p = jn.json.product || jn.json;
        const v = pickVariant(p.variants, deal, variantId);
        if (v) return toState(p, v, false);
        return { error: 'no-variant' };
      }
      note(jn);
    }
  }
  if (blocked) return { error: 'blocked', blocked: true };
  if (anyTransient) return { error: 'unreachable' };
  if (any404) return { error: 'gone' };
  return { error: 'unreachable' };
}

/**
 * Desired state from live data. `available === null` means stock is unknown
 * (assume in stock — only .json was reachable). Sold-out or no-longer-discounted
 * → HIDE (keep the row so the ingest can't resurrect it); otherwise SHOW with the
 * live price.
 */
function decide(deal, live) {
  if (live.available === false) return { hide: true, reason: 'out-of-stock' };
  const newSale = round2(live.price);
  if (!(live.compareAt && live.compareAt > newSale)) return { hide: true, reason: 'no-discount' };
  const newOrig = round2(live.compareAt);
  const newDisc = Math.round(((newOrig - newSale) / newOrig) * 100);
  if (newDisc <= 0) return { hide: true, reason: 'no-discount' };
  return { hide: false, sale: newSale, orig: newOrig, disc: newDisc };
}

// ── Supabase reads/writes ──────────────────────────────────────────────────────
/** Whether the deals table has the description_html column (added 2026-07).
 *  Detected at read time so a deploy that outruns the migration degrades to
 *  price-only verification instead of failing the whole run. */
let captureHtml = true;

async function fetchDeals() {
  const out = [];
  const baseCols = 'product_id,merchant_url,sale_price,original_price,discount_percent,currency,hidden';
  let cols = `${baseCols},description_html`;
  for (let from = 0; ; from += 1000) {
    let r = await fetch(`${BASE}/rest/v1/deals?source=eq.awin&merchant_url=not.is.null&select=${cols}`,
      { headers: { ...SUPA, Range: `${from}-${from + 999}` } });
    if (!r.ok && captureHtml && from === 0) {
      // Column not migrated yet (PostgREST 400s on unknown select columns).
      captureHtml = false;
      cols = baseCols;
      console.error('[verify] description_html column missing — content capture disabled this run (run pnpm db:migrate)');
      r = await fetch(`${BASE}/rest/v1/deals?source=eq.awin&merchant_url=not.is.null&select=${cols}`,
        { headers: { ...SUPA, Range: `${from}-${from + 999}` } });
    }
    if (!r.ok) throw new Error(`read deals failed: HTTP ${r.status} ${await r.text()}`);
    const batch = await r.json();
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

async function applyPatch(productId, fields) {
  const r = await fetch(`${BASE}/rest/v1/deals?product_id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ ...fields, last_updated: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`patch ${productId}: HTTP ${r.status} ${await r.text()}`);
}

/** Refresh last_updated on checked-but-unchanged deals (batched). This is the
 *  "still alive" heartbeat the ingest's stale-hide relies on. */
async function touchLastUpdated(ids) {
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80).map((id) => `"${id}"`).join(',');
    const r = await fetch(`${BASE}/rest/v1/deals?product_id=in.(${encodeURIComponent(chunk)})`, {
      method: 'PATCH',
      headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ last_updated: now }),
    });
    if (!r.ok) throw new Error(`touch batch: HTTP ${r.status} ${await r.text()}`);
  }
}

// ── main ───────────────────────────────────────────────────────────────────────
function groupByHost(items) {
  const m = new Map();
  for (const d of items) { const h = hostOf(d.merchant_url); if (!m.has(h)) m.set(h, []); m.get(h).push(d); }
  return m;
}

(async () => {
  const t0 = Date.now();
  const deals = await fetchDeals();
  const byHost = groupByHost(deals);
  console.log(`[verify] checking ${deals.length} deals across ${byHost.size} shops (apply=${APPLY}, ${DELAY_MS}ms/host)…`);

  const patches = []; const okTouch = []; const reasons = {}, errKinds = {};
  let ok = 0, errors = 0, done = 0, hidden = 0, unhidden = 0, priceUpdated = 0, htmlCaptured = 0;
  const samples = [];

  await Promise.all([...byHost.entries()].map(async ([host, list]) => {
    let consec = 0, i = 0;
    for (; i < list.length; i++) {
      const deal = list[i];
      const live = await liveState(deal);
      done++;
      if (process.stdout.isTTY && done % 25 === 0) process.stdout.write(`\r[verify] ${done}/${deals.length}…`);
      const isHidden = deal.hidden === true;
      if (live.error === 'gone') {
        // Product page removed at the shop (hard 404, not a transient error).
        consec = 0;
        if (!isHidden) { patches.push({ id: deal.product_id, fields: { hidden: true } }); hidden++; reasons.gone = (reasons.gone || 0) + 1; }
        else { ok++; okTouch.push(deal.product_id); } // stays hidden; confirm it's been checked
      } else if (live.error) {
        errors++; errKinds[live.error] = (errKinds[live.error] || 0) + 1;
        consec = live.blocked ? consec + 1 : 0;
      } else {
        consec = 0;
        const want = decide(deal, live);
        if (want.hide) {
          if (!isHidden) { patches.push({ id: deal.product_id, fields: { hidden: true } }); hidden++; reasons[want.reason] = (reasons[want.reason] || 0) + 1; }
          else { ok++; okTouch.push(deal.product_id); } // already hidden
        } else {
          const fields = {};
          const priceChanged = want.sale !== deal.sale_price || want.orig !== deal.original_price || want.disc !== deal.discount_percent;
          if (priceChanged) { fields.sale_price = want.sale; fields.original_price = want.orig; fields.discount_percent = want.disc; priceUpdated++; if (samples.length < 8) samples.push(`${deal.product_id}: ${deal.sale_price} -> ${want.sale} (-${want.disc}%)`); }
          if (isHidden) { fields.hidden = false; unhidden++; } // a sold-out deal is back in stock
          // Content capture: store the merchant's reduced description HTML when
          // it changed. The reducer strips executable content and bounds size;
          // the app sanitizes AGAIN at render (that's the security boundary).
          if (captureHtml && live.descriptionHtml) {
            const reduced = reduceMerchantHtml(live.descriptionHtml);
            if (reduced && reduced !== (deal.description_html || null)) { fields.description_html = reduced; htmlCaptured++; }
          }
          if (Object.keys(fields).length) patches.push({ id: deal.product_id, fields });
          else { ok++; okTouch.push(deal.product_id); }
        }
      }
      await sleep(DELAY_MS);
      if (consec >= ABANDON_AFTER) { i++; break; } // host is blocking — stop hitting it
    }
    const skipped = list.length - i;
    if (skipped > 0) {
      errors += skipped; errKinds['skipped-blocked'] = (errKinds['skipped-blocked'] || 0) + skipped;
      console.error(`\n[verify] ${host} is blocking automated checks — skipped ${skipped} (covered by feed + freshness note)`);
    }
  }));
  if (process.stdout.isTTY) process.stdout.write('\n');

  console.log(`\n[verify] checked ${done} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  unchanged: ${ok}`);
  console.log(`  price updates: ${priceUpdated}`);
  console.log(`  hidden (sold-out / no discount): ${hidden} ${JSON.stringify(reasons)}`);
  console.log(`  un-hidden (back in stock): ${unhidden}`);
  console.log(`  merchant descriptions captured/updated: ${htmlCaptured}${captureHtml ? '' : ' (capture disabled — column missing)'}`);
  console.log(`  errors/skipped: ${errors} ${JSON.stringify(errKinds)}`);
  if (samples.length) { console.log('  sample price updates:'); samples.forEach((s) => console.log(`    ${s}`)); }

  if (!APPLY) { console.log('\n[verify] dry-run — no writes. Re-run with --apply to commit.'); return; }
  for (const p of patches) await applyPatch(p.id, p.fields);
  await touchLastUpdated(okTouch);
  console.log(`\n[verify] applied ${patches.length} changes (${priceUpdated} prices, ${hidden} hidden, ${unhidden} un-hidden); confirmed ${okTouch.length} unchanged.`);
})().catch((e) => { console.error('\n[verify] FAILED:', e.message); process.exit(1); });

// ── tiny .env.local loader ─────────────────────────────────────────────────────
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
