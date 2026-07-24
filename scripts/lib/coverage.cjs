// Coverage watchdog core (ingest-v2 P0-5) — pure, testable classification.
//
// "Ensure 100%" as a standing invariant: every nightly programmes-sync run
// reconciles four sources that history proved CAN silently diverge —
//   1. the feed list (which feeds exist per advertiser, format, language,
//      Last Imported staleness),
//   2. joined programmes from the Publisher API,
//   3. what the last ingest actually consumed (per-feed results persisted to
//      ops_metrics by scripts/ingest-awin.cjs),
//   4. per-advertiser row counts in the deals table.
// The Google-format gap sat invisible for months because nothing compared
// (1) against (4); ROCKBROS's legacy feed was 2 months stale because nothing
// read Last Imported. This module exists so neither happens again.
//
// Dependency-free; consumed by scripts/awin-programmes-sync.cjs.
'use strict';

/** Quote-aware CSV → array of header-keyed objects (RFC-4180, BOM-tolerant). */
function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQuotes = false, quoteEnd = false;
  const flushField = () => { row.push(field); field = ''; };
  const flushRow = () => { flushField(); rows.push(row); row = []; };
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (quoteEnd) {
        if (c === '"') { field += '"'; quoteEnd = false; }
        else { inQuotes = false; quoteEnd = false; i--; }
      } else if (c === '"') quoteEnd = true;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') flushField();
    else if (c === '\n') flushRow();
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) flushRow();
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.replace(/^\uFEFF/, ''));
  return rows.slice(1)
    .filter((r) => r.length >= header.length * 0.5)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

/** v2 identity → advertiser id ("awin:DE:adv122456:49..." → "122456"), else null. */
function parseAdvertiserId(productId) {
  const m = /^awin:[A-Z]{2}:adv(\d+):/.exec(productId || '');
  return m ? m[1] : null;
}

