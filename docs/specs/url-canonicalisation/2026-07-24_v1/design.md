# URL-level canonicalisation — one product page, one row

**Date:** 2026-07-24 · **Status:** implemented · **Scope:** `scripts/ingest-awin.cjs`,
`scripts/lib/dedupe-url.cjs`, `supabase/schema.sql`

Sibling work: `docs/specs/feed-freshness/2026-07-24_v1/design.md` §3.8 defers this
defect to here. §6 below is the merge guidance for that branch.

---

## 1. Evidence (production, 2026-07-24)

`scripts/ingest-awin.cjs` deduped the upsert payload by `product_id` alone. An
advertiser that lists one catalogue in two AWIN feeds gets a **different
`aw_product_id` per feed for the same `merchant_deep_link`**, so product_id
dedupe cannot collapse them and both rows publish.

| measure | value |
| --- | ---: |
| `merchant_url` groups with >1 visible row | **120** (240 rows) |
| …spanning more than one shop / `merchant_id` / `source` | 0 / 0 / 0 |
| …where the rows carry different `merchant_sku` | 0 |
| max rows in a group | 2 |
| groups where both rows are already hidden | 2 (244 rows total) |

Every group is Lyra Pet DE (#115425), whose feeds **102589** and **104303** each
kept 122 rows (`ops_metrics.awin_ingest_summary`). The collision is therefore
entirely *within one advertiser's duplicate feeds*; it is **not** cross-merchant
today. It is not merchant-specific by nature, though: Mediakos, BrillenPlatz,
VIDEOBUSTER and Polo Motorrad also list several active feeds and keep 0 rows
from the extras, so the same collision is one feed-content change away.

### 1.1 Which row was wrong

Within all 122 pairs `discount_percent` is **identical** and only the absolute
prices differ (avg 7.89%, max 12.19%). The rows are structurally separable:

| property | feed 102589 | feed 104303 |
| --- | --- | --- |
| price | cheaper — 122/122 | pricier — 122/122 |
| `feed_attrs.delivery_cost` | absent — 122/122 | `5.99` — 122/122 |
| `delivery_time` | 2–3 Werktage | 2–5 Werktage |

Seven live `lyra-pet.de` pages were fetched at 1.5 s/host and their
`itemprop="price"` compared against both rows:

| result | n |
| --- | ---: |
| live price equals the **cheaper** row, to the cent | **6** |
| live price equals the pricier row | **0** |
| live price matches neither (17.49 vs 19.99 / 22.42) | 1 |

The one miss is consistent with §1.2: both feeds are weeks stale, so a product
whose shop price has since moved matches neither. Feed 104303 was publishing a
price the shop does not charge on every page sampled.

> **Correction.** An earlier draft of this document claimed the live pages
> reconstructed the cheaper row "exactly once German VAT is applied". That was
> wrong. The extraction had matched the first `"price"` token in 613 KB of
> markup — a tracking payload, not the offer — and two different VAT rates were
> then fitted post-hoc to make the numbers land, with one outlier ignored. The
> correct extraction needs no VAT arithmetic at all. The conclusion survived;
> the stated evidence for it did not.

### 1.2 Both feeds are stale — freshness is not a free discriminator

`scripts/lib/coverage.cjs:163` computes `freshest = Math.min(...ages)` over an
advertiser's consumed feeds, and the 2026-07-24 watchdog digest (issue #27)
reports Lyra Pet DE as *"consumed feed stale: last imported 16 days ago"*.

So the **fresher** of 102589 / 104303 is already 16 days old, and the other is
older still. The per-feed dates cannot be read locally — `AWIN_FEED_URL` is a
GitHub Actions secret and no feed-list snapshot is persisted (`ops_metrics`
holds only `awin_feed_bytes`, `awin_fill_rates`, `awin_ingest_summary`).

This matters because it falsifies the assumption the first implementation rested
on — "both feeds regenerate nightly, so their import dates tie and the stable
rule decides". They do not tie, and a 4-day gap between two multi-week-old feeds
is not evidence about which price is right. See C-6.

---

## 2. Decisions

| # | Decision | Rationale |
| --- | --- | --- |
| C-1 | Collapse only rows sharing advertiser **+ `merchant_url` + a non-empty, equal `merchant_sku`**. | Sameness must be proven. Merchants legitimately put several products behind one URL (WooCommerce variant params). Merging variants would replace a known-uncertain price with a confidently-wrong one: strictly worse than the duplicate. Covers 122/122 real groups. |
| C-2 | **Price is not a criterion.** | "Cheapest wins" fits an accident — the losing feed happens to be the pricier one — and biases every future tie toward advertising *below* what the shop charges. |
| C-3 | Winner = first of: publication eligibility → freshest feed (gated, C-6) → lowest feed ID → lowest product_id. | Evidence outranks heuristics; provenance outranks arbitrary choice; the last two guarantee the winner never flaps. |
| C-4 | The loser is **hidden, not dropped** from the payload. | Dropping it leaves the wrong-priced row visible until the 3-day stale-hide fires. An explicit `hidden: true` stops it tonight, and keeping the row preserves history and allows recovery. |
| C-5 | Eligibility is a three-way tier, not a boolean "was verified". | `last_verify_outcome` is mostly *negative* vocabulary — `'gone'`, `'out-of-stock'`, `'no-discount'` are each written together with `hidden: true`, and only `'ok-live'` means publishing. See §3.1. |
| C-6 | Feed freshness discriminates **only** when at least one candidate feed is within `FRESH_WINDOW_DAYS` (14, matching the watchdog's `staleDays`). | Between two long-stale feeds "less stale" is not evidence of a correct price. Per §1.2 this criterion would otherwise have silently decided all 122 pages on an unmeasured input. |
| C-7 | Identity **under-groups** by design, and the misses are counted. | A missed collapse leaves today's duplicate (status quo); an over-eager one destroys a real product. `stats.refusedCollisions` keeps "found nothing" distinguishable from "refused to act". |

---

## 3. Design

`scripts/lib/dedupe-url.cjs` exposes one pure function:

```
planUrlCanonicalisation(rows, { feedMeta, existing, now })
  → { winners, losers: [{row, duplicateOf}], restores, stats }
```

The three row groups are **disjoint and total** — every input row appears in
exactly one — and each becomes its own PostgREST request, which needs uniform
keys per batch:

| group | payload keys added | meaning |
| --- | --- | --- |
| `winners` | `duplicate_of: null` | publishes; clears any stale marker |
| `losers` | `hidden: true`, `duplicate_of: <winner>` | demoted duplicate |
| `restores` | `hidden: false`, `duplicate_of: null` | was duplicate-hidden, now wins its page |

### 3.1 Publication eligibility (C-5)

```
0 = 'ok-live'            → proven live and publishable
1 = no verdict yet       → the feed is all we have
2 = negative verdict, or hidden by an owner that is not this rule
```

Tier 2 exists because two distinct failures share one shape. A row the verifier
404'd (`'gone'` + `hidden: true`) must not outrank a live rival: electing it
would demote the live row and leave the page publishing **nothing**, forever,
reproducibly on every subsequent run. Likewise a row hidden by the stale-hide,
TH-3, or the hidden-until-proven split — this rule holds no marker for those and
cannot un-hide them.

If the winner of a group is itself tier 2, **the group is skipped entirely**: no
duplicate is on display, so there is nothing to fix, and hiding a live row so a
dead one can "win" would be the same blackout by another route.

### 3.2 Recovery

`duplicate_of` is the marker that makes the hide reversible. A row carrying it
that later wins its page is un-hidden — unless the verifier has since judged it
negatively, or it has no discount (that row belongs to the hidden-until-proven
split, not to this rule). Without this, a merchant dropping one feed would strand
its survivor hidden forever, permanently reducing coverage.

### 3.3 Stability

Feed age is ranked by the **epoch-day number of the stamp**, not by an age
measured from `now`. Flooring two ages independently makes their difference flip
as the clock crosses each stamp's day boundary: two fixed stamps 2 h apart rank
one way at 01:30 and the other at 03:15, so the winner — and therefore `hidden`
and the sitemap — would churn between runs. A day number is a property of the
stamp alone, so the ordering is time-invariant. Stamps dated after today are
capped at today (clock skew is not freshness).

### 3.4 Schema and degradation

`duplicate_of text` is added to `public.deals` with a partial index. If the
migration has not run, `fetchExistingPrices` degrades on the 400 once, logs
loudly, and disables canonicalisation for that run rather than failing the
ingest — the posture the verifier already uses for its column sets.

No frontend change is needed: the site filters on `hidden = false`.

---

## 4. Verified

- 31 unit tests (`src/lib/ingest/dedupe-url.test.ts`); full suite 212 passing; typecheck clean.
- The **real 244 production rows** replayed through the rule, 20 assertions:
  120 groups collapse; the 2 already-dark pages are left untouched; winners are
  120/120 the live-matching row from feed 102589; no row lost or duplicated
  (244 in, 244 out); visible rows for those pages 240 → 120 with all 122 pages
  still covered; a second run is idempotent; dropping a product from the winning
  feed restores its survivor; and a 404'd winner hands its page to the live
  rival instead of going dark.

### 4.1 Residual risk

**Feed attribution is inferred.** No AWIN credentials exist locally, so the real
`Last Imported` for 102589 vs 104303 was never read. The mapping (feed_rank 1 =
102589 = the cheaper, no-`delivery_cost`, live-matching row) comes from flush
order corroborated by three independent 122/122 correlations. C-6 substantially
de-risks this — with both feeds >14 days stale the freshness criterion is off and
the stable feed-ID rule decides — but if 102589 is *not* the lower-priced feed,
the rule elects the wrong row on 120 pages.

### 4.2 The rollout gate, and why it did not work at first

The gate is a dry run:

```
node scripts/ingest-awin.cjs --no-upsert
```

An earlier revision of this change left `planUrlCanonicalisation` inside the
`if (DO_UPSERT)` block, so **that command would have printed nothing about
canonicalisation at all** — the gate was untestable by construction. The
dedupe, the existing-rows read, the preservation loop and the plan now run in
both modes; only the writes stay gated. `--explain-duplicates` adds the same
per-page detail to a real run.

The dry run prints the evidence that settles §4.1, not just a count:

```
[awin] url-canonicalisation: N duplicate rows would be hidden across M product pages…
[awin]   pages won per feed:   102589×M
[awin]   rows hidden per feed: 104303×N
[awin]   feed 102589 last imported 2026-07-08 03:00:00 (16 days ago)
[awin]   feed 104303 last imported … (… days ago)
[awin]   elected row vs the row it hides: cheaper in N, pricier in 0, equal in 0
                                      [stored prices — the values a real run elects between]
[awin]   <merchant_url>
[awin]     KEEP awin:… feed 102589 sku 04809-001 — 20.99 EUR (was 29.99, -30%)
[awin]     HIDE awin:… feed 104303 sku 04809-001 — 21.17 EUR (was 30.24, -30%)
```

**Do not proceed to `--upsert` unless** `pages won per feed` names the feed whose
prices match the shop, the per-feed `last imported` stamps are consistent with
§1.2, and `elected row … pricier in` reads 0. A non-zero `pricier` count means
the feed-provenance inference is backwards.

**Two outputs that are NOT an all-clear**, and must not be read as one:

```
[awin] url-canonicalisation: NOT RUN (duplicate_of column missing — run pnpm db:migrate).
       This is NOT an all-clear: duplicate product pages were never looked for.
```
The migration has not been applied — which is production's state until §3.4 ships.
An earlier revision printed the ordinary "found nothing" line here, an affirmative
false claim about the exact bug the run exists to detect.

```
[awin] … elected row vs the row it hides: …  [RAW FEED prices — NOT what a real run compares]
```
The stored prices could not be loaded (no credentials, or the read failed), so the
comparison is between feed prices rather than the values the rule actually elects
between. The gate is not satisfied by this run.

A dry run whose existing-rows read fails is **degraded, not fatal** — it keeps the
rest of its output. The same failure on `--upsert` stays fatal, because writing
without the stored prices would clobber verifier-owned values. `--upsert` with
missing Supabase credentials now fails at startup, before the ~300 MB download.

Verified by running the real script end-to-end against a local HTTPS feed
fixture reproducing the production shape: the duplicate pair collapsed to the
cheaper row, a same-URL pair with differing SKUs was refused (`1 url collisions
NOT collapsed`), `--limit` smoke runs still work, and the run reported
`dry-run, no writes`. Not covered by that harness: the per-feed evidence lines,
because duplicates injected through the combined cid feed carry no feed
identity — in production they arrive via the feed-list pass, which populates it.
The credentialed dry-run path (`canRead = true`) is also unexercised locally,
since no Supabase service-role key is available here.

---

## 5. Accepted trade-offs

| item | why it is left as-is |
| --- | --- |
| A positive verdict has no recency bound: a six-month-old `'ok-live'` outranks a feed imported today. | Once eligibility is tiered correctly this is merely conservative, and `last_verified` windowing is the sibling design's D-4 to define. |
| `canonicalUrlKey` under-groups: query-param order, `http` vs `https` and path case all escape it. | Under-grouping preserves the status quo; over-grouping destroys a real product. Counted by `refusedCollisions`. |
| The final tiebreak compares `product_id` as a string, so on a total tie legacy `awin:<digits>` rows beat v2 `awin:<CC>:adv…` rows. | It only fires when every signal above is equal; a stable arbitrary choice is the point. |
| `feedAgeDays` returns null for several plausible stamp formats. | Shared verbatim with the watchdog; null degrades symmetrically to "feed ID decides", and C-6 already assumes freshness is often unusable. |

---

## 6. Merge guidance for the feed-freshness branch

Both changes edit the same upsert path. They are additive, but four points
conflict:

1. **`fetchExistingPrices` select.** This branch adds
   `hidden,duplicate_of,last_verify_outcome`; feed-freshness §3.2 adds
   `last_verified,last_updated` + CHANGE_FIELDS. Union the lists, keep one
   400-degrade ladder.
2. **The upsert-prep block.** The flush loop now iterates **four** groups
   (`updates`, `hiddenNew`, `dupLosers`, `dupRestores`). §3.3's `last_updated`
   resolution and §3.6's `last_seen_in_feed` / `feed_last_imported` stamping must
   be applied to all four, uniformly.
3. **§3.6 `feedImportedByAdvertiser` is redundant.** `feedMeta` already carries
   `{feedId, lastImported}` per product_id, which is strictly finer-grained.
4. **Ordering matters for §3.2.** Price preservation currently runs *before*
   canonicalisation, so electing a feed chooses which already-stored price
   survives rather than importing a fresher one. Once §3.2 makes preservation
   verification-gated, the elected row will actually track its feed — which is
   what makes C-6's freshness criterion meaningful in future.

Composition is favourable: this branch elects feed 102589's row, and §3.2
un-freezes feed prices for never-verified rows — which all 244 of these are.
