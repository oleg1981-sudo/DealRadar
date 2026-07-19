// AWIN programme discovery + join-queue state machine (Tier 1 of the
// autonomous-affiliate pipeline). Runs daily from GitHub Actions:
//
//   1. Pulls every programme across all relationship states from the AWIN
//      Publisher API (GET /publishers/<id>/programmes — the API is READ-ONLY
//      for relationships; joining stays a human click by design).
//   2. Mirrors them into public.affiliate_programmes, recording relationship
//      TRANSITIONS (invitation appeared, application approved/rejected, ...).
//   3. Scores not-joined programmes against the deterministic join policy
//      below (edit the constants — the policy is versioned, reviewable code).
//   4. Opens/updates a GitHub issue digest when there is anything actionable
//      (GitHub emails you; no extra secrets needed). Resend email optional.
//
// Usage: node scripts/awin-programmes-sync.cjs [--dry-run]
// Env:   AWIN_API_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//        GITHUB_TOKEN + GITHUB_REPOSITORY (provided by Actions; digest issue)
//        RESEND_API_KEY + DIGEST_EMAIL (optional email copy)

const PUBLISHER_ID = '2951525';
const API = 'https://api.awin.com';
const RELATIONSHIPS = ['joined', 'pending', 'suspended', 'rejected', 'notjoined'];

// ── Join policy (deterministic, human-owned): tune these, commit, done. ─────
const SCORE = {
  country: { DE: 40, AT: 25, CH: 25, NL: 15, FR: 15, IT: 15, ES: 15, PL: 15, SE: 15, DK: 15, FI: 15, NO: 15, PT: 15, RO: 15, IE: 10, BE: 15, GB: 5 },
  currencyEUR: 15,
  categoryKeyword: 20, // name/description mentions one of our categories
  hasUrl: 5,
};
const APPLY_AT = 60;      // verdict "apply"    — goes into the digest
const CONSIDER_AT = 35;   // verdict "consider" — visible in the table only
const CATEGORY_KEYWORDS = [
  'electronic', 'elektronik', 'tech', 'computer', 'smart', 'kamera', 'camera',
  'fashion', 'mode', 'kleidung', 'schuhe', 'home', 'garten', 'garden', 'möbel',
  'sport', 'fitness', 'outdoor', 'beauty', 'kosmetik', 'pflege', 'food',
  'lebensmittel', 'toy', 'spielzeug', 'auto', 'automotive', 'kfz', 'buch',
  'book', 'reise', 'travel', 'werkzeug', 'tool', 'baumarkt', 'haushalt',
];

const TOKEN = process.env.AWIN_API_TOKEN || '';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SRK = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DRY = process.argv.includes('--dry-run');

