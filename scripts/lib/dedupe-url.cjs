/**
 * URL-level canonicalisation for the AWIN ingest — one merchant product page
 * publishes exactly ONE row.
 *
 * Why this exists (issue #27). The ingest deduped by `product_id` alone. An
 * advertiser that lists one catalogue in two AWIN feeds gets a DIFFERENT
 * aw_product_id per feed for the same `merchant_deep_link`, so product_id
 * dedupe cannot collapse them and both rows publish. Measured in production
 * 2026-07-24: Lyra Pet DE (#115425, feeds 102589 + 104303) produced 120
 * merchant_url groups × 2 visible rows = 240 rows, each pair carrying the SAME
 * discount_percent at prices up to 12.2% apart. Live pages matched the cheaper
 * row to the cent in 6 of 7 samples and the pricier row in 0 of 7, so the
 * second row was publishing a price the shop does not charge.
 *
 * Three design choices worth stating, because each looks arbitrary from
 * outside and each was arrived at by disproving the obvious alternative:
 *
 *   1. Sameness must be PROVEN, not guessed. Rows collapse only when they share
 *      an advertiser, a merchant_url AND a non-empty merchant_sku. Merchants do
 *      legitimately put several products behind one URL (WooCommerce variant
 *      params), and merging those would replace a known-uncertain price with a
 *      confidently-wrong one — strictly worse than the duplicate. The identity
 *      key therefore UNDER-groups by design: a missed collapse leaves today's
 *      duplicate in place, which is the status quo, while an over-eager one
 *      destroys a real product. `stats.refusedCollisions` counts the misses so
 *      "found nothing" stays distinguishable from "refused to act".
 *
 *   2. Price is NOT a tie-break. "Cheapest wins" would fit an accident of
 *      today's data (the losing feed happens to be the pricier one) and it
 *      biases every future tie toward advertising BELOW what the shop charges
 *      — the direction that burns a user on arrival. The rule ranks evidence
 *      and provenance instead, and is deliberately blind to the number.
 *
 *   3. Feed freshness only decides when a feed is ACTUALLY fresh. Both Lyra Pet
 *      feeds are ≥16 days stale (the coverage watchdog reports the fresher of
 *      the two at 16 days), and between two stale feeds "less stale" is not
 *      evidence of a correct price — a 16-day-old price and a 20-day-old price
 *      are both wrong. Letting a 4-day relative gap decide 122 published prices
 *      would be a confident guess wearing a principled costume. So freshness
 *      discriminates only when at least one candidate feed is inside
 *      FRESH_WINDOW_DAYS; otherwise the stable provenance rule decides.
 *
 * Note on scope: while price preservation in the ingest is unconditional, the
 * winner's price is the STORED one, not the incoming feed's. Electing a feed
 * therefore chooses which already-stored price survives — it does not import a
 * fresher number. That is the sibling feed-freshness design's defect to fix
 * (its §3.2); it is not something this rule can or should do.
 */

/** Matches the coverage watchdog's `staleDays` — beyond this a feed is not evidence. */
const FRESH_WINDOW_DAYS = 14;

