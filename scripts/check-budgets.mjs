#!/usr/bin/env node
/**
 * Cost guardrail — flags budget breaches across the four v3.1 cost dimensions
 * (NFR-COST-1/2/3, task T-INF-9):
 *
 *   1. DB row count        > 5,000,000 rows/table (provisional default, A-09)  MEASURABLE
 *   2. AWIN feed egress    > 350 MB / run                                     MEASURABLE
 *   3. GH Actions minutes  > 2,000 / mo                                       STUB — unmeasured
 *   4. Vertex/LLM tokens   > 20,000,000 / mo                                  STUB — unmeasured
 *
 * Honesty over false reassurance: a stubbed check is reported as UNMEASURED
 * and never silently counted as a pass. Only a MEASURABLE breach makes this
 * script exit non-zero — an unmeasured check never fails (and never
 * "passes") the run, so this can run unattended without crying wolf or
 * quietly lying about coverage it doesn't have.
 *
 * Measurable checks:
 *   - DB row count reads Postgres directly (same psql-based connection
 *     pattern as scripts/db-verify.mjs / scripts/apply-schema.mjs).
 *   - AWIN egress reads the `awin_feed_bytes` metric that
 *     scripts/ingest-awin.cjs persists to the `ops_metrics` table after every
 *     real (non-dry-run) ingest. If that table/row doesn't exist yet, or the
 *     metric is older than AWIN_METRIC_MAX_AGE_HOURS (no recent ingest ran),
 *     this reports UNMEASURED rather than comparing a stale/missing number.
 *
 * Unmeasurable checks (see the stub functions below for exactly what's
 * missing):
 *   - GitHub Actions minutes needs the GitHub billing API
 *     (GET /repos/{owner}/{repo}/actions/billing or the org-level
 *     equivalent) with a token that has billing:read scope. No such token
 *     exists in this repo's secrets, and no in-repo mechanism tracks minutes
 *     consumed.
 *   - Vertex/LLM token spend needs either a Cloud Billing export/API
 *     integration or an in-app usage-logging ledger. Neither exists in this
 *     repo. Fabricating a number here would be worse than reporting nothing.
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://...:5432/postgres" node scripts/check-budgets.mjs
 *
 * Dependency-free: shells out to psql, like db-verify.mjs / apply-schema.mjs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const PSQL_CANDIDATES = [
  '/usr/bin/psql',
  '/usr/local/bin/psql',
  '/opt/homebrew/bin/psql',
  '/Library/PostgreSQL/16/bin/psql',
  '/Applications/Postgres.app/Contents/Versions/latest/bin/psql',
];

// ── budget thresholds ────────────────────────────────────────────────────────
const DB_ROW_LIMIT = 5_000_000; // A-09 provisional default
const AWIN_EGRESS_LIMIT_BYTES = 350 * 1024 * 1024; // 350 MB/run
const AWIN_METRIC_MAX_AGE_HOURS = 48; // ingest runs daily; beyond this, treat as "no recent data"
const GH_ACTIONS_MINUTES_LIMIT = 2000; // per month
const VERTEX_TOKEN_LIMIT = 20_000_000; // per month

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
const psqlBin = PSQL_CANDIDATES.find((p) => existsSync(p));

let breaches = 0;
let unmeasured = 0;

function pass(name, detail = '') {
  console.log(`[budgets] PASS        ${name}${detail ? ` — ${detail}` : ''}`);
}
function breach(name, detail = '') {
  breaches++;
  console.error(`[budgets] BREACH      ${name}${detail ? ` — ${detail}` : ''}`);
}
function stub(name, reason) {
  unmeasured++;
  console.warn(`[budgets] UNMEASURED  ${name} — ${reason}`);
}

// PostgREST access (preferred): the cost-guardrail runner only needs
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — no psql, no SUPABASE_DB_URL
// [FR-3.4 follow-up: the db-url secret was never configured upstream and the
// psql path silently stubbed for weeks].
const restUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const restKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const restHeaders = { apikey: restKey, Authorization: `Bearer ${restKey}` };

async function restCount(table) {
  const res = await fetch(`${restUrl}/rest/v1/${table}?select=*`, {
    method: 'HEAD',
    headers: { ...restHeaders, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok && res.status !== 206) throw new Error(`HEAD ${table}: HTTP ${res.status}`);
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  if (!Number.isFinite(total)) throw new Error(`no count in content-range for ${table}`);
  return total;
}

/** Run a SQL script via psql; return trimmed stdout. Throws on non-zero exit. */
function sql(script) {
  const res = spawnSync(psqlBin, [dbUrl, '-v', 'ON_ERROR_STOP=1', '-tA', '-c', script], {
    encoding: 'utf8',
    shell: false,
  });
  if (res.status !== 0) throw new Error(res.stderr || `psql exited ${res.status}`);
  return res.stdout.trim();
}

