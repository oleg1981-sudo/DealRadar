// Gallery enrichment — gives every deal page the SAME multi-image gallery.
//
// Some Awin feeds ship several product images, others (e.g. BlazeVideo) ship
// only the single 200×200 proxy thumbnail. The merchant's live Shopify page
// carries the full image set at `…/products/<handle>.js` (the same endpoint
// the daily verifier reads), so this job tops up any deal whose gallery has
// fewer than MIN_IMAGES real images. Respectful like the verifier: per-host
// pacing, one gentle retry, abandons a host that keeps blocking.
//
// Runs after the daily verify (see .github/workflows/verify-awin.yml), so new
// single-image products are enriched within a day of ingestion.
//
//   node scripts/enrich-galleries.cjs            # dry-run: report what would change
//   node scripts/enrich-galleries.cjs --apply    # write enriched galleries
//   node scripts/enrich-galleries.cjs --limit 5  # cap checked deals (smoke test)
//   node scripts/enrich-galleries.cjs --max-minutes 25  # soft wall-clock budget (stop cleanly)
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = (() => { const i = args.indexOf('--limit'); return i >= 0 ? parseInt(args[i + 1], 10) || 0 : 0; })();
// Soft wall-clock budget [FR-3.1], same semantics as verify-awin.cjs: stop
// starting new fetches once the budget is spent so the workflow's later steps
// (snapshot, IndexNow) always get their turn instead of a job-timeout kill.
// Flag present with a missing/invalid/negative value → bounded default (25),
// never a silently-unbounded run.
const MAX_MINUTES = (() => {
  const i = args.indexOf('--max-minutes');
  if (i < 0) return 0;
  const n = parseInt(args[i + 1], 10);
  if (!Number.isFinite(n) || n <= 0) { console.warn('[gallery] invalid --max-minutes value — defaulting to 25'); return 25; }
  return n;
})();
const T_START = Date.now();
const overBudget = () => MAX_MINUTES && Date.now() - T_START > MAX_MINUTES * 60000;
const MIN_IMAGES = 2;   // a gallery smaller than this gets topped up
const MAX_IMAGES = 6;   // matches what the feed ingestion keeps
const DELAY_MS = 1000;
const ABANDON_AFTER = 5;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json,text/plain,*/*',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
};

loadEnvLocal();
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
const hostOf = (u) => { try { return new URL(u).host; } catch { return '?'; } };

/** productserve proxy → the original image its `url` param embeds (see
 *  unproxyImage in src/lib/utils/product-details.ts — same logic). */