if (!TOKEN) { console.error('[awin-sync] AWIN_API_TOKEN is required'); process.exit(1); }
if (!DRY && (!SUPABASE_URL || !SRK)) { console.error('[awin-sync] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }

const pgHeaders = {
  apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json',
};

async function awinGet(relationship) {
  // accessToken as documented; never log the full URL.
  const url = `${API}/publishers/${PUBLISHER_ID}/programmes?relationship=${encodeURIComponent(relationship)}&accessToken=${encodeURIComponent(TOKEN)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`AWIN ${relationship}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function policy(p) {
  let score = 0;
  score += SCORE.country[p.country_code] ?? 0;
  if (p.currency_code === 'EUR') score += SCORE.currencyEUR;
  const text = `${p.name} ${p.description || ''}`.toLowerCase();
  if (CATEGORY_KEYWORDS.some((k) => text.includes(k))) score += SCORE.categoryKeyword;
  if (p.display_url) score += SCORE.hasUrl;
  const verdict = score >= APPLY_AT ? 'apply' : score >= CONSIDER_AT ? 'consider' : 'skip';
  return { score, verdict };
}

async function fetchExisting() {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/affiliate_programmes?select=programme_id,relationship,policy_verdict`,
      { headers: { ...pgHeaders, Range: `${from}-${from + 999}` } },
    );
    if (!res.ok) throw new Error(`PostgREST read: ${res.status}`);
    const page = await res.json();
    for (const r of page) out.set(r.programme_id, r);
    if (page.length < 1000) break;
  }
  return out;
}

async function upsert(rows) {
  // PostgREST requires IDENTICAL key sets within one request (PGRST102).
  // Rows that transitioned carry an extra `relationship_changed_at` key the
  // others must not have (null would clobber stored timestamps on merge) —
  // so batch per key-signature.
  const bySignature = new Map();
  for (const r of rows) {
    const sig = Object.keys(r).sort().join(',');
    if (!bySignature.has(sig)) bySignature.set(sig, []);
    bySignature.get(sig).push(r);
  }
  for (const group of bySignature.values()) {
    for (let i = 0; i < group.length; i += 500) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/affiliate_programmes?on_conflict=programme_id`, {
        method: 'POST',
        headers: { ...pgHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(group.slice(i, i + 500)),
      });
      if (!res.ok) throw new Error(`PostgREST upsert: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  }
}

// ── coverage watchdog (ingest-v2 P0-5) ─────────────────────────────────────────
// Reconciles feed-list actives × last-ingest results × per-advertiser DB counts
// so a joined advertiser contributing zero products (or a stale/broken feed)
// becomes a 🔴 digest line instead of a months-long silent gap. Pure logic in
// scripts/lib/coverage.cjs; everything here is best-effort data plumbing.
const { parseCsv, buildCoverageReport, formatCoverage, coverageFingerprint } = require('./lib/coverage.cjs');

/** One retry with a short backoff: a single 04:30 blip must not become a red. */
async function withRetry(label, fn) {
  try { return await fn(); }
  catch (e) {
    console.warn(`[awin-sync] ${label} failed (${e.message}) — retrying once`);
    await new Promise((r) => setTimeout(r, 5000));
    return fn();
  }
}

async function fetchFeedList() {
  const feedUrl = process.env.AWIN_FEED_URL || '';
  const key = (feedUrl.match(/\/apikey\/([0-9a-f]+)/i) || [])[1];
  if (!key) throw new Error('AWIN_FEED_URL missing/unparseable — cannot reach the feed list');
  const res = await fetch(`https://ui.awin.com/productdata-darwin-download/publisher/${PUBLISHER_ID}/${key}/1/feedList`);
  if (!res.ok) throw new Error(`feed list: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

async function fetchDealAttribution() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/deals?source=eq.awin&select=product_id,merchant_id,shop_name,hidden,image_url,gallery&order=product_id`,
      { headers: { ...pgHeaders, Range: `${from}-${from + 999}` } },
    );
    if (!res.ok) throw new Error(`deals read: HTTP ${res.status}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function fetchIngestSummary() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ops_metrics?key=eq.awin_ingest_summary&select=meta,recorded_at`,
    { headers: pgHeaders },
  );
  // A failing READ is a check failure (throw → honest ⚠️ message), NOT
  // "summaryMissing" — that state must only ever mean the ingest didn't persist.
  if (!res.ok) throw new Error(`ops_metrics read: HTTP ${res.status}`);
  const rows = await res.json();
  if (!rows.length || !rows[0].meta) return null;
  // The ingest runs daily at 03:00, this sync at 04:30 — a healthy summary is
  // ~1.5h old. Anything past ~27h means LAST NIGHT'S ingest didn't persist
  // (crashed before the write) — that must red on the FIRST miss, not the second.
  const age = Date.now() - Date.parse(rows[0].recorded_at);
  return age > 27 * 3600000 ? null : rows[0].meta;
}

/** remotePatterns tripwire [FR-2.2]: any deal image host not covered by
 *  next.config.mjs remotePatterns silently breaks next/image on prod — and a
 *  non-Shopify host also means the verifier can't promote that advertiser. */
function uncoveredImageHosts(dealRows) {
  const fsLocal = require('fs');
  const pathLocal = require('path');
  const cfg = fsLocal.readFileSync(pathLocal.join(__dirname, '..', 'next.config.mjs'), 'utf8');
  const patterns = [...cfg.matchAll(/hostname:\s*'([^']+)'/g)].map((m) => m[1]);
  const covered = (host) => patterns.some((p) =>
    p.startsWith('**.') ? host === p.slice(3) || host.endsWith(p.slice(2)) : host === p);
  const hosts = new Map();
  for (const d of dealRows) {
    for (const u of [d.image_url, ...(Array.isArray(d.gallery) ? d.gallery : [])]) {
      if (!u) continue;
      try {
        const h = new URL(u).host;
        if (!covered(h)) hosts.set(h, (hosts.get(h) || 0) + 1);
      } catch { /* malformed URL — ingest filters these; ignore */ }
    }
  }
  return hosts;
}

/** Capture-cycle staleness [FR-3.5]: no successful verify capture sweep within
 *  36h (resilient to the observed ~2.5h GitHub cron lateness) is a red. */
async function captureStaleness() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/fetch_outcomes?select=last_seen&order=last_seen.desc&limit=1`,
    { headers: pgHeaders },
  );
  if (!res.ok) return { red: true, detail: `fetch_outcomes read failed: HTTP ${res.status}` };
  const rows = await res.json();
  if (!rows.length) return { red: true, detail: 'no capture-cycle evidence yet (fetch_outcomes empty — verify capture has never completed)' };
  const ageH = (Date.now() - Date.parse(rows[0].last_seen)) / 3600e3;
  if (ageH > 36) return { red: true, detail: `last capture cycle ${ageH.toFixed(0)}h ago (>36h)` };
  return { red: false, detail: `last capture cycle ${ageH.toFixed(1)}h ago` };
}

/** Returns { section, reds, fingerprint } — never throws. */
async function coverageSection(joinedProgrammes) {
  try {
    const [feedRows, dealRows, ingestSummary] = await Promise.all([
      withRetry('feed list', fetchFeedList),
      withRetry('deal attribution', fetchDealAttribution),
      withRetry('ingest summary', fetchIngestSummary),
    ]);
    const report = buildCoverageReport({ feedRows, dealRows, joinedProgrammes, ingestSummary, now: new Date() });
    let section = formatCoverage(report);
    let reds = report.reds;
    const fpExtra = [];
    const uncovered = uncoveredImageHosts(dealRows);
    if (uncovered.size) {
      const list = [...uncovered.entries()].map(([h, n]) => `${h} (${n} rows)`).join(', ');
      section += `\n- 🔴 **image hosts outside next.config remotePatterns** — next/image breaks on prod: ${list}`;
      reds++;
      fpExtra.push(`remotepatterns:${[...uncovered.keys()].sort().join(',')}`);
    }
    const cap = await captureStaleness();
    if (cap.red) {
      section += `\n- 🔴 **content-capture cycle stale** [FR-3.5]: ${cap.detail}`;
      reds++;
      fpExtra.push('capture-stale');
    }
    const fingerprint = [coverageFingerprint(report), ...fpExtra].join('|');
    return { section, reds, fingerprint };
  } catch (e) {
    return {
      section: `## Feed coverage (watchdog)\n⚠️ **Coverage check failed** (after retry): ${e.message} — coverage state UNKNOWN this run.`,
      reds: 1,
      fingerprint: `check-failed:${e.message}`,
    };
  }
}

// ── managed alert issue: one living issue, updated on change, closed on clear ──
const ALERT_LABEL = 'awin-coverage-alert';
const FP_RE = /<!-- watchdog-fingerprint: (.*?) -->/;

async function ghApi(method, path, body) {
  const gh = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!gh || !repo) return null;
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { console.warn(`[awin-sync] github ${method} ${path}: HTTP ${res.status}`); return null; }
  return res.json();
}

