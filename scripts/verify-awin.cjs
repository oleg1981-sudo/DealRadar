// Live-shop price/stock verifier — keeps deals honest BETWEEN feed pulls.
//
// AWIN's feed lags the merchant's live store (it can show a price/stock that's
// already wrong). This job checks the REAL shop for each deal and corrects it:
//   - out of stock                  -> HIDE the deal (kept in DB so the next feed
//   - no live discount any more      -> HIDE the deal   ingest can't resurrect it;
//   - product page gone (404)        -> HIDE the deal   un-hidden automatically if
//                                                       it comes back)
//   - price / compare-at changed     -> update price + recompute discount
//   - checked & unchanged (visible)  -> touch last_updated (liveness heartbeat the
//                                       ingest's stale-hide relies on)
//
// CONTENT CAPTURE [FR-1.1/FR-1.2, docs/specs/pdp-full-content]: the same fetch
// that verifies the price carries the merchant's full gallery + rich description
// — they are captured for EVERY fetched row (hidden included) in the same PATCH.
//
// WRITE CLASSES [M2 amendment 2026-07-19, docs/specs/url-structure/2026-07-08_v2/
// amendment-2026-07-19_write-classes.md]:
//   liveness  (price/stock/visibility changes, verified-alive VISIBLE rows)
//             -> bumps last_updated (+ last_verified)
//   content   (gallery/description_html/attrs on rows that stay hidden)
//             -> last_verified ONLY — a content save is NOT proof of life and
//                must never resurrect an expired deal or feed stale-hide.
// Hidden rows that stay hidden get last_verified only (sweep watermark), never
// a last_updated bump.
//
// AWIN merchants are Shopify, which exposes product data at `…/products/<handle>`:
//   .js   → live price + compare_at + AVAILABILITY + images (cents)  ← preferred
//   .json → live price + compare_at + images only (no stock)         ← fallback
// Some stores aggressively rate-limit/bot-block these. The verifier is therefore
// BEST-EFFORT and respectful: per-host pacing, a single gentle retry, and it
// ABANDONS a host that keeps blocking. Per-host outcomes are persisted to
// public.fetch_outcomes [FR-1.3] — the harness's block-list evidence.
//
// Dependency-free (Node built-ins + Supabase REST). Reads deals from Supabase.
// Run on a daily cron (see .github/workflows/verify-awin.yml).
//
//   node scripts/verify-awin.cjs                 # dry-run: report what would change
//   node scripts/verify-awin.cjs --apply         # write updates + removals
//   node scripts/verify-awin.cjs --limit 50      # check only N (smoke test)
//   node scripts/verify-awin.cjs --max-minutes 110  # soft wall-clock budget
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
// Soft wall-clock budget: the sweep (~33k rows, several multi-thousand-page
// hosts) can never finish exhaustively in one run — stop CLEANLY at the budget
// instead of getting timeout-cancelled (patches flush incrementally; the
// stalest-first order below rotates coverage across runs).
const MAX_MINUTES = parseInt(opt('--max-minutes', '120'), 10) || 0;
const T_START = Date.now();
const overBudget = () => MAX_MINUTES && (Date.now() - T_START) > MAX_MINUTES * 60000;
const DEADLINE = parseInt(opt('--deadline', '0'), 10) || 0;     // Unix epoch timestamp (ms) to stop
// Capture provenance [EC-1]: which verify run last wrote content for a row.
const RUN_ID = `verify-${new Date().toISOString().replace(/[:.]/g, '-')}`;

