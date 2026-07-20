// Platform-agnostic liveness verifier — the safety net for NON-Shopify sellers.
//
// The Shopify verifier (verify-awin.cjs) only understands `…/products/<handle>`
// URLs: it reads the shop's product JSON for live price + stock. Merchants that
// aren't Shopify (or don't use /products/ paths) — e.g. Lyra Pet, Aliva
// Apotheke, both added by ingest-v2 — are SILENTLY SKIPPED by it, so a deal
// whose product page is long dead (404) stays live on the site forever.
//
// This job closes that gap with the one check that works on ANY platform:
// does the product page still resolve? It GETs each such deal's merchant_url
// and HIDES the deal when the page is a hard 404/410 (gone). It deliberately
// does NOT touch price, stock, discount, or heartbeat — it can't read those
// without platform-specific parsing, and heartbeating would defeat the ingest's
// stale-hide. It only removes the provably-dead.
//
// Conservative by design (never hide on doubt):
//   - 404 / 410                     -> HIDE (gone). Kept in DB, not deleted.
//   - 200 (after redirects)         -> leave as-is (ingest governs freshness)
//   - 403 / 429  (blocked)          -> skip; abandon a host after N in a row
//   - 5xx / network / timeout       -> skip (transient)
// Un-hide is intentionally NOT done here: these merchants are unverifiable on
// price, so a live page alone isn't proof the discount is still valid — leave
// resurrection to a real feed re-ingest.
//
// Dependency-free (Node built-ins + Supabase REST). Runs in the daily verify
// workflow after the Shopify pass.
//
//   node scripts/verify-liveness.cjs            # dry-run: report what would hide
//   node scripts/verify-liveness.cjs --apply    # write the hides
//   node scripts/verify-liveness.cjs --limit 30 # cap checked deals (smoke test)
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

const APPLY = has('--apply');
const LIMIT = parseInt(opt('--limit', '0'), 10) || 0;
const DELAY_MS = parseInt(opt('--delay', '1000'), 10) || 1000; // per-host pacing
// Soft wall-clock budget [FR-3.1]: bounded so this step cannot overrun the
// shared 150-min verify job (default present-with-invalid → 20).
const MAX_MINUTES = (() => { const i = args.indexOf('--max-minutes'); if (i < 0) return 0; const n = parseInt(args[i + 1], 10); return Number.isFinite(n) && n > 0 ? n : 20; })();
const T_START = Date.now();
const overBudget = () => MAX_MINUTES && Date.now() - T_START > MAX_MINUTES * 60000;
const ABANDON_AFTER = 5;                                        // consecutive blocks on a host -> skip its rest
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

// This job owns exactly the deals the Shopify verifier can't: a product URL
// that isn't a `/products/<handle>` path.
const isShopifyProductUrl = (u) => /\/products\/[^/?#]+/.test(u || '');

/** GET a URL following redirects, one gentle retry on 429. Returns the final
 *  HTTP status (0 on network error). We only need the status, not the body. */
async function liveStatus(url, attempt = 0) {
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
  } catch {
    return 0; // network error / timeout — transient
  }
  if (res.status === 429 && attempt < 1) {
    const ra = parseInt(res.headers.get('retry-after') || '', 10);
    await sleep(Number.isFinite(ra) ? Math.min(ra * 1000, 5000) : 2000);
    return liveStatus(url, attempt + 1);
  }
  return res.status;
}

async function fetchNonShopifyDeals() {
  const out = [];
  const cols = 'product_id,shop_name,merchant_url';
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${BASE}/rest/v1/deals?source=eq.awin&hidden=eq.false&merchant_url=not.is.null&select=${cols}`,
      { headers: { ...SUPA, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`read deals failed: HTTP ${r.status} ${await r.text()}`);
    const batch = await r.json();
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  const targets = out.filter((d) => !isShopifyProductUrl(d.merchant_url));
  return LIMIT ? targets.slice(0, LIMIT) : targets;
}

async function hideDeal(productId) {
  const r = await fetch(`${BASE}/rest/v1/deals?product_id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ hidden: true, last_updated: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`hide ${productId}: HTTP ${r.status} ${await r.text()}`);
}

function groupByHost(items) {
  const m = new Map();
  for (const d of items) { const h = hostOf(d.merchant_url); if (!m.has(h)) m.set(h, []); m.get(h).push(d); }
  return m;
}

(async () => {
  const t0 = Date.now();
  const deals = await fetchNonShopifyDeals();
  const byHost = groupByHost(deals);
  console.log(`[liveness] checking ${deals.length} non-Shopify deals across ${byHost.size} shops (apply=${APPLY}, ${DELAY_MS}ms/host)…`);

  const toHide = [];
  let alive = 0, gone = 0, skipped = 0, done = 0;
  const bySh = {};
  const samples = [];

  await Promise.all([...byHost.entries()].map(async ([host, list]) => {
    let consec = 0, i = 0;
    for (; i < list.length; i++) {
      if (overBudget()) { console.log(`[liveness] --max-minutes budget reached — leaving ${host} early`); break; }
      const deal = list[i];
      const status = await liveStatus(deal.merchant_url);
      done++;
      if (process.stdout.isTTY && done % 25 === 0) process.stdout.write(`\r[liveness] ${done}/${deals.length}…`);
      if (status === 404 || status === 410) {
        consec = 0; gone++;
        toHide.push(deal.product_id);
        bySh[deal.shop_name] = (bySh[deal.shop_name] || 0) + 1;
        if (samples.length < 8) samples.push(`${deal.shop_name}: ${deal.merchant_url}`);
      } else if (status === 200) {
        consec = 0; alive++;
      } else if (status === 403 || status === 429) {
        skipped++; consec++;
      } else {
        skipped++; consec = 0; // 5xx / network — transient, don't count as a block
      }
      await sleep(DELAY_MS);
      if (consec >= ABANDON_AFTER) { i++; break; } // host is blocking — stop hitting it
    }
    const left = list.length - i;
    if (left > 0) { skipped += left; console.error(`\n[liveness] ${host} is blocking — skipped ${left}`); }
  }));
  if (process.stdout.isTTY) process.stdout.write('\n');

  console.log(`\n[liveness] checked ${done} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  alive (200): ${alive}`);
  console.log(`  GONE (404/410) -> hide: ${gone} ${JSON.stringify(bySh)}`);
  console.log(`  skipped (blocked/transient): ${skipped}`);
  if (samples.length) { console.log('  sample dead pages:'); samples.forEach((s) => console.log(`    ${s}`)); }

  if (!APPLY) { console.log('\n[liveness] dry-run — no writes. Re-run with --apply to commit.'); return; }
  for (const id of toHide) await hideDeal(id);
  console.log(`\n[liveness] applied — hid ${toHide.length} dead deals.`);
})().catch((e) => { console.error('\n[liveness] FAILED:', e.message); process.exit(1); });

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
