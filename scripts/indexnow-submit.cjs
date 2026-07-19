// IndexNow submitter — pings api.indexnow.org with deal URLs that changed
// since a cutoff, so Bing/Yandex/Seznam/Naver (and Copilot surfaces) re-crawl
// new deals and price updates within minutes instead of on sitemap cadence.
// One submission propagates to all IndexNow-participating engines. Google does
// NOT support IndexNow (2026) — its channel is the lastmod-accurate sitemap.
//
// Usage:
//   node scripts/indexnow-submit.cjs                 # deals changed in the last 3h (default)
//   node scripts/indexnow-submit.cjs --since 26      # last 26 hours
//   node scripts/indexnow-submit.cjs --all           # every VISIBLE deal (bootstrap / re-seed;
//                                                    # delisted-URL re-seed returns with Stage 5.3)
//   node scripts/indexnow-submit.cjs --dry-run       # build the batch, submit nothing
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   read deals via PostgREST
//   SITE_URL      default https://dealradar.me
//   INDEXNOW_KEY  default = the committed public key file (IndexNow keys are
//                 public by design — the served key file IS the ownership proof)
//
// Practices encoded (indexnow.org protocol + 2026 guides):
//   - submit ONLY changed URLs (never blanket-resubmit unchanged content)
//   - batch POST (protocol cap 10,000/request) instead of per-URL GETs
//   - EXCLUDE hidden deals (interim FR-3.6, docs/specs/pdp-full-content):
//     hidden PDPs serve 200+noindex (Q-1), and hidden-since-insert rows were
//     never published — submitting them wastes quota and surfaces thin pages.
//     The never-published vs delisted split (first_published_at) restores
//     delisted-once submission in Stage 5.3.
//   - bounded retry on transient 429/5xx: the workflow step no longer has
//     continue-on-error, so the script absorbs blips and fails loudly only
//     when the endpoint persistently rejects
//   - canonical (default-locale) URL only; hreflang alternates are discovered
//     from the page/sitemap, not pinged individually

// Same .env.local loader as the other pipeline scripts (local dry-runs; CI
// injects real secrets and the loader is a no-op there).
loadEnvLocal();
function loadEnvLocal() {
  const fs = require('fs');
  const path = require('path');
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

const SITE = (process.env.SITE_URL || 'https://dealradar.me').replace(/\/+$/, '');
const KEY = process.env.INDEXNOW_KEY || '36c4f6d24ff2c383742acbda6243bb20';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const BATCH_MAX = 10000;

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const BACKOFF_MS = [2000, 8000, 30000, 60000]; // bounded retries for transient failures
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch with bounded retry on transient failures (network, 429, 5xx). Used by
 *  both the PostgREST paging reads and the IndexNow POST — the workflow steps
 *  no longer carry continue-on-error, so the script absorbs blips itself. */
async function fetchWithRetry(url, init) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      if (attempt >= BACKOFF_MS.length) throw e;
      await sleep(BACKOFF_MS[attempt]);
      continue;
    }
    const transient = res.status === 429 || res.status >= 500;
    if (!transient || attempt >= BACKOFF_MS.length) return res;
    await sleep(BACKOFF_MS[attempt]);
  }
}

async function changedDeals(sinceIso) {
  if (!SUPABASE_URL || !SRK) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const rows = [];
  const PAGE = 1000; // PostgREST max-rows cap — page explicitly
  for (let from = 0; ; from += PAGE) {
    const filter = sinceIso ? `&last_updated=gte.${encodeURIComponent(sinceIso)}` : '';
    const res = await fetchWithRetry(
      `${SUPABASE_URL}/rest/v1/deals?select=slug,hidden,last_updated${filter}&order=slug.asc`,
      {
        headers: {
          apikey: SRK,
          Authorization: `Bearer ${SRK}`,
          Range: `${from}-${from + PAGE - 1}`,
        },
      },
    );
    if (!res.ok) throw new Error(`PostgREST ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function postBatch(batch) {
  const res = await fetchWithRetry(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: KEY,
      keyLocation: `${SITE}/${KEY}.txt`,
      urlList: batch,
    }),
  });
  // 200 = OK, 202 = accepted (key validation pending) — both are success.
  if (res.status === 200 || res.status === 202) return res.status;
  throw new Error(`IndexNow rejected batch: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function submit(urls) {
  let accepted = 0;
  for (let i = 0; i < urls.length; i += BATCH_MAX) {
    const batch = urls.slice(i, i + BATCH_MAX);
    const status = await postBatch(batch);
    accepted += batch.length;
    console.log(`[indexnow] batch of ${batch.length} accepted (HTTP ${status})`);
  }
  return accepted;
}

(async () => {
  const all = flag('--all');
  const hours = Number(opt('--since', '3'));
  const sinceIso = all ? null : new Date(Date.now() - hours * 3600e3).toISOString();

  const rows = await changedDeals(sinceIso);
  // Interim FR-3.6: hidden rows (never-published + delisted alike) are not
  // submitted — their PDPs serve 200+noindex, so a ping either wastes quota
  // (never-published) or is premature (delisted split lands in Stage 5.3).
  const visibleRows = rows.filter((r) => !r.hidden);
  const excludedHidden = rows.length - visibleRows.length;
  const urls = visibleRows.map((r) => `${SITE}/en/deal/${r.slug}`);
  // Homepage content shifts with ANY deal change — including hide-only runs
  // (delistings change the homepage/listings even though the hidden PDPs
  // themselves are excluded by policy). Gate on rows, not on the filtered set.
  if (rows.length > 0) urls.push(`${SITE}/en`);

  console.log(
    `[indexnow] ${all ? 'ALL deals' : `changed since ${sinceIso}`}: ${rows.length} deals ` +
      `(excluded_hidden=${excludedHidden}) → ${urls.length} URLs`,
  );
  if (rows.length === 0) {
    console.log('[indexnow] nothing changed — no submission (protocol: only ping real changes).');
    return;
  }
  if (urls.length === 1 && excludedHidden > 0) {
    console.log('[indexnow] all changed deals hidden — submitting homepage only (PDP URLs skipped by policy).');
  }
  if (flag('--dry-run')) {
    console.log('[indexnow] dry-run — first 3 URLs:', urls.slice(0, 3));
    return;
  }
  const n = await submit(urls);
  console.log(`[indexnow] DONE — submitted=${n} excluded_hidden=${excludedHidden} (endpoint propagates to all IndexNow engines).`);
})().catch((e) => {
  console.error(`[indexnow] FAILED: ${e.message}`);
  process.exit(1);
});
