#!/usr/bin/env node
// Spine smoke test (audit P0 loop). Run against a running instance:
//   BASE_URL=https://staging.dealradar.eu node scripts/smoke-spine.mjs
//   BASE_URL=http://localhost:3000 node scripts/smoke-spine.mjs
//
// Auth/404 checks run anywhere. The slug-200 and alert-dispatch checks need a
// seeded deal + price_alert (Supabase configured) and are skipped with a NOTE
// when SMOKE_SLUG / SMOKE_* env are absent.
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const LOCALE = process.env.SMOKE_LOCALE || 'en';
let fail = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const note = (m) => console.log('NOTE ' + m);

async function main() {
  // 1) bogus slug -> 404 (R-RTE-1)
  try {
    const r = await fetch(`${BASE}/${LOCALE}/deal/this-slug-does-not-exist-zzz`, { redirect: 'manual' });
    ok(r.status === 404, `bogus deal slug returns 404 (got ${r.status})`);
  } catch (e) { ok(false, `deal page request failed: ${e.message}`); }

  // 2) one-click unsubscribe with a bad token -> 400, no deletion (R-MAIL-3/4)
  try {
    const r = await fetch(`${BASE}/api/alerts/unsubscribe?email=a@b.com&productId=awin:1&token=bad`, { method: 'POST' });
    ok(r.status === 400, `one-click unsubscribe POST with bad token returns 400 (got ${r.status})`);
  } catch (e) { ok(false, `unsubscribe POST failed: ${e.message}`); }

  // 3) unsubscribe GET with bad token -> 400 HTML
  try {
    const r = await fetch(`${BASE}/api/alerts/unsubscribe?email=a@b.com&productId=awin:1&token=bad`);
    ok(r.status === 400, `unsubscribe GET with bad token returns 400 (got ${r.status})`);
  } catch (e) { ok(false, `unsubscribe GET failed: ${e.message}`); }

  // 4) refresh-alerts requires auth (R-SEC-2/5)
  try {
    const r = await fetch(`${BASE}/api/refresh-alerts`, { method: 'POST' });
    ok(r.status === 401, `refresh-alerts without bearer returns 401 (got ${r.status})`);
  } catch (e) { ok(false, `refresh-alerts failed: ${e.message}`); }

  // 5) live slug resolves (needs a seeded deal slug)
  if (process.env.SMOKE_SLUG) {
    const r = await fetch(`${BASE}/${LOCALE}/deal/${process.env.SMOKE_SLUG}`, { redirect: 'manual' });
    ok(r.status === 200, `seeded live deal slug returns 200 (got ${r.status})`);
  } else {
    note('SMOKE_SLUG unset — skipping live-slug 200 check (run against staging with a real ingested slug)');
  }
  note('Alert-dispatch (seed price_alert below price, run ingest --upsert, POST /api/refresh-alerts -> email sent + notified=true) requires Supabase+Resend; verify in staging.');

  console.log(fail ? `\nSPINE SMOKE: ${fail} FAILED` : '\nSPINE SMOKE: all runnable checks passed');
  process.exit(fail ? 1 : 0);
}
main();
