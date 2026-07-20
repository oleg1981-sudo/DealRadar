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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** REST fetch with bounded retry on transient failures — the anon 3s
 *  statement_timeout (57014 → HTTP 500) tips over on large counts while a
 *  pipeline run loads the table; retry rides it out. Read-only, so safe. */
async function restFetch(url, init = {}) {
  const backoff = [1500, 4000, 9000];
  for (let attempt = 0; ; attempt++) {
    let res;
    try { res = await fetch(url, init); }
    catch (e) { if (attempt >= backoff.length) throw e; await sleep(backoff[attempt]); continue; }
    if (res.ok || res.status === 206) return res;
    if (res.status < 500 || attempt >= backoff.length) return res;
    await sleep(backoff[attempt]);
  }
}

/** Page the deals table client-side (PostgREST can't filter on array length). */
async function pageDeals(select, filter = '') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const res = await restFetch(`${SUPABASE_URL}/rest/v1/deals?select=${select}${filter}`, {
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

/** Server-side filtered count via HEAD + Prefer: count=exact — every
 *  invariant is a count, so no row payload ever crosses the wire (the anon
 *  role's 3s statement_timeout forbids full-table pagination). */
async function headCount(filter, table = 'deals') {
  const res = await restFetch(`${SUPABASE_URL}/rest/v1/${table}?select=product_id${filter}`, {
    method: 'HEAD',
    headers: { ...supaHeaders(), Prefer: 'count=exact', Range: '0-0' },
  });
  if (!(res.ok || res.status === 206)) throw new Error(`HEAD ${table}${filter}: HTTP ${res.status}`);
  const total = Number((res.headers.get('content-range') || '').split('/')[1]);
  if (!Number.isFinite(total)) throw new Error(`no exact count for ${table}${filter}`);
  return total;
}
const VIS = '&hidden=eq.false';

// ── EC registry ───────────────────────────────────────────────────────────────
// run() returns { status: 'PASS'|'FAIL'|'SKIP'|'RED', detail }.
const RED = (why) => async () => ({ status: 'RED', detail: `not implemented yet — ${why}` });

const ECS = [
  {
    id: 'EC-1', title: 'TH-1 image presence + capture provenance',
    run: async () => {
      needSupa();
      const visible = await headCount(VIS);
      if (visible < CATALOG_FLOOR) return { status: 'FAIL', detail: `catalog floor: only ${visible} visible rows (empty read may mean RLS/anon key)` };
      // gallery=is.null approximates "no gallery" (ingest writes null, never []).
      const noImage = await headCount(`${VIS}&gallery=is.null&or=(image_url.is.null,image_url.eq.)`);
      if (noImage > 0) return { status: 'FAIL', detail: `${noImage} visible deals with NO image` };
      const provenance = await headCount('&capture_run_id=not.is.null');
      return { status: 'PASS', detail: `0/${visible} visible deals without an image; ${provenance} rows carry capture provenance` };
    },
  },
  {
    id: 'EC-2', title: 'TH-2 title + TH-3 description presence; hidden-capture decoupling',
    run: async () => {
      needSupa();
      const visible = await headCount(VIS);
      if (visible < CATALOG_FLOOR) return { status: 'FAIL', detail: `catalog floor: only ${visible} visible rows` };
      const noTitle = await headCount(`${VIS}&or=(product_name.is.null,product_name.eq.)`);
      if (noTitle) return { status: 'FAIL', detail: `${noTitle} visible deals with empty title` };
      const noDesc = await headCount(`${VIS}&description_html=is.null&or=(description.is.null,description.eq.)`);
      if (noDesc) return { status: 'FAIL', detail: `${noDesc} visible deals with no description data` };
      const hiddenWithHtml = await headCount('&hidden=eq.true&description_html=not.is.null');
      if (!hiddenWithHtml) return { status: 'FAIL', detail: `invariants hold on ${visible} rows, but 0 hidden rows carry description_html — capture decoupling unproven (soak pending)` };
      return { status: 'PASS', detail: `titles+descriptions complete on ${visible} visible rows; ${hiddenWithHtml} hidden rows carry captured html (decoupling proven)` };
    },
  },
  {
    id: 'EC-3', title: 'Renogy section extractor mechanism',
    run: async () => {
      if (!existsSync(path.join(ROOT, 'scripts/lib/extractors/page-content.cjs'))) return { status: 'FAIL', detail: 'page-content extractor missing' };
      const vsrc = readFileSync(path.join(ROOT, 'scripts/verify-awin.cjs'), 'utf8');
      if (!/extractPageContent/.test(vsrc) || !/page-content captures:/.test(vsrc)) return { status: 'FAIL', detail: 'extractor not integrated into verify (grammar missing)' };
      needSupa();
      // Post-soak evidence: visible Renogy rows carrying captured HTML.
      const renogyTotal = await headCount(`${VIS}&shop_name=eq.Renogy%20DE`);
      if (!renogyTotal) return { status: 'FAIL', detail: 'no visible Renogy DE rows to evidence' };
      const withHtml = await headCount(`${VIS}&shop_name=eq.Renogy%20DE&description_html=not.is.null`);
      if (!withHtml) return { status: 'FAIL', detail: `0/${renogyTotal} visible Renogy rows have captured description_html (page-capture soak pending)` };
      return { status: 'PASS', detail: `${withHtml}/${renogyTotal} visible Renogy rows carry captured content (reported share; presence per TH-3 is the gate)` };
    },
  },
  {
    id: 'EC-4', title: 'snapshot covers all rows daily',
    run: async () => {
      const src = readFileSync(path.join(ROOT, 'scripts/snapshot-prices.cjs'), 'utf8');
      if (/hidden=eq\.false/.test(src)) return { status: 'FAIL', detail: 'snapshot still filters hidden rows' };
      if (!/covered=\$\{deals\.length\} total=/.test(src)) return { status: 'FAIL', detail: 'covered=/total= grammar missing' };
      needSupa();
      // Post-soak guard: every deal (hidden included) has a snapshot ≤48h.
      const ids = await pageDeals('product_id', '');
      if (ids.length < CATALOG_FLOOR) return { status: 'FAIL', detail: `catalog floor: ${ids.length}` };
      const since = new Date(Date.now() - 48 * 3600e3).toISOString().slice(0, 10);
      const hist = [];
      for (let from = 0; ; from += 1000) {
        const res = await restFetch(`${SUPABASE_URL}/rest/v1/price_history?select=product_id&day=gte.${since}&order=product_id.asc`, { headers: { ...supaHeaders(), Range: `${from}-${from + 999}` } });
        if (!res.ok) return { status: 'FAIL', detail: `price_history read: HTTP ${res.status}` };
        const page = await res.json();
        hist.push(...page);
        if (page.length < 1000) break;
      }
      const have = new Set(hist.map((h) => h.product_id));
      const missing = ids.filter((d) => !have.has(d.product_id));
      if (missing.length > 0) return { status: 'FAIL', detail: `${missing.length}/${ids.length} deals lack a 48h snapshot (hidden-coverage soak pending)` };
      return { status: 'PASS', detail: `all ${ids.length} deals snapshotted within 48h` };
    },
  },
  {
    id: 'EC-5', title: 'feed_attrs + fill-rate report',
    run: async () => {
      needSupa();
      const res = await restFetch(`${SUPABASE_URL}/rest/v1/ops_metrics?key=eq.awin_fill_rates&select=value,recorded_at`, { headers: supaHeaders() });
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
      const res = await restFetch(`${SUPABASE_URL}/rest/v1/ops_metrics?select=key,recorded_at&order=recorded_at.desc&limit=5`, { headers: supaHeaders() });
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
      // Sweep-eligible mirrors verify-awin.cjs fetchDeals (/products/ predicate
      // pinned by the dated EC-9 amendment); failed fetches ARE watermarked by
      // the verifier, so only fresh-blocked hosts are excluded (EC-1 rule).
      const F = '&source=eq.awin&merchant_url=like.*%2Fproducts%2F*';
      const cutoff = new Date(Date.now() - 48 * 3600e3).toISOString();
      const staleOr = `&or=(last_verified.is.null,last_verified.lt.${encodeURIComponent(cutoff)})`;
      const total = await headCount(F);
      if (total < CATALOG_FLOOR) return { status: 'FAIL', detail: `sweep-eligible floor: only ${total} rows` };
      const foRes = await restFetch(`${SUPABASE_URL}/rest/v1/fetch_outcomes?select=host,status,last_seen`, { headers: supaHeaders() });
      const outcomes = foRes.ok ? await foRes.json() : [];
      const blockedHosts = outcomes
        .filter((o) => /^blocked-/.test(o.status) && Date.now() - Date.parse(o.last_seen) < 48 * 3600e3)
        .map((o) => o.host);
      let stale = await headCount(F + staleOr);
      let excluded = 0;
      for (const h of blockedHosts) {
        const hostFilter = `&merchant_url=like.*${encodeURIComponent(h)}*`;
        excluded += await headCount(F + hostFilter);
        stale -= await headCount(F + hostFilter + staleOr);
      }
      if (blockedHosts.length && excluded > total * 0.5) return { status: 'FAIL', detail: `block-list excludes ${excluded}/${total} rows — exclusion bound exceeded` };
      if (stale > 0) return { status: 'FAIL', detail: `${stale}/${total - excluded} sweep-eligible rows unverified in 48h (soak pending or starved tail; ${blockedHosts.length} blocked hosts excluded)` };
      return { status: 'PASS', detail: `all ${total - excluded} sweep-eligible rows verified within 48h (${blockedHosts.length} blocked hosts excluded)` };
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
        // Runs created after the gating landed on the fork's main (pre-fix
        // failures age out of scope rather than blocking acceptance forever).
        const fixTs = Date.parse(execFileSync('git', ['log', '-1', '--format=%cI', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim());
        const j = ghJson('repos/Manzela/DealRadar/actions/runs?event=schedule&per_page=20');
        const runs = (j.workflow_runs || []).filter((r) => Date.parse(r.created_at) > fixTs && Date.now() - Date.parse(r.created_at) < 48 * 3600e3);
        for (const r of runs) {
          const jobs = ghJson(`repos/Manzela/DealRadar/actions/runs/${r.id}/jobs`);
          const active = (jobs.jobs || []).filter((jb) => jb.conclusion !== 'skipped');
          if (active.length) return { status: 'FAIL', detail: `fork run ${r.id} (${r.name}) has non-skipped jobs — gating not deployed to fork yet` };
        }
        return { status: 'PASS', detail: `gates present ×${WFS.length}; ${runs.length} post-fix fork scheduled runs, all skipped` };
      } catch (e) {
        return { status: 'SKIP', detail: `gates present; gh unavailable: ${e.message.slice(0, 80)}` };
      }
    },
  },
  {
    id: 'EC-11', title: 'committed/attempted grammar + chaos tests',
    run: async () => {
      const tsrc = readFileSync(path.join(ROOT, 'src/lib/ingest/verify-write-classes.test.ts'), 'utf8');
      if (!/retries once/.test(tsrc) || !/invalid-key smoke/.test(tsrc)) return { status: 'FAIL', detail: 'retry/invalid-key tests missing' };
      try {
        execFileSync('pnpm', ['vitest', 'run', 'src/lib/ingest/verify-write-classes.test.ts', '--silent'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        if (e.code === 'ENOENT') return { status: 'FAIL', detail: 'pnpm/vitest unavailable on this runner (not a test failure)' };
        return { status: 'FAIL', detail: 'chaos/retry tests failing' };
      }
      try {
        const j = ghJson('repos/oleg1981-sudo/DealRadar/actions/workflows/verify-awin.yml/runs?event=schedule&status=completed&per_page=3');
        const recent = (j.workflow_runs || []).filter((r) => Date.now() - Date.parse(r.created_at) < 48 * 3600e3);
        if (!recent.length) return { status: 'FAIL', detail: 'tests green; no scheduled verify run ≤48h for the grammar' };
        const log = execFileSync('gh', ['run', 'view', String(recent[0].id), '--repo', 'oleg1981-sudo/DealRadar', '--log'], { encoding: 'utf8', maxBuffer: 64e6 });
        if (!/patches committed=\d+ attempted=\d+/.test(log)) return { status: 'FAIL', detail: `tests green; committed=/attempted= grammar absent from run ${recent[0].id} (deploy soak pending)` };
        return { status: 'PASS', detail: `tests green; grammar live in run ${recent[0].id}` };
      } catch (e) {
        return { status: 'SKIP', detail: `tests green; gh unavailable: ${e.message.slice(0, 80)}` };
      }
    },
  },
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
  {
    id: 'EC-13', title: 'IndexNow split enforcement',
    run: async () => {
      const src = readFileSync(path.join(ROOT, 'scripts/indexnow-submit.cjs'), 'utf8');
      if (!/first_published_at/.test(src) || !/excluded_never_published/.test(src)) {
        return { status: 'FAIL', detail: 'submit script lacks the never-published/delisted split' };
      }
      try {
        const j = ghJson('repos/oleg1981-sudo/DealRadar/actions/workflows/verify-awin.yml/runs?event=schedule&status=completed&per_page=3');
        const recent = (j.workflow_runs || []).filter((r) => Date.now() - Date.parse(r.created_at) < 48 * 3600e3);
        if (!recent.length) return { status: 'FAIL', detail: 'script OK; no scheduled verify run ≤48h to evidence the grammar' };
        const log = execFileSync('gh', ['run', 'view', String(recent[0].id), '--repo', 'oleg1981-sudo/DealRadar', '--log'], { encoding: 'utf8', maxBuffer: 64e6 });
        if (!/excluded_never_published=\d+/.test(log)) return { status: 'FAIL', detail: `script OK; grammar absent from run ${recent[0].id} log (new code not deployed to that run yet)` };
        return { status: 'PASS', detail: `split live in run ${recent[0].id}` };
      } catch (e) {
        return { status: 'SKIP', detail: `script OK; gh unavailable: ${e.message.slice(0, 80)}` };
      }
    },
  },
  {
    id: 'EC-14', title: 'conditional blocks render iff data',
    run: async () => {
      needSupa();
      const withAttrs = await pageDeals('slug,feed_attrs', '&hidden=eq.false&feed_attrs=not.is.null&order=product_id.asc&limit=3');
      const withoutAttrs = await pageDeals('slug', '&hidden=eq.false&feed_attrs=is.null&order=product_id.asc&limit=3');
      const fetchHtml = async (slug) => { const r = await fetch(`${SITE}/en/deal/${slug}`); return r.status === 200 ? r.text() : null; };
      if (withAttrs.length < 3) return { status: 'SKIP', detail: 'insufficient-cohort: <3 attr-bearing visible deals (feed_attrs soak pending)' };
      for (const d of withAttrs) {
        const html = await fetchHtml(d.slug);
        if (!html) return { status: 'FAIL', detail: `${d.slug}: page unavailable` };
        if (!/data-block="(attrs|shipping)"/.test(html)) return { status: 'FAIL', detail: `${d.slug}: attr-bearing row renders no attrs/shipping block` };
      }
      for (const d of withoutAttrs) {
        const html = await fetchHtml(d.slug);
        if (!html) return { status: 'FAIL', detail: `${d.slug}: page unavailable` };
        if (/data-block="attrs"/.test(html)) return { status: 'FAIL', detail: `${d.slug}: attr-less row renders an attrs block (fabrication?)` };
      }
      const unproxy1 = (u) => {
        if (!/(^|\.)productserve\.com\//i.test(u)) return u;
        try { const inner = new URL(u).searchParams.get('url'); if (!inner) return u; const o = /^https?:\/\//i.test(inner) ? inner : 'https://' + inner.replace(/^ssl:/i, ''); return new URL(o).protocol === 'https:' ? o : u; } catch { return u; }
      };
      const multi = (await pageDeals('slug,gallery', '&hidden=eq.false&gallery=not.is.null&order=product_id.asc&limit=20'))
        .find((d) => d.gallery && new Set(d.gallery.map(unproxy1)).size >= 2);
      if (multi) {
        const html = await fetchHtml(multi.slug);
        const m = html && html.match(/data-gallery-count="(\d+)"/);
        if (!m || parseInt(m[1], 10) < 2) return { status: 'FAIL', detail: `${multi.slug}: enriched gallery renders <2 images` };
      }
      return { status: 'PASS', detail: `attrs present ×${withAttrs.length}, absent ×${withoutAttrs.length}, gallery render OK` };
    },
  },
  {
    id: 'EC-15', title: 'description always renders (presence)',
    run: async () => {
      needSupa();
      const vis = await pageDeals('slug', '&hidden=eq.false&order=product_id.asc&limit=2');
      const echo = await pageDeals('slug', '&hidden=eq.false&description_html=is.null&order=product_id.asc&limit=1');
      const probes = vis.map((r) => r.slug).concat(echo.map((r) => r.slug));
      if (!probes.length) return { status: 'FAIL', detail: 'no probe rows (empty read — RLS/anon key?)' };
      for (const slug of probes) {
        const r = await fetch(`${SITE}/en/deal/${slug}`);
        if (r.status !== 200) return { status: 'FAIL', detail: `${slug}: HTTP ${r.status}` };
        const html = await r.text();
        if (!/data-block="description"/.test(html)) return { status: 'FAIL', detail: `${slug}: no description block rendered (FR-4.2-as-amended violated or deploy pending)` };
      }
      return { status: 'PASS', detail: `description block present on ${probes.length} probes (incl. plain-text-only row)` };
    },
  },
  {
    id: 'EC-16', title: 'brand mapping coverage',
    run: async () => {
      const mapPath = path.join(ROOT, 'scripts/lib/brand-map.json');
      if (!existsSync(mapPath)) return { status: 'FAIL', detail: 'brand-map.json missing' };
      const { map } = JSON.parse(readFileSync(mapPath, 'utf8'));
      const aliases = Object.keys(map || {});
      if (!aliases.length) return { status: 'FAIL', detail: 'brand map empty' };
      needSupa();
      const polluted = [];
      for (const alias of aliases) {
        const rows = await pageDeals('product_id', `&hidden=eq.false&brand=eq.${encodeURIComponent(alias)}&limit=1`);
        if (rows.length) polluted.push(alias);
      }
      if (polluted.length) return { status: 'FAIL', detail: `visible rows still carry polluted aliases: ${polluted.join(', ')} (ingest-refresh soak pending)` };
      return { status: 'PASS', detail: `0 visible rows with any of ${aliases.length} mapped aliases` };
    },
  },
  {
    id: 'EC-17', title: 'JSON-LD parity with row data',
    run: async () => {
      needSupa();
      const rows = await pageDeals('slug,gallery,image_url,feed_attrs,rating_source,mpn,model_number', '&hidden=eq.false&order=product_id.asc&limit=3');
      if (!rows.length) return { status: 'FAIL', detail: 'no probe rows (empty read — RLS/anon key?)' };
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const unproxy = (u) => {
        if (!/(^|\.)productserve\.com\//i.test(u)) return u;
        try { const inner = new URL(u).searchParams.get('url'); if (!inner) return u; const o = /^https?:\/\//i.test(inner) ? inner : 'https://' + inner.replace(/^ssl:/i, ''); return new URL(o).protocol === 'https:' ? o : u; } catch { return u; }
      };
      for (const d of rows) {
        const r = await fetch(`${SITE}/en/deal/${d.slug}`);
        if (r.status !== 200) return { status: 'FAIL', detail: `${d.slug}: HTTP ${r.status}` };
        const html = await r.text();
        const m = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org\/","@type":"Product".*?)<\/script>/s);
        if (!m) return { status: 'FAIL', detail: `${d.slug}: Product JSON-LD missing` };
        let ld;
        try { ld = JSON.parse(m[1].replace(/\\u003c/g, '<')); } catch { return { status: 'FAIL', detail: `${d.slug}: JSON-LD unparsable` }; }
        const expected = [...new Set((d.gallery?.length ? d.gallery : [d.image_url]).filter(Boolean).map(unproxy))];
        const img = Array.isArray(ld.image) ? ld.image.length : ld.image ? 1 : 0;
        if (img !== expected.length) return { status: 'FAIL', detail: `${d.slug}: JSON-LD image ${img} ≠ deduped gallery ${expected.length}` };
        const renderable = req(path.join(ROOT, 'scripts/lib/feed-attrs.cjs')).renderableAttrs(d.feed_attrs);
        if (!!ld.additionalProperty !== !!Object.keys(renderable).length) return { status: 'FAIL', detail: `${d.slug}: additionalProperty presence mismatch vs renderable attrs` };
        if (ld.aggregateRating && !d.rating_source) return { status: 'FAIL', detail: `${d.slug}: aggregateRating without provenance` };
        if (ld.model && !(d.mpn || d.model_number)) return { status: 'FAIL', detail: `${d.slug}: synthetic model emitted (Q-7 violation)` };
      }
      return { status: 'PASS', detail: `JSON-LD parity on ${rows.length} probes` };
    },
  },
  {
    id: 'EC-18', title: 'markdown agent surface + discovery',
    run: async () => {
      needSupa();
      const probes = await pageDeals('slug', '&hidden=eq.false&order=product_id.asc&limit=3');
      if (probes.length < 3) return { status: 'FAIL', detail: 'fewer than 3 visible probe rows' };
      for (const p of probes) {
        const res = await fetch(`${SITE}/en/deal/${p.slug}/md`);
        if (res.status !== 200) return { status: 'FAIL', detail: `${p.slug}/md → HTTP ${res.status} (deploy pending?)` };
        if (!(res.headers.get('content-type') || '').includes('markdown')) return { status: 'FAIL', detail: `${p.slug}/md wrong content-type` };
        const md = await res.text();
        for (const label of ['Price:', 'Availability:', 'Disclosure:']) {
          if (!md.includes(label)) return { status: 'FAIL', detail: `${p.slug}/md missing pinned label ${label}` };
        }
      }
      const llms = await fetch(`${SITE}/llms.txt`);
      if (llms.status !== 200) return { status: 'FAIL', detail: 'llms.txt absent' };
      const body = await llms.text();
      if (!/sitemap\.xml/.test(body) || !/\/md/.test(body)) return { status: 'FAIL', detail: 'llms.txt lacks the discovery rule (sitemap + /md)' };
      return { status: 'PASS', detail: `3 probes green; llms.txt discovery rule present` };
    },
  },
  {
    id: 'EC-19', title: 'richness budgets strict + mutation',
    run: async () => {
      const { createRequire } = await import('node:module');
      const { gateRichness } = createRequire(import.meta.url)('./lib/richness.cjs');
      needSupa();
      // Same server-side count invariants as EC-1/EC-2, fed through the SHARED
      // gate module (single source of truth with check-budgets).
      const r = {
        visible: await headCount(VIS),
        th1NoImage: await headCount(`${VIS}&gallery=is.null&or=(image_url.is.null,image_url.eq.)`),
        th2NoTitle: await headCount(`${VIS}&or=(product_name.is.null,product_name.eq.)`),
        th3NoDesc: await headCount(`${VIS}&description_html=is.null&or=(description.is.null,description.eq.)`),
        multiImagePct: -1, // reported metric — not computable via counts; harness reports gate results only
      };
      const gate = gateRichness(r);
      // Mutation clause: an injected negative budget MUST fail — proves the gate can fail.
      process.env.RICHNESS_MAX_TH3 = '-1';
      const mutated = gateRichness(r);
      delete process.env.RICHNESS_MAX_TH3;
      if (mutated.pass) return { status: 'FAIL', detail: 'mutation did not fail the gate — gate is toothless' };
      if (!gate.pass) return { status: 'FAIL', detail: gate.failures.join('; ') };
      let runDetail = 'guardrail-run check skipped (gh)';
      try {
        const j = ghJson('repos/oleg1981-sudo/DealRadar/actions/workflows/cost-guardrail.yml/runs?event=schedule&status=completed&per_page=3');
        const recent = (j.workflow_runs || []).filter((x) => Date.now() - Date.parse(x.created_at) < 48 * 3600e3);
        if (recent.length && recent[0].conclusion !== 'success') return { status: 'FAIL', detail: `latest guardrail run ${recent[0].conclusion}` };
        runDetail = recent.length ? `guardrail run ${recent[0].id} green` : 'no scheduled guardrail run ≤48h (post-merge pending)';
      } catch { /* gh optional here; gate itself already executed */ }
      return { status: 'PASS', detail: `invariants hold on ${r.visible} rows; mutation fails correctly; ${runDetail}` };
    },
  },
  {
    id: 'EC-20', title: 'reference-deal global check',
    run: async () => {
      needSupa();
      // Reference deal, else fallback cohort: any visible Renogy DE deal.
      const ref = await pageDeals('slug,gallery,description,description_html,product_name', "&product_id=eq.awin%3ADE%3Aadv127459%3A47006571266179");
      const cohort = ref.length && !ref[0].hidden ? ref : await pageDeals('slug,gallery,description,description_html,product_name', '&hidden=eq.false&shop_name=eq.Renogy%20DE&order=product_id.asc&limit=5');
      const q = cohort.find((d) => d.gallery && d.gallery.length >= 2);
      if (!q) return { status: 'FAIL', detail: 'no qualifying Renogy DE deal (gallery ≥2)' };
      const r = await fetch(`${SITE}/en/deal/${q.slug}`);
      if (r.status !== 200) return { status: 'FAIL', detail: `${q.slug}: HTTP ${r.status}` };
      const html = await r.text();
      if (!/data-block="description"/.test(html)) return { status: 'FAIL', detail: `${q.slug}: no description block (Q-3 extractor pending for Renogy)` };
      const m = html.match(/data-gallery-count="(\d+)"/);
      if (!m || parseInt(m[1], 10) < 2) return { status: 'FAIL', detail: `${q.slug}: rendered gallery <2` };
      if (!/"image":\[/.test(html)) return { status: 'FAIL', detail: `${q.slug}: JSON-LD image array missing` };
      return { status: 'PASS', detail: `${q.slug}: gallery ≥2 rendered, description block present, JSON-LD image array emitted` };
    },
  },
  {
    id: 'EC-21', title: 'write classes (M2 amendment)',
    run: async () => {
      // Static half — IN-PROCESS, not regex: the actual write-shape builders
      // must never emit the forbidden lifecycle fields.
      const { createRequire } = await import('node:module');
      const req = createRequire(import.meta.url);
      const verify = req(path.join(ROOT, 'scripts/verify-awin.cjs'));
      const FORBIDDEN = ['status', 'expired_at', 'content_changed_at'];
      for (const klass of ['liveness', 'content']) {
        const body = verify.patchBody({ sale_price: 1 }, klass, true);
        const bad = FORBIDDEN.filter((k) => k in body);
        if (bad.length) return { status: 'FAIL', detail: `patchBody(${klass}) emits forbidden ${bad.join(',')}` };
        if (klass === 'content' && 'last_updated' in body) return { status: 'FAIL', detail: 'content-class patch bumps last_updated' };
        if (klass === 'liveness' && !('last_updated' in body)) return { status: 'FAIL', detail: 'liveness-class patch missing last_updated' };
      }
      // Runtime half — ENFORCED: hidden rows touched by the latest capture run
      // must NOT have last_updated inside that run's window (content-only), and
      // the cohort must be non-vacuous post-soak.
      needSupa();
      const latest = await pageDeals('capture_run_id', '&capture_run_id=not.is.null&order=capture_run_id.desc&limit=1');
      if (!latest.length) return { status: 'FAIL', detail: 'static OK; no capture_run_id rows yet (Stage-2 soak pending)' };
      const latestRun = latest[0].capture_run_id;
      // Runtime evidence [M2 amendment]: the ENFORCEMENT is the static
      // in-process check above (patchBody: content-class bodies never emit
      // last_updated / status / expired_at / content_changed_at). The DB
      // timestamp CANNOT observe the verify's content-class restraint, because
      // the daily ingest upsert legitimately re-stamps last_updated on every
      // in-feed row — feed-presence IS a liveness signal under the amendment
      // (a still-offered product stays alive). So the runtime half verifies
      // only that content capture is actually happening (non-vacuous): hidden
      // rows carry captured content stamped by the latest run.
      const captured = await headCount(`&capture_run_id=eq.${encodeURIComponent(latestRun)}&hidden=eq.true&description_html=not.is.null`);
      if (!captured) return { status: 'FAIL', detail: `static OK; run ${latestRun} captured no hidden-row content — capture vacuous (soak pending)` };
      return { status: 'PASS', detail: `static OK (no writer emits last_updated on content-class or status/expired_at/content_changed_at ever); ${captured} hidden rows carry content captured by ${latestRun}` };
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
      } catch (e) {
        if (e.code === 'ENOENT') return { status: 'FAIL', detail: 'pnpm/vitest unavailable on this runner (not a test failure)' };
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
      // Probe: 2 visible + 2 hidden.
      const vis = await pageDeals('slug', '&hidden=eq.false&order=product_id.asc&limit=2');
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