/** Create/update/close the single coverage-alert issue. Deduped by red-set
 *  fingerprint: identical reds tomorrow → no writes, no notification noise. */
async function syncAlertIssue(coverage) {
  const open = await ghApi('GET', `/issues?labels=${ALERT_LABEL}&state=open&per_page=1`);
  const existing = Array.isArray(open) && open[0] ? open[0] : null;
  const body = `${coverage.section}\n\n_Updated ${new Date().toISOString().slice(0, 16)}Z by the coverage watchdog._\n<!-- watchdog-fingerprint: ${coverage.fingerprint} -->`;

  if (coverage.reds === 0) {
    if (existing) {
      await ghApi('POST', `/issues/${existing.number}/comments`, { body: '🟢 All coverage alerts resolved — closing.' });
      await ghApi('PATCH', `/issues/${existing.number}`, { state: 'closed' });
      console.log(`[awin-sync] coverage clear — closed alert issue #${existing.number}`);
    }
    return;
  }
  if (!existing) {
    const created = await ghApi('POST', '/issues', {
      title: `🔴 AWIN coverage alerts (${coverage.reds})`, body, labels: [ALERT_LABEL],
    });
    if (created) console.log(`[awin-sync] opened coverage alert issue #${created.number}`);
    return;
  }
  const prevFp = (existing.body || '').match(FP_RE)?.[1];
  if (prevFp === coverage.fingerprint) {
    console.log(`[awin-sync] coverage reds unchanged — no issue update (#${existing.number})`);
    return;
  }
  await ghApi('PATCH', `/issues/${existing.number}`, { title: `🔴 AWIN coverage alerts (${coverage.reds})`, body });
  await ghApi('POST', `/issues/${existing.number}/comments`, { body: `Red set changed:\n\n${coverage.section}` });
  console.log(`[awin-sync] updated coverage alert issue #${existing.number}`);
}

