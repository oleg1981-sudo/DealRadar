#!/usr/bin/env node
// Thin-loop drill (v3.1 T-MON-4) — proves the revenue loop's PLUMBING works,
// independent of whether a real affiliate network is live yet (T-ING-2, the
// AWIN/Kelkoo credential approval, is a separate human/business action — this
// script never touches or needs real affiliate credentials).
//
// It drives one synthetic deal through the exact machinery the real flow uses:
//
//   1. SEED     insert a synthetic `drill:test-<hex>` deal row (hidden from the
//               live site the whole time — belt-and-suspenders on top of cleanup)
//   2. RENDER   decorateAffiliateUrl(...) — the SAME function the PDP calls to
//               build the outbound affiliate link + sub-id
//   3. CLICK    decodeSubId(...) — the SAME round-trip the postback handler uses
//               to recover the productId from a network's sub-id echo
//   4. POSTBACK invoke the REAL POST handler from src/app/api/postbacks/route.ts
//               (not a reimplementation) with a signed, constructed request
//   5. ASSERT   query `transactions` for the row the handler should have written
//   6. CLEANUP  delete the synthetic transaction + deal + price_history rows
//               (always, even on assertion failure — try/finally)
//
// Why this needs `--conditions=react-server` + tsx (unlike its dependency-free
// scripts/*.cjs siblings): steps 2-4 import the REAL src/lib/utils/affiliate.ts
// and src/app/api/postbacks/route.ts modules — not reimplementations — per the
// task brief ("uses real, already-tested machinery rather than reinventing
// it"). Those modules use the `@/...` path alias and `import 'server-only'`.
// tsx resolves the alias + strips types; `react-server` is the SAME export
// condition Next's own server compiler sets, so `server-only` is the correct
// no-op here exactly as it is in the real server build — no monkey-patching.
// Consequence: `pnpm install` (which this repo's dependency-free ops scripts
// deliberately skip in CI) IS required before running this one.
//
// Usage:
//   node scripts/thin-loop-drill.mjs
//
// Required env (same vars the rest of scripts/ already uses — see .env.example;
// no affiliate-network credentials are needed):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, WEBHOOK_SECRET
//
// Exits non-zero on any assertion failure (or if required env is missing).

import { spawnSync } from 'node:child_process';

if (!process.env.__TLD_RELAUNCHED__) {
  const res = spawnSync(
    process.execPath,
    ['--conditions=react-server', '--import', 'tsx', process.argv[1], ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, __TLD_RELAUNCHED__: '1' } },
  );
  if (res.error) {
    console.error(`[drill] failed to launch under tsx: ${res.error.message}`);
    console.error('[drill] is `tsx` installed? run `pnpm install` first.');
    process.exit(1);
  }
  process.exit(res.status ?? 1);
}

// ─── everything below runs INSIDE the tsx-loaded relaunch ──────────────────

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

loadEnvLocal();

function normalizeBaseUrl(u) {
  u = (u || '').trim();
  if (!u) return u;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}

const BASE = normalizeBaseUrl(process.env.SUPABASE_URL);
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

