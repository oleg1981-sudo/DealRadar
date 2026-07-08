// Daily price snapshot — records the REAL price history the cardiogram shows.
//
// Writes one `price_history` row per visible deal per UTC day. Runs twice a day
// from the workflows, and both runs are idempotent upserts on (product_id, day):
//   - after the 03:00 UTC feed ingest  → snapshots feed prices (covers new deals)
//   - after the 05:00 UTC live verify  → same-day upsert, so the live-verified
//     price overwrites the feed price and wins the day
// Hidden deals are skipped: sold-out / no-discount rows have no meaningful
// "today's price". History rows are never deleted — a deal that disappears
// keeps its recorded past, and the UI simply shows the days that exist.
//
// Dependency-free (Node built-ins + Supabase REST), like its siblings.
//
//   node scripts/snapshot-prices.cjs            # dry-run: report what would be written
//   node scripts/snapshot-prices.cjs --apply    # write today's snapshots
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const BATCH = 500;

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

async function fetchVisibleDeals() {
  const out = [];
  const cols = 'product_id,sale_price,original_price,currency';
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${BASE}/rest/v1/deals?hidden=eq.false&select=${cols}`,
      { headers: { ...SUPA, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`read deals failed: HTTP ${r.status} ${await r.text()}`);
    const batch = await r.json();
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

async function upsertBatch(rows) {
  const r = await fetch(`${BASE}/rest/v1/price_history?on_conflict=product_id,day`, {
    method: 'POST',
    headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`snapshot upsert failed: HTTP ${r.status} ${await r.text()}`);
}

(async () => {
  const t0 = Date.now();
  const now = new Date();
  const day = now.toISOString().slice(0, 10); // UTC day — both daily runs land on the same date
  const deals = await fetchVisibleDeals();
  console.log(`[snapshot] ${deals.length} visible deals → price_history day=${day} (apply=${APPLY})`);

  const rows = deals.map((d) => ({
    product_id: d.product_id,
    day,
    sale_price: d.sale_price,
    original_price: d.original_price,
    currency: d.currency,
    recorded_at: now.toISOString(), // explicit so the later same-day upsert restamps it
  }));

  if (!APPLY) {
    rows.slice(0, 5).forEach((r) => console.log(`  ${r.product_id}: ${r.sale_price} ${r.currency} (was ${r.original_price})`));
    console.log('[snapshot] dry-run — no writes. Re-run with --apply to commit.');
    return;
  }
  let written = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    await upsertBatch(rows.slice(i, i + BATCH));
    written += Math.min(BATCH, rows.length - i);
  }
  console.log(`[snapshot] wrote ${written} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
})().catch((e) => { console.error('\n[snapshot] FAILED:', e.message); process.exit(1); });

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