/** [EC-12] Monthly proof the alert channel actually fires: keep a closed
 *  `alert-test` issue fresher than 30 days (created+closed in one pass). */
async function ensureAlertTestFresh() {
  const since = new Date(Date.now() - 30 * 86400e3).toISOString();
  const recent = await ghApi('GET', `/issues?labels=alert-test&state=all&since=${since}&per_page=5`);
  if (Array.isArray(recent) && recent.some((i) => Date.parse(i.created_at) > Date.now() - 30 * 86400e3)) return;
  const created = await ghApi('POST', '/issues', {
    title: `alert-test ${new Date().toISOString().slice(0, 10)}`,
    body: 'Automated alert-channel test fire [EC-12, docs/specs/pdp-full-content]. Auto-closed — no action needed.',
    labels: ['alert-test'],
  });
  if (created) {
    await ghApi('PATCH', `/issues/${created.number}`, { state: 'closed' });
    console.log(`[awin-sync] alert-test fired: issue #${created.number} (created+closed)`);
  }
}

async function githubIssue(title, body) {
  const gh = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY;
  if (!gh || !repo) { console.warn('[awin-sync] no GITHUB_TOKEN/REPOSITORY — digest printed only'); return; }
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gh}`, Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ title, body, labels: ['awin-join-queue'] }),
  });
  console.log(`[awin-sync] digest issue: HTTP ${res.status}`);
}

(async () => {
  const now = new Date().toISOString();
  const fetched = [];
  for (const rel of RELATIONSHIPS) {
    try {
      const list = await awinGet(rel);
      console.log(`[awin-sync] ${rel}: ${list.length} programmes`);
      for (const p of list) {
        fetched.push({
          programme_id: p.id,
          network: 'awin',
          name: p.name,
          description: (p.description || '').slice(0, 2000),
          display_url: p.displayUrl || null,
          logo_url: p.logoUrl || null,
          country_code: p.primaryRegion?.countryCode || null,
          currency_code: p.currencyCode || null,
          relationship: rel,
          last_seen: now,
          raw: p,
        });
      }
    } catch (e) {
      // One state failing (e.g. vocab drift on "notjoined") must not kill the sync.
      console.error(`[awin-sync] WARN ${e.message}`);
    }
  }
  if (fetched.length === 0) { console.error('[awin-sync] nothing fetched — aborting'); process.exit(1); }

  for (const row of fetched) {
    const { score, verdict } = policy(row);
    row.policy_score = score;
    row.policy_verdict = row.relationship === 'notjoined' ? verdict : 'n/a';
  }

  if (DRY) {
    const apply = fetched.filter((r) => r.policy_verdict === 'apply');
    console.log(`[awin-sync] DRY RUN — total ${fetched.length}, apply-verdict ${apply.length}`);
    for (const r of apply.slice(0, 15)) console.log(`  APPLY ${r.programme_id} ${r.name} (${r.country_code}, score ${r.policy_score})`);
    return;
  }

  const existing = await fetchExisting();
  const events = [];
  const newRecommendations = [];
  for (const row of fetched) {
    const prev = existing.get(row.programme_id);
    if (prev && prev.relationship !== row.relationship) {
      row.relationship_changed_at = now;
      events.push(`- **${row.name}** (#${row.programme_id}): \`${prev.relationship}\` → \`${row.relationship}\``);
    }
    if (!prev && row.policy_verdict === 'apply') {
      newRecommendations.push(row);
    }
  }
  await upsert(fetched);
  console.log(`[awin-sync] upserted ${fetched.length} · transitions ${events.length} · new apply-recs ${newRecommendations.length}`);

  // First-ever sync seeds the whole 21k-programme directory — thousands match
  // the policy at once. That is table data, not digest material: a digest is
  // only useful when it lists a reviewable handful. Past the seed run, "new"
  // means genuinely-new-in-the-directory (a trickle).
  const SEED_THRESHOLD = 50;
  const isSeedRun = newRecommendations.length > SEED_THRESHOLD;

  // Coverage watchdog (P0-5): computed every run. Alerts live in ONE managed
  // issue (created on red, updated only when the red set changes, closed on
  // clear) — the daily digest carries the section as context when it posts.
  const joined = fetched.filter((r) => r.relationship === 'joined')
    .map((r) => ({ programme_id: r.programme_id, name: r.name }));
  const coverage = await coverageSection(joined);
  await ensureAlertTestFresh();
  console.log(`[awin-sync] coverage: ${coverage.reds} red flag(s) [${coverage.fingerprint.slice(0, 80)}]`);
  await syncAlertIssue(coverage);

  if (events.length > 0 || newRecommendations.length > 0) {
    const top = newRecommendations.sort((a, b) => b.policy_score - a.policy_score);
    const recLines = top
      .slice(0, 15)
      .map((r) => `- **${r.name}** (#${r.programme_id}, ${r.country_code}, score ${r.policy_score}) — ${r.display_url || 'no url'}`);
    const recSection = isSeedRun
      ? `## Initial directory seed\n${newRecommendations.length} of ${fetched.length} programmes match the join policy. They are queryable in \`affiliate_programmes\` (policy_verdict='apply', ordered by policy_score). Top 15:\n${recLines.join('\n')}\n\nFuture digests will list only genuinely new programmes.`
      : recLines.length
        ? `## New programmes matching the join policy\n${recLines.join('\n')}\n\nJoin via the [Advertiser Directory](https://ui.awin.com/awin/affiliate/${PUBLISHER_ID}/navigation/merchants) (search by name).`
        : '';
    const body = [
      `AWIN join-queue digest — ${now.slice(0, 10)} (publisher ${PUBLISHER_ID})`,
      '',
      events.length ? `## Relationship changes\n${events.join('\n')}` : '',
      recSection,
      coverage.section,
      '',
      '_Generated by awin-programmes-sync. Policy: scripts/awin-programmes-sync.cjs. The join click is deliberately human._',
    ].filter(Boolean).join('\n');
    await githubIssue(
      isSeedRun
        ? `AWIN join queue: initial seed — ${newRecommendations.length} policy matches in directory (${now.slice(0, 10)})`
        : `AWIN join queue: ${events.length} change(s), ${newRecommendations.length} recommendation(s) — ${now.slice(0, 10)}`,
      body,
    );
  } else {
    console.log('[awin-sync] nothing actionable — no digest.');
  }
})().catch((e) => {
  console.error(`[awin-sync] FAILED: ${e.message}`);
  process.exit(1);
});