function unproxy(u) {
  if (!/(^|\.)productserve\.com\//i.test(u)) return u;
  try {
    const inner = new URL(u).searchParams.get('url');
    if (!inner) return u;
    const o = /^https?:\/\//i.test(inner) ? inner : 'https://' + inner.replace(/^ssl:/i, '');
    return new URL(o).protocol === 'https:' ? o : u;
  } catch { return u; }
}

/** Live product images from the shop's Shopify product JSON. Unlike the price
 *  verifier we don't care which MARKET answers (images are identical across
 *  currencies), so try the market path first and fall back to the base path
 *  (stores like BlazeVideo don't use /de/ market URLs at all). */
async function fetchShopImages(deal) {
  let u;
  try { u = new URL(deal.merchant_url); } catch { return { error: 'no-product-url' }; }
  const m = u.pathname.match(/\/products\/([^/?#]+)/);
  if (!m) return { error: 'no-product-url' };
  const cc = (deal.country || 'DE').toLowerCase();
  const candidates = [
    `${u.origin}/${cc}/products/${m[1]}.js?country=${cc.toUpperCase()}`,
    `${u.origin}/products/${m[1]}.js`,
  ];
  let lastError = 'unreachable';
  for (const url of candidates) {
    let res;
    try { res = await fetch(url, { headers: HEADERS }); }
    catch (e) { lastError = `fetch:${e.message}`; continue; }
    if (res.status === 429 || res.status === 403) return { error: `blocked-${res.status}`, blocked: true };
    if (!res.ok) { lastError = `http-${res.status}`; continue; }
    let json;
    try { json = await res.json(); } catch { lastError = 'bad-json'; continue; }
    const images = (json.images || [])
      .map((i) => (typeof i === 'string' ? i : i?.src || ''))
      .map((i) => (i.startsWith('//') ? `https:${i}` : i))
      .filter((i) => /^https:\/\//.test(i));
    return { images };
  }
  return { error: lastError };
}

(async () => {
  const t0 = Date.now();
  // All visible deals with a live product URL; filter to sparse galleries here.
  const rows = [];
  const cols = 'product_id,shop_name,country,gallery,image_url,merchant_url';
  let orderClause = '&order=last_verified.asc.nullsfirst,product_id.asc';
  for (let from = 0; ; from += 1000) {
    // Stalest-first: budget-truncated runs rotate coverage instead of
    // re-trying the same head-of-list rows every day (interim until the
    // verifier owns gallery capture in Stage 2). Falls back to unordered
    // (sticky for the whole read) when last_verified isn't migrated yet.
    let r = await fetch(`${BASE}/rest/v1/deals?hidden=eq.false&merchant_url=not.is.null&select=${cols}${orderClause}`,
      { headers: { ...SUPA, Range: `${from}-${from + 999}` } });
    if (!r.ok && from === 0 && orderClause) {
      orderClause = '';
      r = await fetch(`${BASE}/rest/v1/deals?hidden=eq.false&merchant_url=not.is.null&select=${cols}`,
        { headers: { ...SUPA, Range: `${from}-${from + 999}` } });
    }
    if (!r.ok) throw new Error(`read deals failed: HTTP ${r.status} ${await r.text()}`);
    const batch = await r.json();
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  let sparse = rows.filter((d) => {
    const raw = d.gallery && d.gallery.length ? d.gallery : [d.image_url].filter(Boolean);
    return new Set(raw.map(unproxy)).size < MIN_IMAGES;
  });
  if (LIMIT) sparse = sparse.slice(0, LIMIT);
  console.log(`[gallery] ${sparse.length} of ${rows.length} visible deals need enrichment (apply=${APPLY})`);
  if (!sparse.length) return;

  // Group by host so the pacing is per shop.
  const byHost = new Map();
  for (const d of sparse) { const h = hostOf(d.merchant_url); if (!byHost.has(h)) byHost.set(h, []); byHost.get(h).push(d); }

  let enriched = 0, unchanged = 0, errors = 0;
  const samples = [];
  await Promise.all([...byHost.entries()].map(async ([host, list]) => {
    let consec = 0;
    for (let i = 0; i < list.length; i++) {
      if (overBudget()) {
        errors += list.length - i;
        console.error(`[gallery] ${host}: --max-minutes budget reached — skipped remaining ${list.length - i} (picked up next run)`);
        break;
      }
      const deal = list[i];
      const live = await fetchShopImages(deal);
      if (live.error) {
        errors++;
        consec = live.blocked ? consec + 1 : 0;
        if (consec >= ABANDON_AFTER) { errors += list.length - i - 1; console.error(`[gallery] ${host} is blocking — skipped the rest`); break; }
        await sleep(DELAY_MS);
        continue;
      }
      consec = 0;
      const current = (deal.gallery && deal.gallery.length ? deal.gallery : [deal.image_url].filter(Boolean)).map(unproxy);
      const merged = [...new Set([...current, ...live.images])].slice(0, MAX_IMAGES);
      if (merged.length > new Set(current).size) {
        if (APPLY) {
          const r = await fetch(`${BASE}/rest/v1/deals?product_id=eq.${encodeURIComponent(deal.product_id)}`, {
            method: 'PATCH',
            headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ gallery: merged }),
          });
          if (!r.ok) throw new Error(`patch ${deal.product_id}: HTTP ${r.status} ${await r.text()}`);
        }
        enriched++;
        if (samples.length < 5) samples.push(`${deal.product_id}: ${new Set(current).size} → ${merged.length} images`);
      } else unchanged++;
      await sleep(DELAY_MS);
    }
  }));

  console.log(`[gallery] done in ${((Date.now() - t0) / 1000).toFixed(1)}s — enriched ${enriched}, unchanged ${unchanged}, errors ${errors}`);
  samples.forEach((s) => console.log(`  ${s}`));
  if (!APPLY) console.log('[gallery] dry-run — no writes. Re-run with --apply to commit.');
})().catch((e) => { console.error('\n[gallery] FAILED:', e.message); process.exit(1); });

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