/** "2026-07-16 06:18:34" (UTC) → age in whole days at `now`, or null. */
function feedAgeDays(lastImported, now) {
  const t = Date.parse(String(lastImported || '').replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}

/**
 * Reconcile the four sources into a per-advertiser coverage report.
 *
 * feedRows          parsed feed-list rows (header-keyed objects)
 * dealRows          [{ product_id, merchant_id, shop_name, hidden }] (source=awin)
 * joinedProgrammes  [{ programme_id, name }] — relationship 'joined' from the API
 * ingestSummary     ops_metrics meta from the last ingest run:
 *                   { ranAt, enhanced: [{feed, advertiser, scanned, kept, error?}] } | null
 * now               Date
 * language          feed-list Language value the market consumes (default 'German')
 * staleDays         consumed-feed age that triggers a red (default 14)
 */
function buildCoverageReport({ feedRows, dealRows, joinedProgrammes = [], ingestSummary = null, now, language = 'German', staleDays = 14, extraLanguages = ['English'], marketCountry = 'DE' }) {
  const active = feedRows.filter((f) => f['Membership Status'] === 'active');

  // Group active feeds per advertiser; note which advertisers run any Google feed
  // (their legacy rows are skipped by the ingest — Google feed wins).
  const byAdv = new Map();
  for (const f of active) {
    const id = f['Advertiser ID'];
    if (!byAdv.has(id)) byAdv.set(id, { id, name: f['Advertiser Name'], feeds: [] });
    byAdv.get(id).feeds.push(f);
  }
  const googleAdvertisers = new Set(active.filter((f) => f['Datafeed Format'] === 'Google').map((f) => f['Advertiser ID']));

  // Per-advertiser DB attribution: v2 rows by product-id namespace, v1 rows by
  // the merchant_id column the regenerated feed carries.
  const counts = new Map(); // advertiserId → { populated, live }
  const unattributed = new Map(); // shop_name → rows (soft membership etc.)
  for (const d of dealRows) {
    const adv = parseAdvertiserId(d.product_id) || (d.merchant_id ? String(d.merchant_id) : null);
    if (adv && byAdv.has(adv)) {
      const c = counts.get(adv) || { populated: 0, live: 0 };
      c.populated++;
      if (!d.hidden) c.live++;
      counts.set(adv, c);
    } else {
      unattributed.set(d.shop_name, (unattributed.get(d.shop_name) || 0) + 1);
    }
  }

  // Last-ingest evidence, keyed by Feed ID (stable across advertiser renames).
  // A null feeds array means the whole feed-list pass failed/was skipped —
  // that is a red of its own, NOT "no errors". (`enhanced` is the pre-07-19
  // key name, accepted for one transition night.)
  // NOTE: feeds:null means "pass failed" and must NOT fall through to the
  // legacy `enhanced` key (?? would) — only an ABSENT feeds key does.
  const summaryFeeds = ingestSummary
    ? (ingestSummary.feeds !== undefined ? ingestSummary.feeds : ingestSummary.enhanced)
    : undefined;
  const enhancedPassFailed = !!ingestSummary && summaryFeeds === null;
  const summaryByFeedId = new Map();
  for (const f of summaryFeeds || []) {
    summaryByFeedId.set(String(f.feed), f);
  }

  const advertisers = [];
  for (const adv of byAdv.values()) {
    // Consumability mirrors the ingest's feed-list pass: Google feeds in the
    // market language via their listed URL; legacy feeds per-fid (no URL needed
    // — the ingest builds its own) unless the advertiser also runs a Google
    // feed (Google wins for dual-format advertisers).
    const consumed = adv.feeds.filter((f) => {
      // A feed is language-acceptable if it matches the primary language OR if it
      // is in an extra language AND the advertiser's Primary Region matches the
      // market country. Defensive default: empty/missing/unrecognised Primary
      // Region keeps the feed yellow — never over-ingest.
      const sameMarket = (f['Primary Region'] || '').toUpperCase() === marketCountry;
      const langOk = f['Language'] === language || (extraLanguages.includes(f['Language']) && sameMarket);
      return f['Datafeed Format'] === 'Google'
        ? (langOk && !!f['URL'])
        : (langOk && !googleAdvertisers.has(adv.id));
    });
    const c = counts.get(adv.id) || { populated: 0, live: 0 };
    const entry = { id: adv.id, name: adv.name, populated: c.populated, live: c.live, feeds: adv.feeds.length };

    if (consumed.length === 0) {
      const langs = [...new Set(adv.feeds.map((f) => `${f['Language']}/${f['Datafeed Format']}`))].join(', ');
      // Policy exclusion with rows in the DB is contradictory — likely feed-list
      // vocabulary drift (a renamed Language/format value). Escalate, don't calm.
      if (c.populated > 0) {
        advertisers.push({ ...entry, status: 'red', detail: `policy says not consumable (${langs}) yet ${c.populated} rows exist — vocabulary drift?` });
      } else {
        advertisers.push({ ...entry, status: 'yellow', detail: `no consumable feed (policy): ${langs}` });
      }
      continue;
    }
    // Last-ingest evidence per consumed feed (both formats): an error, a
    // missing entry, or a zero-row scan is a red TODAY even while old
    // populated rows linger — "populated" alone must never keep a dead feed
    // green. (Skip missing-entry reds when the summary predates the two-format
    // pass — `enhanced` fallback carries Google entries only.)
    const summaryCoversLegacy = !ingestSummary || ingestSummary.feeds !== undefined;
    let evidenceRed = null;
    for (const f of consumed) {
      const isGoogle = f['Datafeed Format'] === 'Google';
      const s = summaryByFeedId.get(String(f['Feed ID']));
      if (enhancedPassFailed) { evidenceRed = 'feed-list ingest pass failed on the last run'; break; }
      if (ingestSummary && !s && (isGoogle || summaryCoversLegacy)) { evidenceRed = `feed ${f['Feed ID']} not consumed by the last ingest`; break; }
      if (s && s.error) { evidenceRed = `last ingest failed for feed ${f['Feed ID']}: ${s.error}`; break; }
      if (s && s.scanned === 0) { evidenceRed = `feed ${f['Feed ID']} was EMPTY at the last ingest`; break; }
    }
    if (evidenceRed) { advertisers.push({ ...entry, status: 'red', detail: evidenceRed }); continue; }
    const ages = consumed.map((f) => feedAgeDays(f['Last Imported'], now)).filter((a) => a !== null);
    const freshest = ages.length ? Math.min(...ages) : null;
    if (freshest !== null && freshest > staleDays) {
      advertisers.push({ ...entry, status: 'red', detail: `consumed feed stale: last imported ${freshest} days ago` });
      continue;
    }
    if (c.populated === 0) {
      // Legacy-format advertisers are consumed via the combined category feed,
      // and ingest-v1 (by design) keeps only discounted rows — 0 rows with a
      // healthy scan is "no deals right now", not a gap. Only 0 rows AND
      // 0 scanned (or no scan data) is a genuine coverage gap. Enhanced (v2)
      // advertisers always populate (hidden), so 0 rows there is always red.
      const isLegacyConsumed = consumed.every((f) => f['Datafeed Format'] !== 'Google');
      const scanCounts = (ingestSummary && ingestSummary.legacyScannedById) || null;
      const scannedRows = scanCounts ? (scanCounts[adv.id] || 0) : null;
      if (isLegacyConsumed && scannedRows !== null && scannedRows > 0) {
        advertisers.push({ ...entry, status: 'yellow', detail: `scanned ${scannedRows} feed rows, none currently discounted (v1 keeps deals only)` });
      } else {
        advertisers.push({ ...entry, status: 'red', detail: 'consumable feed but 0 rows in DB — coverage gap' });
      }
      continue;
    }
    advertisers.push({ ...entry, status: 'green', detail: `${c.populated} populated, ${c.live} live` });
  }

  // Joined per the Publisher API but absent from the feed list entirely
  // (nothing to ingest — worth knowing, not our defect).
  const feedAdvIds = new Set(feedRows.map((f) => f['Advertiser ID']));
  const joinedNoFeed = joinedProgrammes.filter((p) => !feedAdvIds.has(String(p.programme_id)));

  // Membership divergence: the API says joined but every feed-list row for the
  // advertiser is non-active — the feed side lost the membership (or vice
  // versa). Exactly the silent-divergence class this module exists to catch.
  const activeAdvIds = new Set(active.map((f) => f['Advertiser ID']));
  for (const p of joinedProgrammes) {
    const id = String(p.programme_id);
    if (feedAdvIds.has(id) && !activeAdvIds.has(id)) {
      advertisers.push({
        id, name: p.name, populated: 0, live: 0, feeds: 0,
        status: 'red', detail: 'API reports joined but feed-list membership is not active — memberships diverged',
      });
    }
  }

  // COMPLETENESS GUARANTEE [64-vs-16 root-cause audit, 2026-07-23]: every
  // joined programme MUST land in exactly one bucket. BrightCHAMPS UK
  // (#114656) proved a programme can slip through every path above (feed rows
  // present but neither active-classified, no-feed, nor divergence-flagged —
  // e.g. an ID-form mismatch or a membership state outside the known two).
  // Anything unaccounted is a RED, never silence.
  const classified = new Set(advertisers.map((a) => String(a.id)));
  for (const p of joinedProgrammes) {
    const id = String(p.programme_id);
    if (classified.has(id)) continue;
    if (!feedAdvIds.has(id)) continue; // covered by joinedNoFeed
    advertisers.push({
      id, name: p.name, populated: 0, live: 0, feeds: 0,
      status: 'red', detail: 'joined and present in the feed list but UNCLASSIFIED by reconciliation — enumeration gap (ID mismatch or unknown membership state)',
    });
  }


  // No ingest summary at all → the persistence layer or the ingest is broken.
  const summaryMissing = !ingestSummary;

  const reds = advertisers.filter((a) => a.status === 'red').length + (summaryMissing ? 1 : 0);
  const yellows = advertisers.filter((a) => a.status === 'yellow').length + joinedNoFeed.length;
  const softRows = [...unattributed.values()].reduce((a, b) => a + b, 0);

  return { advertisers, joinedNoFeed, summaryMissing, reds, yellows, softMerchants: unattributed.size, softRows };
}

const ICON = { red: '🔴', yellow: '🟡', green: '🟢' };

/** Markdown digest section. */
function formatCoverage(report, { language = 'German', extraLanguages = ['English'], marketCountry = 'DE' } = {}) {
  const lines = ['## Feed coverage (watchdog)'];
  if (report.summaryMissing) {
    lines.push('🔴 **No ingest summary in ops_metrics** — the last ingest either failed before persisting results or the metric write broke. Check the ingest-awin workflow.');
  }
  const order = { red: 0, yellow: 1, green: 2 };
  for (const a of [...report.advertisers].sort((x, y) => order[x.status] - order[y.status] || y.populated - x.populated)) {
    lines.push(`- ${ICON[a.status]} **${a.name}** (#${a.id}): ${a.detail}`);
  }
  if (report.joinedNoFeed.length) {
    lines.push(`- 🟡 joined but no feed listed: ${report.joinedNoFeed.map((p) => `${p.name} (#${p.programme_id})`).join(', ')}`);
  }
  if (report.softMerchants) {
    lines.push(`- ℹ️ ${report.softRows} rows from ${report.softMerchants} merchant(s) outside feed-list actives (soft membership or pre-v2 rows) — listed for transparency.`);
  }
  const extraNote = extraLanguages.length
    ? `; same-market (Primary Region = ${marketCountry}) feeds also accepted in [${extraLanguages.join(', ')}] since the 2026-07 quick win`
    : '';
  lines.push(`\n_Consumption policy: ${language}-language feeds${extraNote}; Google format wins for dual-format advertisers. Red = act; yellow = known policy exclusion._`);
  return lines.join('\n');
}

/** Stable identity of the current red set — the alert-issue dedupe key. Same
 *  reds tomorrow → same fingerprint → no new issue/comment. */
function coverageFingerprint(report) {
  const parts = report.advertisers
    .filter((a) => a.status === 'red')
    .map((a) => `${a.id}:${a.detail.split(':')[0]}`)
    .sort();
  if (report.summaryMissing) parts.unshift('summary-missing');
  return parts.join('|') || 'clear';
}

module.exports = { parseCsv, parseAdvertiserId, feedAgeDays, buildCoverageReport, formatCoverage, coverageFingerprint };
