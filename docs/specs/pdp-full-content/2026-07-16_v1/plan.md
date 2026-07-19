# Plan: PDP Full-Content Pipeline — Phase 2 (implementation plan)

**Version:** v1.1 (2026-07-19) — revised after adversarial review (coverage + feasibility, workflow `wf_c858f9b4-6e7`) and **re-scouted against the current tree**: commits `658eb5e` (PGRST102 fix — Stage 0.2 became verification-only), `aba8a30` (coverage watchdog exists in `scripts/lib/coverage.cjs` — Stage 3.2 extends, not builds), `38955e1` (per-fid acquisition of all active German feeds — narrows FR-2.3's gap) landed since the spec's evidence snapshot.
**Spec:** `spec.md` v1.2 (signed off 2026-07-19). **Phase 3 tasks:** `todo.md` after this plan is reviewed.
**Harness discipline:** every stage **owns encoding its matrix ECs into the FR-0 harness** — "stage done" = code merged AND its ECs implemented AND green after the soak (below). Run-dependent ECs (EC-1/2/6/8/9/11/13) only go green after ≥1–2 upstream cron cycles post-merge — each stage ends with a **post-merge soak checkpoint**, not just a merge.

## Stage 0 — Un-gated hardening (parallel small PRs; re-scoped to current tree)

| # | Work | FRs / ECs | Notes |
|---|---|---|---|
| 0.1 | Deadline wiring: verify-awin.yml passes `--deadline` (script already has it + `--max-minutes` 120 default — reconcile the two in the budget: deadline ≤ timeout − enrich_deadline − snapshot − indexnow − flush); `enrich-galleries.cjs` **gains** `--deadline`; per-step failure policy. IndexNow: remove `continue-on-error` from **both** invocation sites (verify-awin.yml AND ingest-awin.yml) and add bounded retry/backoff for transient 429/5xx in `indexnow-submit.cjs` (else one hiccup flaps EC-8); fix its stale "stale-hides → 404 refresh" comment (M2 forbids 404s); **interim FR-3.6 mitigation**: exclude hidden-since-insert (never-published) slugs from submission now — the spec's Never-boundary is violated by every scheduled run until 5.3 otherwise | FR-3.1, FR-3.6(interim) / EC-8 | Files: verify-awin.yml, ingest-awin.yml, enrich-galleries.cjs, indexnow-submit.cjs |
| 0.2 | **Verification only:** confirm `658eb5e` (per-signature batching) is deployed upstream and the next scheduled programmes-sync succeeds; reopen diagnosis only if it still fails | FR-2.4 / EC-7 | Fix already landed — do not re-implement |
| 0.3 | **Upstream ops step (not a PR):** `ops_metrics` already in schema.sql:347 — dispatch Apply-DB-schema upstream, verify rows land. Sequence **before** 0.4 (which gates that workflow's fork dispatch). Risk #1 amended: this is schema application #1 of 2 | FR-2.5 / EC-7 | |
| 0.4 | Owner-gate **all** secret-dependent jobs (schedules AND push-triggered db-migrate AND `thin-loop-drill.yml` — extend EC-10's pinned workflow list to include it, a harness-side pin correction) | FR-3.3 / EC-10 | Fork loses workflow_dispatch (documented) |
| 0.5 | `refresh-deals.mts` stale comment + sequencing decision (chain-or-document) | FR-3.8 / EC-23 | |
| 0.6 | **noindex on hidden PDPs** via generateMetadata robots (visible PDPs never noindex) | Q-1 / EC-24 | Highest-leverage SEO fix; ship first |

## Stage 1 — Schema + harness skeleton

| # | Work | FRs / ECs | Notes |
|---|---|---|---|
| 1.1 | **Single migration PR** (schema application #2, the last): `feed_attrs jsonb`, `last_verified timestamptz`, rating + provenance fields, `fetch_outcomes` persistence, capture-provenance (verify run-id), **`first_published_at timestamptz`** (set on first `hidden=false` transition — the never-published/delisted discriminator FR-3.6 needs; nothing else can express it) | feeds FR-1.x/2.x/3.2/3.6 | ⚠ Ask-first + A-2 coordination |
| 1.2 | FR-0 harness skeleton: acceptance-mode env handling, EC registry, pinned-grammar parsers, RED stubs for all 24 ECs; immediately-encodable now: EC-24, EC-8 file assertions, **TH-1..TH-3** invariant SQL (TH-4 needs the Stage-3.2 feed-list artifact — encoding it against stale `affiliate_programmes` is exactly what the spec forbids) | FR-0 | RED is the expected state |

## Stage 2 — W1: unified capture-at-verify (the core)

| # | Work | FRs / ECs |
|---|---|---|
| 2.1 | Extractor library `scripts/lib/extractors/`: shopify-js → shopify-json → page JSON-LD → OG; `priceOk` currency-guard split; market-path variants (incl. Renogy `/de/` 404 quirk); fixtures + vitest. **Rating decision (recorded):** fallback-path-only — no extra per-row page-HTML fetch on the Shopify fast path (would ~double the largest host's load); page-level rating arrives via the JSON-LD/OG fallbacks and the Stage-6 Renogy-class page extractors, and the EC-17/FR-4.6 cohort is correspondingly partial until then | FR-1.3 |
| 2.2 | `verify-awin.cjs` write-path redesign — **three classes**, not a payload tweak: liveness PATCH (price/stock/visibility → bumps `last_updated`; `applyPatch`'s unconditional injection at line 237 restructured), content-only PATCH (gallery/description_html/attrs/rating → **never** bumps), liveness touch (**verified-alive visible rows only** — the hidden-stays-hidden `queueTouch` bumps at lines 344-346/360-361 are REMOVED per the M2 amendment); `last_verified` written on every fetch outcome (content-class); **ingest stale-hide reconciled** with the narrowed heartbeat (hidden rows no longer heartbeat — stale-hide keys on `last_verified` or exempts hidden rows); same-PATCH capture for every fetched row; stalest-first ordering (`last_verified.asc.nullsfirst,product_id.asc`); fetch outcomes + provenance persisted; `flushPatches` retry + `committed=/attempted=` grammar; **graceful degrade** when 1.1 columns are missing (mirror the existing captureHtml pattern) + hard checkpoint: 1.1 confirmed applied on prod before this merges; chaos coverage: invalid-key smoke (explicit child env) + mid-run-kill drill via extended `thin-loop-drill.yml` | FR-1.1, FR-1.2, FR-3.2, FR-3.4 / EC-1, EC-2, EC-9, EC-11(part), EC-21 |
| 2.3 | `snapshot-prices.cjs` covers hidden rows; `enrich-galleries.cjs` demoted to bounded backfill | FR-1.5 / EC-4 |
| 2.4 | `upsertDeals` keep-richer merge — ⚠ NOT naive key omission (heterogeneous keys in one bulk upsert = PGRST102, the bug class this repo hit twice): per-signature batching or read-merge-write. Plus the **FR-3.7 all-writers compliance audit** (ingest, snapshot, refresh-deals, enrich: no `status`/`expired_at`/`content_changed_at`; write-class conformance); M2 watermark/expiry-tripwire clause recorded as **explicit deferral to M2 landing** | FR-1.6, FR-3.7 / EC-21, EC-22 |

Soak: ≥2 upstream cron cycles; EC-9 needs a capacity check — full eligible set (≈6k rows incl. hidden) must complete within 2 deadline-bounded daily runs.

## Stage 3 — W2: acquisition completeness

| # | Work | FRs / ECs |
|---|---|---|
| 3.1 | All-column parsing (both formats) → `feed_attrs`; per-advertiser × per-column fill-rate report (pinned grammar, ops_metrics keys) | FR-2.1 / EC-5 |
| 3.2 | **Extend, don't rebuild:** move/invoke the existing `scripts/lib/coverage.cjs` watchdog (`aba8a30`) from the named `coverage-watchdog.yml`; add TH-4, ROCKBROS legacy-freshness tripwire (Q-4), remotePatterns image-host tripwire, `ingested\|excluded(reason)` grammar, Q-6 GitHub-issue alerting (incl. FR-3.5 36h staleness alert + monthly `alert-test` fire); subordinate the existing digest path to the issue channel (one source of truth) | FR-2.2, FR-3.5 / EC-6, EC-12 |
| 3.3 | Language/currency policy table — **path pinned now:** `scripts/lib/feed-policy.json` (38955e1 already acquires all active German feeds; the policy table records the remaining exclusions: non-German, non-EUR) | FR-2.3 / EC-6 |
| 3.4 | Loud no-ops on the secrets-bearing repo (purge-alerts/db-migrate/cost-guardrail exit non-zero when secrets missing) | FR-3.4 / EC-11(rest) |

## Stage 4 — W4: rendering

| # | Work | FRs / ECs |
|---|---|---|
| 4.1 | `data-block` markers everywhere; new conditional blocks (attrs, shipping, condition, energy, variants); description per FR-4.2-as-amended (never suppress); rating block with provenance (Q-5); **FR-4.5 explicitly:** thumbnails + More-images for `gallery≥2`, and the `<img>`-coupling **respecified against sanitizer-surviving imgs** (raw-string check at page.tsx:337 replaced) — EC-14's desc-html-with-img sample exercises it | FR-4.1, FR-4.2, FR-4.5, FR-4.6 / EC-14, EC-15 |
| 4.2 | Brand census → mapping table — **path pinned now:** `scripts/lib/brand-map.json` → ingest normalization + JSON-LD brand | FR-4.3 / EC-16 |
| 4.3 | Remove `extractTrailingModelCode` (Q-7); PriceHeatBar two-point fallback — **decision recorded: relabel as price-range, not history** (removal stays open as an alternative if relabeling proves confusing) | FR-4.4 / EC-17 clause |

## Stage 5 — W5: emission

| # | Work | FRs / ECs |
|---|---|---|
| 5.1 | JSON-LD enrichment (image array deduped-unproxied, `additionalProperty`, `itemCondition`, `OfferShippingDetails`, `sku`, aggregateRating-with-provenance, model-from-DB-only) | FR-5.1 / EC-17 |
| 5.2 | `/deal/<slug>/md` route + `llms.txt` + discovery index (sitemap-linked); hidden rows per Q-1 | FR-5.2 / EC-18 |
| 5.3 | Richness shared module (harness + `check-budgets` strict + upstream scheduled workflow); **full** FR-3.6 never-published/delisted split using `first_published_at` (0.1's interim filter graduates to submit-time enforcement + logging on both workflows) | FR-5.3, FR-3.6 / EC-13, EC-19 |

## Stage 6 — Gated expansions

| # | Work | FRs / ECs |
|---|---|---|
| 6.1 | Renogy section extractor (Q-3) into the Stage-2 registry; page-HTML fetches also capture rating (closing 2.1's partial-rating cohort for these merchants) | FR-1.4 / EC-3 |
| 6.2 | Price-drop promotion P1-7 (Q-2): baseline over FR-1.5 snapshots (needs ≥N days hidden-row history), guardrails, promotes via **liveness** write; sets `first_published_at` on first promotion | Q-2 / EC-24 unaffected (indexation never waits for baselines) |

## EC → stage matrix

Stage 0: EC-7(part), EC-8, EC-10, EC-23, EC-24 · Stage 1: harness RED baseline + EC-24/EC-8(file)/TH-1..3 encodable · Stage 2: EC-1, EC-2, EC-4, EC-9, EC-11(part), EC-21, EC-22 · Stage 3: EC-5, EC-6, EC-7(rest), EC-11(rest), EC-12 · Stage 4: EC-14, EC-15, EC-16 · Stage 5: EC-13, EC-17, EC-18, EC-19 · Stage 6: EC-3 · Final: EC-20 + full acceptance on upstream. Each stage implements its own ECs in the harness; run-dependent ECs green only after the stage's soak.

## Cross-cutting risks

1. **Shared Supabase surface (A-2):** exactly two schema applications (0.3 ops re-apply, 1.1 migration); both via the workflow; lanes notified.
2. **Parallel lanes are landing code** (demonstrated: 658eb5e/aba8a30/38955e1 overtook the first draft of this plan): **re-scout the tree at every stage start**; stage rows are scoped intents, not frozen diffs.
3. **Upstream execution:** 0.3/0.4/3.2/5.3 take effect on `oleg1981-sudo/DealRadar`; acceptance runs + secrets live there; enumerate user-side steps per PR.
4. **Sweep capacity:** capture payloads + ~6k rows incl. hidden; deadline+rotation is the safety net; EC-9 soak includes the capacity calculation; rating stays fallback-only to protect the budget.
5. **Rating syndication (Q-5):** provenance field + Search Console watch after EC-17 green; retreat = drop markup, keep visible block.
6. **M2 landing:** write-class amendment recorded; EC-21 + FR-3.7 audit keep all writers compliant so the M2 migration finds no violators; watermark/tripwire deferral documented in 2.4.
