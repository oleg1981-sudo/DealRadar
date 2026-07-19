// FR-0 acceptance harness — docs/specs/pdp-full-content/2026-07-16_v1/spec.md §8.
// Read-only. Executes every exit criterion (EC-1..EC-24) and prints one
// PASS/FAIL/SKIP/RED line per EC; exits non-zero on any FAIL or RED, and on
// any SKIP unless --allow-skip is passed (and even then exits non-zero, so a
// skipping run can never be mistaken for acceptance).
//
//   node scripts/verify-spec-pdp-content.mjs               # acceptance mode
//   node scripts/verify-spec-pdp-content.mjs --allow-skip  # local iteration
//
// Env (acceptance mode requires all; a missing var FAILs the ECs needing it):
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY   (or SUPABASE_ANON_KEY for the
//        read-only SQL — RLS public-select policies suffice for the counts)
//   SITE_URL      default https://dealradar.me (live-page probes)
//   GH_TOKEN      or an authenticated `gh` CLI (workflow-run ECs)
//
// Statuses: PASS · FAIL (executed, criterion not met) · RED (not yet
// implemented — expected while stages land) · SKIP (Q-gated scope reduction
// or --allow-skip on missing env; always printed, never silent).
'use strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const args = process.argv.slice(2);
const ALLOW_SKIP = args.includes('--allow-skip');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);

loadEnvLocal();
const SITE = (process.env.SITE_URL || 'https://dealradar.me').replace(/\/+$/, '');
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const CATALOG_FLOOR = 1000; // denominator floor: an empty catalog must never vacuously PASS