const missing = [];
if (!BASE) missing.push('SUPABASE_URL');
if (!KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
if (!WEBHOOK_SECRET) missing.push('WEBHOOK_SECRET');
if (missing.length) {
  console.error(`[drill] missing required env: ${missing.join(', ')}`);
  console.error('[drill] set them in .env.local (see .env.example) — none of these are affiliate-network credentials.');
  process.exit(1);
}

const SUPA = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function restInsert(table, row) {
  const r = await fetch(`${BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SUPA, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`insert into ${table} failed: HTTP ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows[0];
}

async function restSelect(table, query) {
  const r = await fetch(`${BASE}/rest/v1/${table}?${query}`, { headers: SUPA });
  if (!r.ok) throw new Error(`select from ${table} failed: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

async function restDelete(table, query) {
  const r = await fetch(`${BASE}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { ...SUPA, Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error(`delete from ${table} failed: HTTP ${r.status} ${await r.text()}`);
}

let failures = 0;
function check(name, ok, detail = '') {
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`[drill] ${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

function step(n, title) {
  console.log(`\n=== STEP ${n}/6: ${title} ===`);
}

(async () => {
  // Real, already-tested machinery — not reimplemented (T-MON-4 brief).
  const { buildSubId, decodeSubId, decorateAffiliateUrl } = await import('../src/lib/utils/affiliate.ts');
  const { NextRequest } = await import('next/server');
  const { POST: postbackPOST } = await import('../src/app/api/postbacks/route.ts');

  const suffix = crypto.randomBytes(4).toString('hex'); // unique per run, never Date.now()/Math.random()
  const productId = `drill:test-${suffix}`;
  const transactionId = `drill-tx-${suffix}`;
  const shopUrl = `https://example.com/drill/${suffix}`;
  const source = 'awin';
  const country = 'DE';
  const category = 'electronics';
  const originalPrice = 129.99;
  const salePrice = 89.99;
  const discountPercent = Math.round((1 - salePrice / originalPrice) * 100);
  const commissionEarned = 4.99;
  const status = 'approved';

  let dealSeeded = false;
  let seededDeal = null;

  try {
    // ── 1. SEED ──────────────────────────────────────────────────────────
    step(1, 'SEED — insert synthetic deal');
    seededDeal = await restInsert('deals', {
      product_id: productId,
      product_name: `Thin-Loop Drill Probe ${suffix}`,
      shop_name: 'Drill Test Shop',
      shop_url: shopUrl,
      original_price: originalPrice,
      sale_price: salePrice,
      discount_percent: discountPercent,
      currency: 'EUR',
      category,
      country,
      source,
      // Hidden everywhere on the live site for the whole lifetime of this row,
      // belt-and-suspenders on top of the finally-block cleanup below — this
      // can run against a real (production) Supabase project.
      hidden: true,
      homepage_hidden: true,
    });
    dealSeeded = true;
    console.log(`[drill] seeded deal product_id=${productId} slug=${seededDeal?.slug}`);

    // ── 2. RENDER ────────────────────────────────────────────────────────
    step(2, 'RENDER — decorateAffiliateUrl() (same call the PDP makes)');
    const decoratedUrl = decorateAffiliateUrl(shopUrl, source, country, category, productId);
    const subid = new URL(decoratedUrl).searchParams.get('clickref');
    console.log(`[drill] decorated URL: ${decoratedUrl}`);
    console.log(`[drill] sub-id (clickref): ${subid}`);
    check('decorated URL carries a clickref sub-id', Boolean(subid));

    // ── 3. CLICK ─────────────────────────────────────────────────────────
    step(3, 'CLICK — decodeSubId() round-trip (same call the postback handler makes)');
    const decoded = decodeSubId(subid ?? '');
    console.log(`[drill] decoded sub-id:`, decoded);
    check('sub-id round-trips to the exact seeded productId', decoded?.productId === productId,
      `expected=${productId} got=${decoded?.productId}`);

    // ── 4. POSTBACK ──────────────────────────────────────────────────────
    step(4, 'POSTBACK — invoke the REAL POST handler from api/postbacks/route.ts');
    const req = new NextRequest(`https://dealradar.me/api/postbacks?secret=${encodeURIComponent(WEBHOOK_SECRET)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        transaction_id: transactionId,
        network: source,
        commission_earned: commissionEarned,
        status,
        clickref: subid,
      }),
    });
    const res = await postbackPOST(req);
    const body = await res.json();
    console.log(`[drill] postback response: HTTP ${res.status}`, body);
    check('postback handler returned HTTP 200', res.status === 200, `got ${res.status}`);
    check('postback handler persisted the transaction', body?.persisted === true, JSON.stringify(body));

    // ── 5. ASSERT ────────────────────────────────────────────────────────
    step(5, 'ASSERT — query transactions for the ledger row');
    const rows = await restSelect(
      'transactions',
      `transaction_id=eq.${encodeURIComponent(transactionId)}&select=*`,
    );
    console.log(`[drill] transactions rows found: ${rows.length}`, rows);
    check('exactly one transaction row was written', rows.length === 1, `count=${rows.length}`);
    const tx = rows[0];
    if (tx) {
      check('transaction.product_id matches the decoded productId', tx.product_id === productId,
        `expected=${productId} got=${tx.product_id}`);
      check('transaction.commission_earned matches', Number(tx.commission_earned) === commissionEarned,
        `expected=${commissionEarned} got=${tx.commission_earned}`);
      check('transaction.status matches', tx.status === status, `expected=${status} got=${tx.status}`);
      check('transaction.network matches', tx.network === source, `expected=${source} got=${tx.network}`);
    }
  } catch (e) {
    console.error(`[drill] ERROR during drill: ${e.stack || e.message}`);
    failures++;
  } finally {
    // ── 6. CLEANUP ───────────────────────────────────────────────────────
    step(6, 'CLEANUP — delete synthetic rows (always runs)');
    let cleanupFailed = false;
    try {
      await restDelete('transactions', `transaction_id=eq.${encodeURIComponent(transactionId)}`);
      console.log(`[drill] deleted transactions row(s) for transaction_id=${transactionId}`);
    } catch (e) {
      cleanupFailed = true;
      console.error(`[drill] cleanup FAILED (transactions): ${e.message}`);
    }
    try {
      await restDelete('price_history', `product_id=eq.${encodeURIComponent(productId)}`);
      console.log(`[drill] deleted price_history row(s) for product_id=${productId}`);
    } catch (e) {
      cleanupFailed = true;
      console.error(`[drill] cleanup FAILED (price_history): ${e.message}`);
    }
    if (dealSeeded) {
      try {
        await restDelete('deals', `product_id=eq.${encodeURIComponent(productId)}`);
        console.log(`[drill] deleted deals row for product_id=${productId}`);
      } catch (e) {
        cleanupFailed = true;
        console.error(`[drill] cleanup FAILED (deals): ${e.message}`);
      }
    }
    if (cleanupFailed) {
      failures++;
      console.error('[drill] cleanup left residue behind — check the DB manually.');
    }
  }

  console.log(
    failures === 0
      ? '\n[drill] THIN-LOOP DRILL: PASS — render -> click -> postback -> ledger all verified end-to-end.'
      : `\n[drill] THIN-LOOP DRILL: ${failures} check(s) FAILED.`,
  );
  process.exit(failures === 0 ? 0 : 1);
})();

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
