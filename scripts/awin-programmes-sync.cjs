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
  for (let i = 0; i < rows.length; i += 500) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/affiliate_programmes?on_conflict=programme_id`, {
      method: 'POST',
      headers: { ...pgHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(i, i + 500)),
    });
    if (!res.ok) throw new Error(`PostgREST upsert: ${res.status} ${(await res.text()).slice(0, 200)}`);
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

  if (events.length > 0 || newRecommendations.length > 0) {
    const recLines = newRecommendations
      .sort((a, b) => b.policy_score - a.policy_score)
      .slice(0, 15)
      .map((r) => `- **${r.name}** (#${r.programme_id}, ${r.country_code}, score ${r.policy_score}) — ${r.display_url || 'no url'}`);
    const body = [
      `AWIN join-queue digest — ${now.slice(0, 10)} (publisher ${PUBLISHER_ID})`,
      '',
      events.length ? `## Relationship changes\n${events.join('\n')}` : '',
      recLines.length ? `## New programmes matching the join policy\n${recLines.join('\n')}\n\nJoin via the [Advertiser Directory](https://ui.awin.com/awin/affiliate/${PUBLISHER_ID}/navigation/merchants) (search by name).` : '',
      '',
      '_Generated by awin-programmes-sync. Policy: scripts/awin-programmes-sync.cjs. The join click is deliberately human._',
    ].filter(Boolean).join('\n');
    await githubIssue(
      `AWIN join queue: ${events.length} change(s), ${newRecommendations.length} recommendation(s) — ${now.slice(0, 10)}`,
      body,
    );
  } else {
    console.log('[awin-sync] nothing actionable — no digest.');
  }
})().catch((e) => {
  console.error(`[awin-sync] FAILED: ${e.message}`);
  process.exit(1);
});
