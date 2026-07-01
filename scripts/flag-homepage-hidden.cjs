// Flags deals whose MERCHANT PAGE is known to show a different price once its
// JavaScript runs (a variant-picker bug on the shop's own site — it resets to a
// different option combination than the one we linked to, regardless of the
// `?variant=` in the URL). Confirmed via headless-browser rendering on
// 2026-07-01 across all Sunshare product pages.
//
// These deals are NOT removed — they're still perfectly valid, clickable deals
// (their in-DB price is the correct checkout price for that specific SKU). They
// are only excluded from the HOMEPAGE (which is what a new visitor judges the
// site by), while staying fully visible via category browsing and search.
//
// Run: node scripts/flag-homepage-hidden.cjs [--apply]
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
'use strict';

const fs = require('fs');
const path = require('path');

// Shopify product handles (from merchant_url) confirmed to swap price after JS.
// Add/remove handles here as merchants fix or introduce this behaviour — this
// script re-syncs `homepage_hidden` to exactly match the list on every run.
const BUGGY_HANDLES = new Set([
  'ray-balkonkraftwerk-mit-einstellbarer-halterung',       // shows €90 -> €209
  'ray-lite-balkonkraftwerk-mit-einstellbarer-halterung',  // shows €412 -> €162
  'glory-balkonkraftwerk-mit-4-0-kwh-speicher',            // shows €1299 -> €1139
  'glory-balkonkraftwerk-mit-speicher',                    // shows €459 -> €1235
  'glory-semi-solid-balkonkraftwerk-mit-2-05-kwh-speicher', // shows €519 -> €1355
]);

const APPLY = process.argv.includes('--apply');

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
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

function handleOf(merchantUrl) {
  try { return new URL(merchantUrl).pathname.match(/\/products\/([^/?#]+)/)?.[1] ?? null; }
  catch { return null; }
}

async function fetchAll() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${BASE}/rest/v1/deals?merchant_url=not.is.null&select=product_id,merchant_url,homepage_hidden`,
      { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`read failed: HTTP ${r.status} ${await r.text()}`);
    const batch = await r.json();
    out.push(...batch);
    if (batch.length < 1000) break;
  }
  return out;
}

async function patch(productId, homepageHidden) {
  const r = await fetch(`${BASE}/rest/v1/deals?product_id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ homepage_hidden: homepageHidden }),
  });
  if (!r.ok) throw new Error(`patch ${productId}: HTTP ${r.status} ${await r.text()}`);
}

(async () => {
  const deals = await fetchAll();
  const toHide = [], toUnhide = [];
  for (const d of deals) {
    const handle = handleOf(d.merchant_url);
    const shouldHide = handle ? BUGGY_HANDLES.has(handle) : false;
    if (shouldHide && !d.homepage_hidden) toHide.push(d.product_id);
    else if (!shouldHide && d.homepage_hidden) toUnhide.push(d.product_id);
  }
  console.log(`[flag] ${deals.length} deals scanned`);
  console.log(`  to hide from homepage:   ${toHide.length}`);
  console.log(`  to re-show on homepage:  ${toUnhide.length}`);

  if (!APPLY) { console.log('\n[flag] dry-run — no writes. Re-run with --apply to commit.'); return; }
  for (const id of toHide) await patch(id, true);
  for (const id of toUnhide) await patch(id, false);
  console.log(`\n[flag] applied: ${toHide.length} hidden, ${toUnhide.length} un-hidden.`);
})().catch((e) => { console.error('[flag] FAILED:', e.message); process.exit(1); });

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