// ── 1. DB row count (MEASURABLE) ────────────────────────────────────────────
async function checkDbRowCount() {
  const NAME = 'DB row count';
  let j;
  if (restUrl && restKey) {
    try {
      j = {
        deals: await restCount('deals'),
        price_history: await restCount('price_history'),
        transactions: await restCount('transactions'),
        price_alerts: await restCount('price_alerts'),
      };
    } catch (e) {
      return stub(NAME, `PostgREST count failed: ${e.message}`);
    }
  } else if (dbUrl && psqlBin) {
    try {
      j = JSON.parse(
        sql(`select json_build_object(
          'deals', (select count(*) from public.deals),
          'price_history', (select count(*) from public.price_history),
          'transactions', (select count(*) from public.transactions),
          'price_alerts', (select count(*) from public.price_alerts)
        )`),
      );
    } catch (e) {
      return stub(NAME, `query failed: ${e.message}`);
    }
  } else {
    return stub(NAME, 'neither SUPABASE_URL+SERVICE_ROLE_KEY nor SUPABASE_DB_URL+psql available');
  }

  for (const [table, countStr] of Object.entries(j)) {
    const n = Number(countStr);
    if (!Number.isFinite(n)) {
      stub(`${NAME}: ${table}`, `non-numeric count returned (${countStr})`);
      continue;
    }
    if (n > DB_ROW_LIMIT) {
      breach(`${NAME}: ${table}`, `${n.toLocaleString()} rows > ${DB_ROW_LIMIT.toLocaleString()} threshold`);
    } else {
      pass(`${NAME}: ${table}`, `${n.toLocaleString()} rows`);
    }
  }
}

// ── 2. AWIN feed egress (MEASURABLE, via ops_metrics) ───────────────────────
async function checkAwinEgress() {
  const NAME = 'AWIN feed egress';
  let j;
  if (restUrl && restKey) {
    try {
      const res = await fetch(`${restUrl}/rest/v1/ops_metrics?key=eq.awin_feed_bytes&select=value,recorded_at`, { headers: restHeaders });
      if (res.status === 404) return stub(NAME, 'ops_metrics table does not exist yet — run `pnpm db:migrate`');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      j = rows.length
        ? { table_exists: true, value: rows[0].value, age_hours: (Date.now() - Date.parse(rows[0].recorded_at)) / 3600e3 }
        : { table_exists: true, value: null, age_hours: null };
    } catch (e) {
      return stub(NAME, `PostgREST read failed: ${e.message}`);
    }
  } else if (dbUrl && psqlBin) {
    try {
      j = JSON.parse(
        sql(`select json_build_object(
          'table_exists', (select to_regclass('public.ops_metrics') is not null),
          'value', (select value from public.ops_metrics where key = 'awin_feed_bytes'),
          'age_hours', (select round(extract(epoch from (now() - recorded_at)) / 3600, 1) from public.ops_metrics where key = 'awin_feed_bytes')
        )`),
      );
    } catch (e) {
      return stub(NAME, `query failed: ${e.message}`);
    }
  } else {
    return stub(NAME, 'neither SUPABASE_URL+SERVICE_ROLE_KEY nor SUPABASE_DB_URL+psql available');
  }

  if (!j.table_exists) {
    return stub(NAME, 'ops_metrics table does not exist yet — run `pnpm db:migrate` (supabase/schema.sql)');
  }
  if (j.value === null || j.value === undefined) {
    return stub(NAME, 'no awin_feed_bytes metric recorded yet — scripts/ingest-awin.cjs has not completed a real (--upsert) run with SUPABASE_URL/KEY set');
  }
  const ageHours = Number(j.age_hours);
  if (Number.isFinite(ageHours) && ageHours > AWIN_METRIC_MAX_AGE_HOURS) {
    return stub(NAME, `latest metric is ${ageHours}h old (> ${AWIN_METRIC_MAX_AGE_HOURS}h) — no recent ingest run to compare against`);
  }

  const bytes = Number(j.value);
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  const limitMb = (AWIN_EGRESS_LIMIT_BYTES / (1024 * 1024)).toFixed(0);
  if (bytes > AWIN_EGRESS_LIMIT_BYTES) {
    breach(NAME, `${mb} MB > ${limitMb} MB threshold (last run, ${ageHours}h ago)`);
  } else {
    pass(NAME, `${mb} MB (last run, ${ageHours}h ago)`);
  }
}