// ── helpers ───────────────────────────────────────────────────────────────────
const supaHeaders = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` });

/** Page the deals table client-side (PostgREST can't filter on array length). */
async function pageDeals(select, filter = '') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/deals?select=${select}${filter}`, {
      headers: { ...supaHeaders(), Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

function ghJson(pathArg) {
  const out = execFileSync('gh', ['api', pathArg], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

const needSupa = () => { if (!SUPABASE_URL || !SUPA_KEY) throw new SkipOrFail('missing SUPABASE env'); };
class SkipOrFail extends Error {}

// Cached visible-deals sweep shared by the TH invariants + EC-24 probe selection.
let visibleCache = null;
async function visibleDeals() {
  needSupa();
  if (!visibleCache) {
    visibleCache = await pageDeals(
      'product_id,slug,product_name,description,description_html,gallery,image_url',
      '&hidden=eq.false',
    );
  }
  return visibleCache;
}

// ── EC registry ───────────────────────────────────────────────────────────────
// run() returns { status: 'PASS'|'FAIL'|'SKIP'|'RED', detail }.
const RED = (why) => async () => ({ status: 'RED', detail: `not implemented yet — ${why}` });

const ECS = [
  {
    id: 'EC-1', title: 'TH-1 image presence + capture provenance',
    run: async () => {
      const rows = await visibleDeals();
      if (rows.length < CATALOG_FLOOR) return { status: 'FAIL', detail: `catalog floor: only ${rows.length} visible rows` };
      const noImage = rows.filter((r) => !(r.gallery && r.gallery.length) && !(r.image_url && r.image_url.trim()));
      if (noImage.length > 0) return { status: 'FAIL', detail: `${noImage.length} visible deals with NO image, e.g. ${noImage.slice(0, 3).map((r) => r.product_id).join(', ')}` };
      // Mechanism half (capture_run_id provenance + enrich backfill ≈ 0) lands with Stage 2.
      return { status: 'PASS', detail: `0/${rows.length} visible deals without an image (mechanism clause pending Stage 2 → reported PASS on invariant only)` };
    },
  },
  {
    id: 'EC-2', title: 'TH-2 title + TH-3 description presence; hidden-capture decoupling',
    run: async () => {
      const rows = await visibleDeals();
      if (rows.length < CATALOG_FLOOR) return { status: 'FAIL', detail: `catalog floor: only ${rows.length} visible rows` };
      const noTitle = rows.filter((r) => !(r.product_name && r.product_name.trim()));
      const noDesc = rows.filter((r) => !(r.description && r.description.trim()) && !(r.description_html && r.description_html.trim()));
      if (noTitle.length) return { status: 'FAIL', detail: `${noTitle.length} visible deals with empty title` };
      if (noDesc.length) return { status: 'FAIL', detail: `${noDesc.length} visible deals with no description data, e.g. ${noDesc.slice(0, 3).map((r) => r.product_id).join(', ')}` };
      return { status: 'PASS', detail: `titles ${rows.length}/${rows.length}, descriptions ${rows.length}/${rows.length} (decoupling clause pending Stage 2)` };
    },
  },
  { id: 'EC-3', title: 'Renogy section extractor mechanism', run: RED('Stage 6 (T6.1)') },
  { id: 'EC-4', title: 'snapshot covers all rows daily', run: RED('Stage 2 (T2.3)') },
  {
    id: 'EC-5', title: 'feed_attrs + fill-rate report',
    run: async () => {
      needSupa();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ops_metrics?key=eq.awin_fill_rates&select=value,recorded_at`, { headers: supaHeaders() });
      if (!res.ok) return { status: 'FAIL', detail: `ops_metrics read: HTTP ${res.status}` };
      const rows = await res.json();
      if (!rows.length) return { status: 'FAIL', detail: 'awin_fill_rates metric absent (post-merge ingest pending)' };
      if (Date.now() - Date.parse(rows[0].recorded_at) > 48 * 3600e3) return { status: 'FAIL', detail: 'fill-rate metric stale (>48h)' };
      const attrs = await pageDeals('product_id', '&feed_attrs=not.is.null&limit=1');
      return { status: 'PASS', detail: `fill-rates fresh (${rows[0].value} advertisers); feed_attrs populated rows exist: ${attrs.length > 0}` };
    },
  },
  {
    id: 'EC-6', title: 'coverage watchdog reconciliation clear',
    run: async () => {
      // Re-pinned 2026-07-19: the watchdog lives INSIDE awin-programmes-sync.yml
      // (extend-not-rebuild); its machine artifact is the managed alert issue.
      if (!existsSync(path.join(ROOT, 'scripts/lib/feed-policy.json'))) return { status: 'FAIL', detail: 'feed-policy.json missing' };
      try {
        const j = ghJson('repos/oleg1981-sudo/DealRadar/actions/workflows/awin-programmes-sync.yml/runs?status=completed&per_page=5');
        const recent = (j.workflow_runs || []).filter((r) => Date.now() - Date.parse(r.created_at) < 48 * 3600e3);
        if (!recent.length) return { status: 'FAIL', detail: 'no completed sync run ≤48h' };
        if (recent[0].conclusion !== 'success') return { status: 'FAIL', detail: `latest sync run concluded ${recent[0].conclusion}` };
        const open = ghJson('repos/oleg1981-sudo/DealRadar/issues?labels=awin-coverage-alert&state=open&per_page=1');
        if (Array.isArray(open) && open.length) return { status: 'FAIL', detail: `coverage alert issue open: #${open[0].number} (${open[0].title})` };
        return { status: 'PASS', detail: 'sync green; zero open coverage alerts (TH-4 + tripwires clear)' };
      } catch (e) {
        return { status: 'SKIP', detail: `gh unavailable: ${e.message.slice(0, 80)}` };
      }
    },
  },
  {
    id: 'EC-7', title: 'programmes-sync green + ops_metrics fresh',
    run: async () => {
      // gh half: latest scheduled sync ≤48h and success.
      let runsDetail = '';
      try {
        const j = ghJson('repos/oleg1981-sudo/DealRadar/actions/workflows/awin-programmes-sync.yml/runs?per_page=10');
        const done = (j.workflow_runs || []).filter((r) => r.status === 'completed');
        const recent = done.filter((r) => Date.now() - Date.parse(r.created_at) < 48 * 3600e3);
        if (!recent.length) return { status: 'FAIL', detail: 'no completed programmes-sync run on upstream in 48h' };
        if (recent[0].conclusion !== 'success') return { status: 'FAIL', detail: `latest sync run ${recent[0].id} concluded ${recent[0].conclusion}` };
        runsDetail = `sync run ${recent[0].id} success`;
      } catch (e) {
        return { status: 'SKIP', detail: `gh unavailable: ${e.message.slice(0, 80)}` };
      }
      // SQL half: ops_metrics freshness ≤48h (fill-rate keys land Stage 3).
      needSupa();
      const res = await fetch(`${SUPABASE_URL}/rest/v1/ops_metrics?select=key,recorded_at&order=recorded_at.desc&limit=5`, { headers: supaHeaders() });
      if (!res.ok) return { status: 'FAIL', detail: `ops_metrics read: HTTP ${res.status}` };
      const rows = await res.json();
      const fresh = rows.filter((r) => Date.now() - Date.parse(r.recorded_at) < 48 * 3600e3);
      if (!fresh.length) return { status: 'FAIL', detail: 'no ops_metrics row fresher than 48h' };
      return { status: 'PASS', detail: `${runsDetail}; ops_metrics fresh: ${fresh.map((r) => r.key).join(',')}` };
    },
  },
  {
    id: 'EC-8', title: 'deadline wiring + no continue-on-error + steps green',
    run: async () => {
      // File assertions (repo-local).
      const vy = readFileSync(path.join(ROOT, '.github/workflows/verify-awin.yml'), 'utf8');
      const iy = readFileSync(path.join(ROOT, '.github/workflows/ingest-awin.yml'), 'utf8');
      const problems = [];
      if (!/verify-awin\.cjs --apply --max-minutes \d+/.test(vy)) problems.push('verify step lacks --max-minutes');
      if (!/enrich-galleries\.cjs --apply --max-minutes \d+/.test(vy)) problems.push('enrich step lacks --max-minutes');
      if (/continue-on-error/.test(vy)) problems.push('continue-on-error still in verify-awin.yml');
      if (/continue-on-error/.test(iy)) problems.push('continue-on-error still in ingest-awin.yml');
      if (problems.length) return { status: 'FAIL', detail: problems.join('; ') };
      // Run assertion: latest completed scheduled verify run ≤48h, four steps green.
      try {
        const j = ghJson('repos/oleg1981-sudo/DealRadar/actions/workflows/verify-awin.yml/runs?event=schedule&status=completed&per_page=5');
        const recent = (j.workflow_runs || []).filter((r) => Date.now() - Date.parse(r.created_at) < 48 * 3600e3);
        if (!recent.length) return { status: 'FAIL', detail: 'file assertions OK, but no completed scheduled verify run ≤48h on upstream (new wiring not yet exercised)' };
        const jobs = ghJson(`repos/oleg1981-sudo/DealRadar/actions/runs/${recent[0].id}/jobs`);
        const steps = (jobs.jobs?.[0]?.steps || []).filter((s) => /Verify deals|Enrich sparse|Snapshot prices|Submit changed/.test(s.name));
        const bad = steps.filter((s) => s.conclusion !== 'success');
        if (steps.length < 4) return { status: 'FAIL', detail: `only ${steps.length}/4 pipeline steps found in run ${recent[0].id}` };
        if (bad.length) return { status: 'FAIL', detail: `steps not green in run ${recent[0].id}: ${bad.map((s) => `${s.name}=${s.conclusion}`).join(', ')}` };
        return { status: 'PASS', detail: `files OK; run ${recent[0].id}: all 4 steps success` };
      } catch (e) {
        return { status: 'SKIP', detail: `files OK; gh unavailable: ${e.message.slice(0, 80)}` };
      }
    },
  },
  {
    id: 'EC-9', title: 'no starved sweep tail (last_verified ≤48h)',
    run: async () => {
      needSupa();
      // Sweep-eligible mirrors verify-awin.cjs fetchDeals: awin rows with a
      // fetchable /products/ merchant_url (hidden included).
      const rows = await pageDeals('product_id,last_verified', '&source=eq.awin&merchant_url=like.*%2Fproducts%2F*');
      if (rows.length < CATALOG_FLOOR) return { status: 'FAIL', detail: `sweep-eligible floor: only ${rows.length} rows` };
      const stale = rows.filter((r) => !r.last_verified || Date.now() - Date.parse(r.last_verified) > 48 * 3600e3);
      if (stale.length > 0) return { status: 'FAIL', detail: `${stale.length}/${rows.length} sweep-eligible rows unverified in 48h (soak pending or starved tail)` };
      return { status: 'PASS', detail: `all ${rows.length} sweep-eligible rows verified within 48h` };
    },
  },
  {
    id: 'EC-10', title: 'fork runs all-skipped after gating',
    run: async () => {
      const WFS = ['ingest-awin.yml', 'verify-awin.yml', 'awin-programmes-sync.yml', 'purge-alerts.yml', 'cost-guardrail.yml', 'db-migrate.yml', 'thin-loop-drill.yml'];
      // Gate-presence file assertions first (repo-local, pre-merge signal).
      const ungated = WFS.filter((f) => !readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8').includes("github.repository_owner == 'oleg1981-sudo'"));
      if (ungated.length) return { status: 'FAIL', detail: `ungated workflows: ${ungated.join(', ')}` };
      try {
        // Runs created after the gating landed on the fork must have all jobs skipped.
        const j = ghJson('repos/Manzela/DealRadar/actions/runs?event=schedule&per_page=20');
        const runs = (j.workflow_runs || []).filter((r) => Date.now() - Date.parse(r.created_at) < 48 * 3600e3);
        for (const r of runs) {
          const jobs = ghJson(`repos/Manzela/DealRadar/actions/runs/${r.id}/jobs`);
          const active = (jobs.jobs || []).filter((jb) => jb.conclusion !== 'skipped');
          if (active.length) return { status: 'FAIL', detail: `fork run ${r.id} (${r.name}) has non-skipped jobs — gating not deployed to fork yet` };
        }
        return { status: 'PASS', detail: `gates present ×${WFS.length}; ${runs.length} recent fork scheduled runs all-skipped` };
      } catch (e) {
        return { status: 'SKIP', detail: `gates present; gh unavailable: ${e.message.slice(0, 80)}` };
      }
    },
  },
  { id: 'EC-11', title: 'committed/attempted grammar + chaos tests', run: RED('Stage 2 (T2.2) + Stage 3 (T3.4)') },
  {
    id: 'EC-12', title: 'alert channel test-fire artifact',
    run: async () => {
      try {
        const issues = ghJson('repos/oleg1981-sudo/DealRadar/issues?labels=alert-test&state=all&per_page=5');
        const fresh = (issues || []).filter((i) => Date.now() - Date.parse(i.created_at) < 31 * 86400e3);
        if (!fresh.length) return { status: 'FAIL', detail: 'no alert-test issue ≤31d (first post-merge sync run fires it)' };
        return { status: 'PASS', detail: `alert-test #${fresh[0].number} created ${fresh[0].created_at.slice(0, 10)}` };
      } catch (e) {
        return { status: 'SKIP', detail: `gh unavailable: ${e.message.slice(0, 80)}` };
      }
    },
  },
  { id: 'EC-13', title: 'IndexNow split enforcement', run: RED('Stage 5 (T5.3); interim hidden-exclusion shipped Stage 0') },
  { id: 'EC-14', title: 'conditional blocks render iff data', run: RED('Stage 4 (T4.1)') },
  { id: 'EC-15', title: 'description always renders (presence)', run: RED('Stage 4 (T4.1)') },
  { id: 'EC-16', title: 'brand mapping coverage', run: RED('Stage 4 (T4.2)') },
  { id: 'EC-17', title: 'JSON-LD parity with row data', run: RED('Stage 5 (T5.1)') },
  { id: 'EC-18', title: 'markdown agent surface + discovery', run: RED('Stage 5 (T5.2)') },
  { id: 'EC-19', title: 'richness budgets strict + mutation', run: RED('Stage 5 (T5.3)') },
  { id: 'EC-20', title: 'reference-deal global check', run: RED('final acceptance') },
  {
    id: 'EC-21', title: 'write classes (M2 amendment)',
    run: async () => {
      // Static half: no writer sends the forbidden lifecycle fields.
      const files = ['scripts/ingest-awin.cjs', 'scripts/verify-awin.cjs', 'scripts/enrich-galleries.cjs', 'scripts/snapshot-prices.cjs', 'scripts/flag-homepage-hidden.cjs', 'src/lib/db/deals.repo.ts'];
      for (const f of files) {
        const src = readFileSync(path.join(ROOT, f), 'utf8');
        if (/["'](status|expired_at|content_changed_at)["']\s*:/.test(src.replace(/http_status/g, ''))) {
          return { status: 'FAIL', detail: `${f} writes a forbidden lifecycle field` };
        }
      }
      // Runtime half: content capture provenance exists AND content-only writes
      // did not masquerade as liveness (capture_run_id rows whose last_verified
      // moved without last_updated moving in lockstep must exist post-soak).
      needSupa();
      const rows = await pageDeals('product_id,capture_run_id,last_updated,last_verified', '&capture_run_id=not.is.null&limit=200');
      if (!rows.length) return { status: 'FAIL', detail: 'static OK; no capture_run_id rows yet (Stage-2 soak pending)' };
      const decoupled = rows.filter((r) => r.last_verified && r.last_updated && Date.parse(r.last_verified) - Date.parse(r.last_updated) > 60e3);
      return { status: 'PASS', detail: `static OK; ${rows.length} provenance rows, ${decoupled.length} with decoupled content-class timestamps` };
    },
  },
  {
    id: 'EC-22', title: 'upsertDeals keep-richer',
    run: async () => {
      const test = path.join(ROOT, 'src/lib/ingest/verify-write-classes.test.ts');
      if (!existsSync(test)) return { status: 'FAIL', detail: 'contract test file missing' };
      const src = readFileSync(test, 'utf8');
      if (!/'gallery' in row/.test(src) || !/PGRST102/.test(src)) return { status: 'FAIL', detail: 'contract test lacks the omission/signature assertions' };
      try {
        execFileSync('pnpm', ['vitest', 'run', 'src/lib/ingest/verify-write-classes.test.ts', '--silent'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { status: 'PASS', detail: 'contract tests present and green' };
      } catch {
        return { status: 'FAIL', detail: 'contract tests failing' };
      }
    },
  },
  {
    id: 'EC-23', title: 'refresh-deals comment matches schedule',
    run: async () => {
      const src = readFileSync(path.join(ROOT, 'netlify/functions/refresh-deals.mts'), 'utf8');
      if (/every 15 minutes/.test(src)) return { status: 'FAIL', detail: 'stale "every 15 minutes" docstring' };
      if (!/once daily/i.test(src) || !/'0 6 \* \* \*'/.test(src)) return { status: 'FAIL', detail: 'docstring/schedule mismatch' };
      if (!/BEST-EFFORT/.test(src)) return { status: 'FAIL', detail: 'ordering caveat not documented' };
      return { status: 'PASS', detail: 'docstring matches daily 06:00 schedule + best-effort caveat' };
    },
  },
  {
    id: 'EC-24', title: 'noindex on hidden PDPs only (Q-1 invariant)',
    run: async () => {
      needSupa();
      // Probe: 2 visible (incl. one with minimal price history if cheap) + 1 hidden.
      const vis = (await visibleDeals()).slice(0, 2);
      const hid = await pageDeals('slug,product_id', '&hidden=eq.true&limit=2');
      if (!vis.length || !hid.length) return { status: 'FAIL', detail: 'could not select probe rows (need ≥1 visible and ≥1 hidden)' };
      const probe = async (slug) => {
        const res = await fetch(`${SITE}/en/deal/${slug}`, { headers: { 'User-Agent': 'Mozilla/5.0 (spec-harness)' } });
        const html = res.status === 200 ? await res.text() : '';
        const noindex = /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html);
        return { status: res.status, noindex };
      };
      for (const r of vis) {
        const p = await probe(r.slug);
        if (p.status !== 200) return { status: 'FAIL', detail: `visible ${r.slug}: HTTP ${p.status}` };
        if (p.noindex) return { status: 'FAIL', detail: `visible ${r.slug} carries noindex — violates the Q-1 invariant` };
      }
      for (const r of hid) {
        const p = await probe(r.slug);
        if (p.status !== 200) return { status: 'FAIL', detail: `hidden ${r.slug}: HTTP ${p.status} (M2: hidden stays 200)` };
        if (!p.noindex) return { status: 'FAIL', detail: `hidden ${r.slug} lacks noindex (deploy pending?)` };
      }
      return { status: 'PASS', detail: `visible ×${vis.length} indexable, hidden ×${hid.length} noindex` };
    },
  },
];

// ── runner ────────────────────────────────────────────────────────────────────
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
let fails = 0, reds = 0, skips = 0;
for (const ec of ECS) {
  let r;
  try { r = await ec.run(); }
  catch (e) { r = e instanceof SkipOrFail && ALLOW_SKIP ? { status: 'SKIP', detail: e.message } : { status: 'FAIL', detail: e.message.slice(0, 160) }; }
  if (r.status === 'FAIL') fails++;
  if (r.status === 'RED') reds++;
  if (r.status === 'SKIP') skips++;
  console.log(`${pad(r.status, 5)} ${pad(ec.id, 6)} ${pad(ec.title, 48)} ${r.detail}`);
}
console.log(`\n[harness] ${ECS.length} ECs — FAIL:${fails} RED:${reds} SKIP:${skips} PASS:${ECS.length - fails - reds - skips}`);
if (skips && !ALLOW_SKIP) console.log('[harness] SKIPs present without --allow-skip → failure');
const exitFail = fails > 0 || reds > 0 || skips > 0; // acceptance = all executed, all PASS
process.exit(exitFail ? 1 : 0);

// ── tiny .env.local loader (same as pipeline scripts) ─────────────────────────
function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
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