// Incremental write queue globals
let pendingPatches = [];
let pendingTouches = [];        // liveness heartbeat (visible verified-alive rows)
let pendingVerifiedOnly = [];   // content-class watermark (hidden rows that stay hidden)
let writePromise = Promise.resolve();
// Patch accounting [FR-3.4/EC-11]: attempted vs committed, one retry each.
let patchesAttempted = 0, patchesCommitted = 0;
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
const IS_MAIN = require.main === module;
const BASE = normalizeBaseUrl(process.env.SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if ((!BASE || !KEY) && IS_MAIN) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'); process.exit(1); }
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

/** Normalize a Shopify images array (strings or {src}) to https URLs. */
function normalizeImages(images) {
  return (images || [])
    .map((i) => (typeof i === 'string' ? i : i?.src || ''))
    .map((i) => (i.startsWith('//') ? `https:${i}` : i))
    .filter((i) => /^https:\/\//.test(i));
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
  // The merchant's full gallery [FR-1.1] — previously discarded, then re-fetched
  // by enrich-galleries.cjs; now captured in the same pass.
  images: normalizeImages(obj.images),
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

/** productserve proxy → the original image its `url` param embeds (same logic
 *  as unproxyImage in src/lib/utils/product-details.ts). */
function unproxy(u) {
  if (!/(^|\.)productserve\.com\//i.test(u)) return u;
  try {
    const inner = new URL(u).searchParams.get('url');
    if (!inner) return u;
    const o = /^https?:\/\//i.test(inner) ? inner : 'https://' + inner.replace(/^ssl:/i, '');
    return new URL(o).protocol === 'https:' ? o : u;
  } catch { return u; }
}

const MAX_IMAGES = 6; // matches ingest + enrich-galleries

/** Keep-richer gallery merge [FR-1.1]: existing ∪ live, deduped after
 *  unproxying, capped. Returns null when the merge would not grow the set. */
function mergeGallery(deal, liveImages) {
  if (!liveImages || !liveImages.length) return null;
  const current = (deal.gallery && deal.gallery.length ? deal.gallery : [deal.image_url].filter(Boolean)).map(unproxy);
  const merged = [...new Set([...current, ...liveImages])].slice(0, MAX_IMAGES);
  return merged.length > new Set(current).size ? merged : null;
}

// ── Supabase reads/writes ──────────────────────────────────────────────────────
/** Column availability, detected at read time so a deploy that outruns the
 *  migration degrades gracefully instead of failing the whole run:
 *  - captureHtml   → description_html (2026-07)
 *  - contentCols   → gallery/image_url/last_verified/capture_run_id (Stage 1/2) */
let captureHtml = true;
let contentCols = true;

async function fetchDeals() {
  const out = [];
  const baseCols = 'product_id,merchant_url,sale_price,original_price,discount_percent,currency,hidden';
  const colSets = [
    `${baseCols},description_html,gallery,image_url,country`,
    `${baseCols},description_html`,
    baseCols,
  ];
  let setIdx = 0;
  // Only rows the Shopify path can actually verify: redirect-tracker
  // merchant_urls (t23.intelliad.de etc., ~22.9k rows) have no /products/
  // handle — they can never be fetched, and at 1s pacing they would consume
  // the entire budget in pure sleeps. The feed's daily upsert keeps their
  // last_updated fresh, so stale-hide never mistakes them for dead.
  const filter = `source=eq.awin&merchant_url=like.*%2Fproducts%2F*`;
  // Stalest-first [FR-3.2]: interrupted runs rotate coverage instead of
  // starving the tail; unique tiebreaker keeps Range pagination stable.
  let order = '&order=last_verified.asc.nullsfirst,product_id.asc';
  for (let from = 0; ; from += 1000) {
    let r = await fetch(`${BASE}/rest/v1/deals?${filter}&select=${colSets[setIdx]}${order}`,
      { headers: { ...SUPA, Range: `${from}-${from + 999}` } });
    while (!r.ok && from === 0 && setIdx < colSets.length - 1) {
      // Unknown select column (or missing last_verified in the order) — degrade.
      setIdx++;
      if (setIdx === 1) { contentCols = false; console.error('[verify] Stage-1 columns missing — gallery capture + stalest-first disabled this run (run pnpm db:migrate)'); }
      if (setIdx === 2) { captureHtml = false; console.error('[verify] description_html column missing — content capture disabled this run'); }
      order = setIdx === 0 ? order : '';
      r = await fetch(`${BASE}/rest/v1/deals?${filter}&select=${colSets[setIdx]}${order}`,
        { headers: { ...SUPA, Range: `${from}-${from + 999}` } });
    }
    if (!r.ok) throw new Error(`read deals failed: HTTP ${r.status} ${await r.text()}`);
    const batch = await r.json();
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

/** Build the PATCH body for a write class [M2 amendment]:
 *  liveness → last_updated + last_verified; content → last_verified only.
 *  capture_run_id stamps content-bearing patches (EC-1 provenance). */
function patchBody(fields, klass, hasContent) {
  const now = new Date().toISOString();
  const body = { ...fields };
  if (klass === 'liveness') body.last_updated = now;
  if (contentCols) {
    body.last_verified = now;
    if (hasContent) body.capture_run_id = RUN_ID;
  }
  return body;
}

async function applyPatch(productId, fields, klass, hasContent) {
  if (!/^[\w:.-]+$/.test(productId)) {
    throw new Error(`Invalid/unsafe product ID for patch: ${productId}`);
  }
  const r = await fetch(`${BASE}/rest/v1/deals?product_id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(patchBody(fields, klass, hasContent)),
  });
  if (!r.ok) throw new Error(`patch ${productId}: HTTP ${r.status} ${await r.text()}`);
}

/** Liveness heartbeat: refresh last_updated (+last_verified) on checked-and-
 *  confirmed-alive VISIBLE deals — the signal ingest's stale-hide relies on. */
async function touchBatch(ids, liveness) {
  const now = new Date().toISOString();
  const safeIds = ids.filter(id => /^[\w:.-]+$/.test(id));
  const rejected = ids.length - safeIds.length;
  if (rejected > 0) {
    console.warn(`[verify] touch: rejected ${rejected} unsafe product IDs`);
  }
  if (safeIds.length === 0) return;
  const body = liveness
    ? (contentCols ? { last_updated: now, last_verified: now } : { last_updated: now })
    : (contentCols ? { last_verified: now } : null);
  if (!body) return; // content-class watermark impossible pre-migration — skip, never bump last_updated
  for (let i = 0; i < safeIds.length; i += 80) {
    const chunk = safeIds.slice(i, i + 80).map((id) => `"${id}"`).join(',');
    const r = await fetch(`${BASE}/rest/v1/deals?product_id=in.(${encodeURIComponent(chunk)})`, {
      method: 'PATCH',
      headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`touch batch: HTTP ${r.status} ${await r.text()}`);
  }
}

async function flushPatches() {
  const batch = pendingPatches;
  pendingPatches = [];
  if (batch.length === 0) return;
  for (const p of batch) {
    patchesAttempted++;
    try {
      await applyPatch(p.id, p.fields, p.klass, p.hasContent);
      patchesCommitted++;
    } catch (e) {
      // One retry [FR-3.4] — transient PostgREST hiccups shouldn't drop a row.
      try {
        await applyPatch(p.id, p.fields, p.klass, p.hasContent);
        patchesCommitted++;
      } catch (e2) {
        console.error(`[verify] Failed to apply patch for ${p.id} (after retry):`, e2.message);
      }
    }
  }
}

async function flushTouches() {
  const live = pendingTouches; pendingTouches = [];
  const cont = pendingVerifiedOnly; pendingVerifiedOnly = [];
  if (live.length) {
    try { await touchBatch(live, true); }
    catch (e) { console.error(`[verify] Failed liveness-touch batch of ${live.length}:`, e.message); }
  }
  if (cont.length) {
    try { await touchBatch(cont, false); }
    catch (e) { console.error(`[verify] Failed watermark-touch batch of ${cont.length}:`, e.message); }
  }
}

function queuePatch(id, fields, klass, hasContent) {
  if (!APPLY) return;
  pendingPatches.push({ id, fields, klass, hasContent });
  if (pendingPatches.length >= 50) {
    writePromise = writePromise.then(() => flushPatches());
  }
}

function queueTouch(id) {
  if (!APPLY) return;
  pendingTouches.push(id);
  if (pendingTouches.length >= 80) {
    writePromise = writePromise.then(() => flushTouches());
  }
}

/** Watermark-only touch for hidden rows that stay hidden [M2 amendment]:
 *  records "swept + fetched" (last_verified) WITHOUT the liveness bump. */
function queueVerifiedOnly(id) {
  if (!APPLY) return;
  pendingVerifiedOnly.push(id);
  if (pendingVerifiedOnly.length >= 80) {
    writePromise = writePromise.then(() => flushTouches());
  }
}

// ── per-host fetch outcomes [FR-1.3/EC-1] ─────────────────────────────────────
const hostStats = new Map(); // host -> {ok, err, lastStatus}
function noteHost(host, ok, status) {
  const s = hostStats.get(host) || { ok: 0, err: 0, lastStatus: null };
  if (ok) s.ok++; else { s.err++; s.lastStatus = status || s.lastStatus; }
  hostStats.set(host, s);
}

async function persistFetchOutcomes() {
  if (!APPLY || !contentCols || hostStats.size === 0) return;
  const now = new Date().toISOString();
  const rows = [...hostStats.entries()].map(([host, s]) => ({
    host,
    status: s.err === 0 ? 'ok' : (s.lastStatus === 403 ? 'blocked-403' : s.lastStatus === 429 ? 'blocked-429' : s.lastStatus === 404 ? 'gone' : 'unreachable'),
    http_status: s.lastStatus,
    ok_count: s.ok,
    err_count: s.err,
    last_seen: now,
  }));
  try {
    const r = await fetch(`${BASE}/rest/v1/fetch_outcomes?on_conflict=host`, {
      method: 'POST',
      headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify(rows),
    });
    if (!r.ok) console.warn(`[verify] fetch_outcomes write failed: HTTP ${r.status}`);
    else console.log(`[verify] fetch outcomes persisted for ${rows.length} hosts`);
  } catch (e) { console.warn('[verify] fetch_outcomes write failed:', e.message); }
}

// ── main ───────────────────────────────────────────────────────────────────────
function groupByHost(items) {
  const m = new Map();
  for (const d of items) { const h = hostOf(d.merchant_url); if (!m.has(h)) m.set(h, []); m.get(h).push(d); }
  return m;
}

if (IS_MAIN) (async () => {
  const t0 = Date.now();
  const deals = await fetchDeals();
  const byHost = groupByHost(deals);
  console.log(`[verify] checking ${deals.length} deals across ${byHost.size} shops (apply=${APPLY}, ${DELAY_MS}ms/host, run=${RUN_ID})…`);

  const reasons = {}, errKinds = {};
  let ok = 0, errors = 0, done = 0, hidden = 0, unhidden = 0, priceUpdated = 0, htmlCaptured = 0, galleriesCaptured = 0;
  const samples = [];
  let stopDueToDeadline = false;

  await Promise.all([...byHost.entries()].map(async ([host, list]) => {
    let consec = 0, i = 0;
    for (; i < list.length; i++) {
      if (DEADLINE && Date.now() > DEADLINE) {
        stopDueToDeadline = true;
      }
      if (stopDueToDeadline) {
        break;
      }

      const deal = list[i];
      const live = await liveState(deal);
      done++;
      if (process.stdout.isTTY && done % 25 === 0) process.stdout.write(`\r[verify] ${done}/${deals.length}…`);
      const isHidden = deal.hidden === true;
      if (live.error === 'no-product-url') {
        // No network request was made — skip the pacing sleep entirely.
        errors++;
        errKinds[live.error] = (errKinds[live.error] || 0) + 1;
        continue;
      }
      noteHost(host, !live.error || live.error === 'gone', live.blocked ? (live.error === 'blocked' ? 429 : 403) : live.error === 'gone' ? 404 : null);
      if (live.error === 'gone') {
        // Product page removed at the shop (hard 404, not a transient error).
        consec = 0;
        if (!isHidden) {
          queuePatch(deal.product_id, { hidden: true }, 'liveness', false);
          hidden++;
          reasons.gone = (reasons.gone || 0) + 1;
        } else {
          ok++;
          queueVerifiedOnly(deal.product_id); // stays hidden — watermark only, no liveness bump
        }
      } else if (live.error) {
        errors++;
        errKinds[live.error] = (errKinds[live.error] || 0) + 1;
        consec = live.blocked ? consec + 1 : 0;
      } else {
        consec = 0;
        // Content capture for EVERY fetched row [FR-1.2] — hidden included.
        const contentFields = {};
        if (captureHtml && live.descriptionHtml) {
          const reduced = reduceMerchantHtml(live.descriptionHtml);
          if (reduced && reduced !== (deal.description_html || null)) {
            contentFields.description_html = reduced;
          }
        }
        if (contentCols) {
          const merged = mergeGallery(deal, live.images);
          if (merged) contentFields.gallery = merged;
        }
        const hasContent = Object.keys(contentFields).length > 0;
        if (contentFields.description_html) htmlCaptured++;
        if (contentFields.gallery) galleriesCaptured++;

        const want = decide(deal, live);
        if (want.hide) {
          if (!isHidden) {
            // Visibility change = liveness; carry the captured content along.
            queuePatch(deal.product_id, { hidden: true, ...contentFields }, 'liveness', hasContent);
            hidden++;
            reasons[want.reason] = (reasons[want.reason] || 0) + 1;
          } else if (hasContent) {
            // Stays hidden — content-only write, never bumps last_updated.
            queuePatch(deal.product_id, contentFields, 'content', true);
            ok++;
          } else {
            ok++;
            queueVerifiedOnly(deal.product_id);
          }
        } else {
          const fields = { ...contentFields };
          const priceChanged = want.sale !== deal.sale_price || want.orig !== deal.original_price || want.disc !== deal.discount_percent;
          if (priceChanged) {
            fields.sale_price = want.sale;
            fields.original_price = want.orig;
            fields.discount_percent = want.disc;
            priceUpdated++;
            if (samples.length < 8) samples.push(`${deal.product_id}: ${deal.sale_price} -> ${want.sale} (-${want.disc}%)`);
          }
          if (isHidden) {
            fields.hidden = false;
            unhidden++;
          }
          if (Object.keys(fields).length) {
            // Verified alive: price/visibility changes are liveness; a purely
            // content-bearing patch on a VISIBLE verified-alive row is also
            // liveness (the fetch itself proved availability).
            queuePatch(deal.product_id, fields, 'liveness', hasContent);
          } else {
            ok++;
            queueTouch(deal.product_id);
          }
        }
      }
      await sleep(DELAY_MS);
      if (consec >= ABANDON_AFTER) { i++; break; } // host is blocking — stop hitting it
      if (overBudget()) { i++; console.log(`[verify] time budget reached — leaving ${host} early`); break; }
    }
    const skipped = list.length - i;
    if (skipped > 0) {
      errors += skipped;
      errKinds['skipped-blocked'] = (errKinds['skipped-blocked'] || 0) + skipped;
      console.error(`\n[verify] ${host} is blocking automated checks — skipped ${skipped} (covered by feed + freshness note)`);
    }
  }));
  if (process.stdout.isTTY) process.stdout.write('\n');

  if (stopDueToDeadline) {
    console.warn(`[verify] Deadline reached; aborting checks early`);
  }

  console.log(`\n[verify] checked ${done} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  unchanged: ${ok}`);
  console.log(`  price updates: ${priceUpdated}`);
  console.log(`  hidden (sold-out / no discount): ${hidden} ${JSON.stringify(reasons)}`);
  console.log(`  un-hidden (back in stock): ${unhidden}`);
  console.log(`  merchant descriptions captured/updated: ${htmlCaptured}${captureHtml ? '' : ' (capture disabled — column missing)'}`);
  console.log(`  galleries captured/topped-up: ${galleriesCaptured}${contentCols ? '' : ' (disabled — column missing)'}`);
  console.log(`  errors/skipped: ${errors} ${JSON.stringify(errKinds)}`);
  if (samples.length) { console.log('  sample price updates:'); samples.forEach((s) => console.log(`    ${s}`)); }

  if (!APPLY) {
    console.log('\n[verify] dry-run — no writes. Re-run with --apply to commit.');
    return;
  }

  // Flush remaining updates in the queues
  console.log(`[verify] flushing final patches and touches...`);
  await writePromise.then(() => Promise.all([flushPatches(), flushTouches()]));
  await persistFetchOutcomes();
  // Pinned grammar [EC-11] — committed vs attempted, not just attempted.
  console.log(`[verify] patches committed=${patchesCommitted} attempted=${patchesAttempted}`);
  console.log(`[verify] applied changes and confirmed unchanged.`);

  // High-error exit threshold check: exit non-zero if errors/done > 80%
  const totalProcessed = done + errors;
  const errorRate = totalProcessed > 0 ? (errors / totalProcessed) : 0;
  if (errorRate > 0.80) {
    console.error(`\n[verify] FAILED: error rate too high: ${(errorRate * 100).toFixed(1)}%`);
    process.exit(1);
  }
})().catch((e) => { console.error('\n[verify] FAILED:', e.message); process.exit(1); });

// Pure helpers exported for tests (the main loop is gated on require.main).
module.exports = { patchBody, mergeGallery, normalizeImages, decide, pickVariant, unproxy, _test: { flushPatches, queuePatch, pending: () => pendingPatches } };

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