/** Epoch-day number of an AWIN "Last Imported" stamp, or null if unparseable. */
// Deliberately a DAY NUMBER, not an age: an age is measured from `now`, so
// flooring two ages independently makes their difference flip as the clock
// crosses each stamp's day boundary — two fixed stamps 2h apart would rank one
// way at 01:30 and the other at 03:15, flapping the winner between runs. A day
// number is a property of the stamp alone, so the ordering is time-invariant.
function feedImportDay(lastImported) {
  const t = Date.parse(String(lastImported || '').replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return null; // unknown, never a wrong number
  return Math.floor(t / 86400000);
}

/** Whole days between an AWIN "Last Imported" stamp and `now`, or null. */
function feedAgeDays(lastImported, now) {
  const t = Date.parse(String(lastImported || '').replace(' ', 'T') + 'Z');
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}

/**
 * Identity key for a merchant product page.
 *
 * Deliberately conservative: scheme/host are case-folded and the fragment and a
 * trailing slash are dropped, but the PATH keeps its case and the QUERY is kept
 * verbatim — variant params (`?attribute_pa_menge=3x1000-g`) are what tells two
 * genuinely different products apart. Returns null for anything unusable so
 * such rows can never be grouped with each other.
 */
function canonicalUrlKey(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
}

/** Group key, or null when this row must stand alone. */
function groupKeyFor(row) {
  const url = canonicalUrlKey(row.merchant_url);
  if (!url) return null;
  const sku = String(row.merchant_sku ?? '').trim();
  if (!sku) return null; // sameness unproven — never collapse
  const adv = String(row.merchant_id ?? '').trim();
  return `${adv} ${sku} ${url}`;
}

/**
 * Publication eligibility, the FIRST ranking component.
 *
 * `last_verify_outcome` is not a boolean "was verified" — the verifier's
 * vocabulary is mostly negative ('gone', 'out-of-stock', 'no-discount', each
 * written together with hidden:true) and only 'ok-live' means "publishing".
 * Treating any verdict as a win let a 404'd row outrank a live one, hide it as
 * a duplicate, and take the whole page dark permanently.
 *
 * `blocked` is a row hidden by an owner that is not this rule (verifier,
 * stale-hide, TH-3, or the hidden-until-proven split). This rule cannot
 * un-hide those, so electing one would also darken the page. A row hidden by
 * THIS rule (duplicate_of set) is not blocked: the restore path can bring it
 * back, which is exactly what makes it eligible to win again.
 *
 *   0 = proven live and publishable   1 = no verdict, publishable   2 = neither
 */
function eligibilityOf(e) {
  const lvo = e ? e.last_verify_outcome : null;
  const blocked = !!e && e.hidden === true && e.duplicate_of == null;
  if (lvo != null && lvo !== 'ok-live') return 2; // verifier says do not publish
  if (blocked) return 2;
  return lvo === 'ok-live' ? 0 : 1;
}

/**
 * Rank vector for one candidate — lower sorts first, i.e. wins. Compared
 * lexicographically, so each entry only breaks ties left by the ones before it.
 */
function rankOf(row, feedMeta, existing, useFreshness, now) {
  const m = feedMeta.get(row.product_id) || null;

  // 1. Can this row publish at all, and has a live fetch proved it?
  const eligibility = eligibilityOf(existing.get(row.product_id));

  // 2. Freshest source feed — but only when the caller found a genuinely fresh
  //    feed in the group (see FRESH_WINDOW_DAYS). Newer day number wins, so
  //    negate it; unknown sorts last, preferring a feed we can vouch for. A
  //    stamp dated after today is clock skew between AWIN and the runner, so it
  //    is capped at today rather than being rewarded for it.
  const raw = useFreshness && m ? feedImportDay(m.lastImported) : null;
  const day = raw == null ? null : Math.min(raw, Math.floor(now.getTime() / 86400000));
  const freshRank = day == null ? Number.MAX_SAFE_INTEGER : -day;

  // 3. Lowest feed ID — an advertiser's first-established feed is their primary
  //    shop feed; later ones are channel add-ons. Stable across runs, which
  //    matters more than being clever: a winner that flapped nightly would
  //    churn `hidden` and the sitemap.
  const feedRank = m && /^\d+$/.test(String(m.feedId ?? '')) ? Number(m.feedId) : Number.MAX_SAFE_INTEGER;

  // 4. Absolute determinism, so the result never depends on feed arrival order.
  //    Legacy ids ('awin:123') and v2 ids ('awin:DE:adv1:9') live in one string
  //    space, so on a total tie this prefers legacy — a provenance preference,
  //    not a neutral one, but it only fires when every signal above is equal.
  return [eligibility, freshRank, feedRank, String(row.product_id)];
}

function cmpRank(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

/**
 * Decide what publishes, what gets hidden as a duplicate, and what comes back.
 *
 * @param rows      normalized ingest rows (post product_id dedupe)
 * @param feedMeta  Map<product_id, { feedId, lastImported }> — provenance for
 *                  rows acquired per-fid; absent for combined-cid rows
 * @param existing  Map<product_id, { hidden, duplicate_of, last_verify_outcome }>
 * @param now       Date
 * @returns {{ winners, losers: {row, duplicateOf}[], restores, stats }}
 *          The three row groups are DISJOINT and together contain every input
 *          row exactly once — each becomes its own PostgREST request, which
 *          needs uniform keys per batch.
 */
function planUrlCanonicalisation(rows, { feedMeta = new Map(), existing = new Map(), now = new Date() } = {}) {
  const groups = new Map();
  const solo = [];
  const urlCounts = new Map();
  for (const r of rows) {
    const u = canonicalUrlKey(r.merchant_url);
    if (u) urlCounts.set(u, (urlCounts.get(u) || 0) + 1);
    const k = groupKeyFor(r);
    if (k === null) { solo.push(r); continue; }
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  const elected = [...solo];
  const losers = [];
  // URLs whose collision this rule accounted for — either by collapsing it or
  // by deliberately leaving an already-dark page alone. Anything left over is a
  // collision refused for UNPROVEN SAMENESS, which is what the counter reports.
  const handledUrls = new Set();
  // Collapsed PAGES, which is not the same number as collapsed GROUPS: the key
  // is (advertiser, sku, url), so one page carrying several SKUs yields several
  // groups. Reporting groups as "pages" would overstate the page count.
  const collapsedUrls = new Set();
  let collapsedGroups = 0;
  let deadGroups = 0;
  for (const members of groups.values()) {
    if (members.length === 1) { elected.push(members[0]); continue; }

    // Freshness is evidence only while a feed is actually fresh. Between two
    // long-stale feeds, "less stale" is not a reason to trust a price, so the
    // criterion is switched off and stable provenance decides instead.
    const useFreshness = members.some((m) => {
      const meta = feedMeta.get(m.product_id);
      if (!meta) return false;
      const age = feedAgeDays(meta.lastImported, now);
      return age !== null && age <= FRESH_WINDOW_DAYS;
    });

    const ranked = [...members].sort((a, b) =>
      cmpRank(rankOf(a, feedMeta, existing, useFreshness, now), rankOf(b, feedMeta, existing, useFreshness, now)));
    const [winner, ...rest] = ranked;

    // Every candidate is already non-publishing (verifier said gone/out-of-stock,
    // or another owner hid them). There is no duplicate on display to fix, and
    // hiding a row so a dead one can "win" would darken the page for good.
    if (eligibilityOf(existing.get(winner.product_id)) === 2) {
      elected.push(...members);
      handledUrls.add(canonicalUrlKey(winner.merchant_url));
      deadGroups++;
      continue;
    }

    collapsedGroups++;
    handledUrls.add(canonicalUrlKey(winner.merchant_url));
    collapsedUrls.add(canonicalUrlKey(winner.merchant_url));
    elected.push(winner);
    for (const l of rest) losers.push({ row: l, duplicateOf: winner.product_id });
  }

  // A row we previously hid AS A DUPLICATE, which now wins its page, must be
  // published again — the rival feed dropped it, or evidence overtook it.
  // Guarded so the un-hide can only ever undo a hide this rule itself made:
  // never against a verifier verdict, and never promoting a row with no
  // discount (the hidden-until-proven split owns those, not this rule).
  const winners = [];
  const restores = [];
  for (const r of elected) {
    const e = existing.get(r.product_id);
    const undoable = e && e.hidden === true && e.duplicate_of != null;
    const verdictAllows = !e || e.last_verify_outcome == null || e.last_verify_outcome === 'ok-live';
    if (undoable && verdictAllows && Number(r.discount_percent) > 0) restores.push(r);
    else winners.push(r);
  }

  let refusedCollisions = 0;
  for (const [u, n] of urlCounts) if (n > 1 && !handledUrls.has(u)) refusedCollisions++;

  return {
    winners,
    losers,
    restores,
    stats: {
      groups: collapsedGroups,
      pages: collapsedUrls.size,
      collapsed: losers.length,
      restored: restores.length,
      deadGroups,
      refusedCollisions,
    },
  };
}

module.exports = { planUrlCanonicalisation, canonicalUrlKey, feedAgeDays, feedImportDay, FRESH_WINDOW_DAYS };