// ── 3. GH Actions minutes/mo (STUB — not measurable from this repo) ────────
function checkGhActionsMinutes() {
  stub(
    `GitHub Actions minutes/mo (> ${GH_ACTIONS_MINUTES_LIMIT.toLocaleString()} threshold)`,
    'requires the GitHub billing API (GET /repos/{owner}/{repo}/actions/billing or the org-level equivalent) ' +
      'with a token scoped for billing reads — no such token exists in this repo\'s secrets, and no workflow ' +
      'tracks cumulative minutes anywhere in-repo. Not implemented rather than fabricated.',
  );
}

// ── 4. Vertex/LLM token spend/mo (STUB — not measurable from this repo) ────
function checkVertexTokenSpend() {
  stub(
    `Vertex/LLM token spend/mo (> ${VERTEX_TOKEN_LIMIT.toLocaleString()} tokens threshold)`,
    'no token-spend ledger exists anywhere in this repo — would require either a Cloud Billing export/API ' +
      'integration or an in-app usage-logging table, neither of which is built. Not implemented rather than fabricated.',
  );
}

// ── 5. PDP richness invariants [FR-5.3/EC-19, docs/specs/pdp-full-content] ──
// TH-1..TH-3 via the SAME shared module the acceptance harness uses
// (scripts/lib/richness.cjs) — PostgREST, no psql needed.
async function checkRichness() {
  const NAME = 'PDP richness invariants (TH-1 image / TH-2 title / TH-3 description)';
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !srk) return stub(NAME, 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set');
  const { createRequire } = await import('node:module');
  const { computeRichness, gateRichness } = createRequire(import.meta.url)('./lib/richness.cjs');
  const rows = [];
  try {
    for (let from = 0; ; from += 1000) {
      const res = await fetch(`${url}/rest/v1/deals?hidden=eq.false&select=product_name,description,description_html,gallery,image_url`,
        { headers: { apikey: srk, Authorization: `Bearer ${srk}`, Range: `${from}-${from + 999}` } });
      if (!res.ok) return stub(NAME, `PostgREST ${res.status}`);
      const page = await res.json();
      rows.push(...page);
      if (page.length < 1000) break;
    }
  } catch (e) { return stub(NAME, `fetch failed: ${e.message}`); }
  const r = computeRichness(rows);
  const gate = gateRichness(r);
  if (!gate.pass) return breach(NAME, gate.failures.join('; '));
  pass(NAME, `${r.visible} visible; multi-image ${r.multiImagePct}% (reported)`);
}

console.log('[budgets] cost guardrail — v3.1 NFR-COST-1/2/3 + PDP richness');
await checkDbRowCount();
await checkAwinEgress();
checkGhActionsMinutes();
checkVertexTokenSpend();
await checkRichness();

console.log(`[budgets] ${breaches} breach(es), ${unmeasured} unmeasured check(s).`);
// Strict mode [FR-5.3/FR-3.4, docs/specs/pdp-full-content]: in acceptance/CI
// on the secrets-bearing repo, an UNMEASURED check is a failure — a stubbed
// guardrail must never read as green. (The Vertex stub is exempt: it is
// documented as not-measurable-from-this-repo, not mis-configured.)
const STRICT = process.argv.includes('--strict');
// Two PERMANENT documented stubs are exempt (GitHub-minutes billing API and
// Vertex token ledger — both 'not implemented rather than fabricated', not
// mis-configuration). Everything else unmeasured is a real strict failure.
const strictFailures = unmeasured - 2;
if (STRICT && strictFailures > 0) {
  console.error(`[budgets] STRICT: ${strictFailures} configurable check(s) unmeasured — failing.`);
  process.exit(1);
}
process.exit(breaches > 0 ? 1 : 0);
