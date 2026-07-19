# Spec: PDP Full-Content Pipeline (fetch everything, render everything, prove it stays that way)

**Status:** v1.2 — **SIGNED OFF 2026-07-19**: Q-1…Q-9 all resolved (§10); Assumptions A-1…A-6 stand uncorrected. Phase 2 (plan) authorized per §12.
**Date:** 2026-07-16 · **Evidence base:** `audit/2026-07-16_pdp-richness-root-cause/findings.md` (adversarially verified; causal model empirically confirmed by run 29485121663: 5,987 deals verified in 98.6 min, 855 galleries enriched, reference deal 1→6 images, description_html still NULL as predicted).
**v1.1 changelog:** revised after a 3-reviewer adversarial pass (verifiability / conflicts / traceability — findings in workflow `wf_93db646c-4f3`). Key changes: harness acceptance mode (no SKIP-as-PASS), write-class split to protect M2's expiry model (Q-9), Phase-2/3 outputs moved INSIDE this spec dir (never `tasks/plan.md` — that is the restored M2 plan), watchdog re-keyed to the feed list (affiliate_programmes is stale), mechanism-discriminating ECs (the outage healed mid-audit; status-quo green must not pass for the new mechanism), stable `data-block` markers, persisted fetch-outcome/block-list artifact, thresholds renamed TH-* (v3.1 `T-*` collision), IndexNow never-published/delisted split, currency-guard preserved in the extractor chain, `--upsert` (not `--apply`) for ingest.
**Must not violate:** M2 URL/slug locked decisions (`docs/specs/url-structure/2026-07-08_v2/spec.md` — writer contract, countried IDs, freeze-after-mint, no-unexpected-404/410-by-policy) and v3.1 ground truth (`docs/ground_source_of_truth/2026-07-09_v3.1/`). §13 carries the crosswalk.

---

## 1. Objective

Every deal PDP must render **all product content that verifiably exists** for that product — multi-image gallery, rich description, real specifications/attributes, delivery/condition data — sourced from (a) the complete AWIN feed column set and (b) merchant-page capture, and must emit the same facts programmatically (JSON-LD, agent-readable markdown) for SEO/AEO/GEO. The pipeline must be **structurally incapable of silently regressing** to thin PDPs.

**Success =** the acceptance harness (§8, FR-0) exits 0 **with every in-scope EC executed** (SKIPs allowed only for Q-gated scope reductions, each with a pinned reason). Baselines are refreshed at sign-off — the 2026-07-16 outage healed mid-audit, so W1 ECs discriminate the *mechanism* (same-PATCH capture, provenance-stamped), not the healed status quo.

Verified constraints (do not re-litigate; see audit):
- Google-format feeds carry 1 image and no discount signal; their rich columns are advertiser-empty. Feed alone can never produce parity → merchant-page capture is structural.
- Renogy-class merchants keep rich content in page sections (Shopify product JSON `description` empty) → extractor fallback chain (Q-3).
- Prod already has `trigger_record_price_history` (AFTER INSERT OR UPDATE OF sale_price, hidden rows included) — FR-1.5 extends *daily snapshot* coverage, the trigger is the existing baseline.
- FR-PDP-6 (no fabricated content) remains absolute.

## 2. Tech stack

Next.js App Router (force-dynamic PDPs) · Supabase Postgres (PostgREST writes from `scripts/*.cjs`) · GitHub Actions (**upstream `oleg1981-sudo/DealRadar` holds secrets and is where acceptance runs execute**; fork `Manzela/DealRadar` must not run secret-dependent jobs) · Netlify (deploy + `netlify/functions/refresh-deals.mts`, covered by FR-3.8) · vitest · Node ≥20.

## 3. Commands

```
Install:    pnpm install
Test:       pnpm test                  # vitest run
Typecheck:  pnpm typecheck
Lint:       pnpm lint
Build:      pnpm build
Budgets:    pnpm check:budgets         # strict mode per FR-5.3 (UNMEASURED = failure in acceptance)
DB migrate: pnpm db:migrate            # via Apply DB schema workflow in CI
Pipeline (dry-run by default; write flags differ — DO NOT assume --apply):
  node scripts/ingest-awin.cjs [--upsert]
  node scripts/verify-awin.cjs [--apply] [--max-minutes N] [--limit N]
  node scripts/enrich-galleries.cjs [--apply] [--max-minutes N] [--limit N]   # --max-minutes added by FR-3.1 (re-pinned from --deadline 2026-07-19)
Spec harness (FR-0):
  node scripts/verify-spec-pdp-content.mjs                 # acceptance mode (default in CI): requires
      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_TOKEN, SITE_URL — a missing var FAILs the ECs needing it
  node scripts/verify-spec-pdp-content.mjs --allow-skip    # local iteration only; prints the skip list; still exits non-zero
```

## 4. Project structure (touched by this spec)

```
scripts/ingest-awin.cjs              → acquisition + normalization (both formats)
scripts/lib/enhanced-feed.cjs        → Google-format normalizer (W2)
scripts/verify-awin.cjs              → live verification + unified content capture (W1)
scripts/lib/extractors/              → NEW: platform/merchant extractors, fallback chain (W1)
scripts/enrich-galleries.cjs         → demoted to bounded backfill (W1), gains --max-minutes (W3)
scripts/verify-spec-pdp-content.mjs  → NEW: exit-criteria harness (FR-0)
src/app/[locale]/deal/[slug]/        → PDP blocks + stable data-block markers (W4) + JSON-LD (W5)
src/app/[locale]/deal/[slug]/md/     → NEW: route handler for the agent markdown surface (W5)
src/lib/utils/product-details.ts     → gallery/attr selectors
supabase/schema.sql                  → feed_attrs jsonb, last_verified, capture provenance, fetch_outcomes (W1–W3), via migration
.github/workflows/                   → verify-awin.yml, ingest-awin.yml, NEW coverage-watchdog.yml (W2/W3)
docs/specs/pdp-full-content/2026-07-16_v1/  → this spec + its plan.md/todo.md (Phase 2/3 — NEVER tasks/plan.md, which is the M2 plan)
```

## 5. Code style

Match repo idiom: plain-CJS pipeline scripts with header contract + usage, dry-run default, per-host pacing, PostgREST via fetch, pure fixture-tested normalizers:

```js
// scripts/lib/extractors/shopify.cjs — product JSON → {images[], descriptionHtml, attrs{}, priceOk}
// Chain position 1 of 4 (js → json → jsonld → og). priceOk=true ONLY for market-verified
// responses (currency guard preserved verbatim from verify-awin.cjs liveState) — price/compareAt
// may be read ONLY when priceOk; content (images/description/attrs) from any fallback.
// Never throws; returns { error } so callers pace/abandon per host.
async function extractShopify(merchantUrl, { fetchImpl = fetch } = {}) { /* … */ }
```

Render side: conditional blocks return `null` when data absent; every block carries a stable machine marker `data-block="gallery|more-images|description|attrs|shipping|condition|energy|variants|specs-id|rating"` (FR-4.1) so ECs never guess at markup.

## 6. Testing strategy

- **Unit (vitest):** normalizers (all columns → `feed_attrs`), extractor chain against recorded fixtures (Shopify js/json, JSON-LD page, OG-only, Renogy sections; market-path variants incl. the de.renogy.com `/de/…` 404 quirk), `flushPatches` retry/committed-counting against a mocked PostgREST (fail-then-succeed), attr/JSON-LD renderers with present/absent data.
- **Integration:** dry-run pipeline passes asserting shape; budget script in strict mode.
- **Chaos (CI-only, not the read-only harness):** drill that kills verify mid-run and asserts downstream steps still execute; invalid-key smoke that passes the bogus key **explicitly in the child env** (never inherited — `loadEnvLocal()` fills unset vars from `.env.local`) and expects fast non-zero exit.
- **Post-completion:** FR-0 harness (§8). No EC is manual judgment; every marker/grammar it parses is pinned in the FR that produces it.

## 7. Requirements

Traceability: each FR cites the audit finding it neutralizes. §13 maps workstreams to v3.1 registry territory.

### W1 — Unified capture-at-verify (audit causes 2, 3; latent H5)
- **FR-1.1** `verify-awin.cjs` keeps the `images[]` of the product payload it already fetches and writes `gallery` (unproxied, deduped, keep-richer, cap 6) **in the same PATCH** as price/hidden/description_html, stamping a **capture provenance** (`verify run-id` + outcome `captured|merchant-has-N|blocked|unreachable`) per row (new column or `fetch_outcomes` row). `enrich-galleries.cjs` becomes bounded backfill (gains `--max-minutes`), expected sweep ≈ 0 in steady state.
- **FR-1.2** Content capture (gallery + description_html + attrs) applies to **every fetched row**, hidden included — decoupled from the discount decision. **Write-class split (Q-9, M2-critical):** content-only patches MUST NOT send `last_updated`; only liveness-bearing writes (price/availability/hidden changes) bump it. Which fields count as liveness signals is recorded at sign-off as an M2 writer-contract amendment.
- **FR-1.3** Extractor fallback chain per merchant URL: Shopify `.js` → `.json` → page `application/ld+json` Product → OpenGraph; market-path variants in order. **Currency guard preserved verbatim:** price/compareAt only from market-verified responses (`priceOk`); content from any fallback. Per-host pacing ≥1s, abandon-after-N-blocks; **fetch outcomes persisted** (host, status, count, last_seen) — the machine-readable block-list ECs reference.
- **FR-1.4** *(Q-3-gated)* Per-merchant extractor registry with a Renogy section-content extractor. If Q-3 = no: the Renogy floor in TH-2 is dropped and ~242 title-only Renogy PDPs are a **recorded exclusion**, not a FAIL.
- **FR-1.5** `snapshot-prices.cjs` drops the `hidden=false` filter so daily snapshots cover all rows (`trigger_record_price_history` already covers insert/price-change incl. hidden — this extends the once-per-UTC-day overwrite semantics to hidden rows). Price-drop promotion itself is Q-2 (v3.1 gate).
- **FR-1.6** `upsertDeals`/`toRow` (`src/lib/db/deals.repo.ts`) adopts keep-richer merge for `gallery`/`description` (audit §3: `/api/refresh` would clobber enrichment for future providers; description_html is already protected).

### W2 — Acquisition completeness (audit cause 1; coverage holes)
- **FR-2.1** Both normalizers parse **all** feed columns; non-empty extras land in `deals.feed_attrs jsonb`. Per-advertiser × per-column fill-rate report emitted every ingest run with pinned grammar `[ingest] fill-rate adv=<id> col=<name> pct=<n>` (log + `ops_metrics` keys). Applies to the legacy ~70-column feed too.
- **FR-2.2** Coverage watchdog (**named workflow: `.github/workflows/coverage-watchdog.yml`**) reconciles against the **acquired AWIN feed list** (ground truth — `affiliate_programmes` is stale: Hollyland/Autofull sit at `notjoined` there; it remains an enrichment join only): every downloadable feed for the account appears in the latest run log as `ingested|excluded(<reason>)`; any advertiser at 0 products without a recorded exclusion alerts. Also alerts when any `image_url`/`gallery` host is **not covered by `next.config.mjs` remotePatterns** (non-Shopify tripwire, replaces A-6's silent deferral).
- **FR-2.3** Language/currency scope becomes an explicit policy table (`docs/specs/pdp-full-content/2026-07-16_v1/feed-policy.md` or a repo JSON, path frozen at sign-off) — zero silent drops.
- **FR-2.4** programmes-sync PGRST102 fixed (homogeneous bulk-upsert keys).
- **FR-2.5** `ops_metrics` migration applied to prod.

### W3 — Non-recurrence guarantees (audit §2 ops; C9a/C9b)
- **FR-3.1** *(amended 2026-07-19: budget flag re-pinned from `--deadline <epoch-ms>` to `--max-minutes <n>` — same graceful-stop semantics, relative minutes are simpler to wire in YAML and verify-awin.cjs already ships both flags)* `verify-awin.yml`: verify gets `--max-minutes`, enrich gets `--max-minutes`, margins budgeted so `verify_budget + enrich_budget + snapshot + indexnow + flush < timeout-minutes`; step-failure policy explicit per step (post-verify steps `!cancelled()`); **`continue-on-error` removed from the IndexNow steps in BOTH verify-awin.yml and ingest-awin.yml**, with bounded retries inside the submit script.
- **FR-3.2** Stalest-first sweep: `deals.last_verified timestamptz` written on every verify touch (content-only class per FR-1.2); fetch ordered `last_verified.asc.nullsfirst,product_id.asc` (unique tiebreaker — Range pagination is otherwise nondeterministic over the NULL tie-group).
- **FR-3.3** Fork neutralized for **all secret-dependent jobs regardless of trigger** (schedules AND push-triggered `db-migrate.yml`): `if: github.repository_owner == 'oleg1981-sudo'` at job level (documented consequence: `workflow_dispatch` also disabled on fork).
- **FR-3.4** Loud failures: on the secrets-bearing repo, missing-secret no-ops exit non-zero (purge-alerts / db-migrate / cost-guardrail included); `flushPatches` failures counted, retried once, reported with pinned grammar `[verify] patches committed=<n> attempted=<n>`.
- **FR-3.5** Enrichment freshness alert: no successful capture cycle within **36h** (resilient to the observed ~2.5h GitHub cron lateness) → alert via the Q-6 channel; the alert path itself emits a machine artifact (per Q-6 resolution, e.g. labeled GitHub issue from a successful workflow run).
- **FR-3.6** IndexNow split: **never-published** URLs (hidden since insert) are never submitted; **delisted** previously-published URLs are submitted once under the Q-1 policy so engines drop them. The submit script is the enforcement point: re-reads visibility per candidate at submit time, logs `submitted=<n> excluded_never_published=<m>` + a slug sample, exits non-zero if a never-published slug reaches the payload.
- **FR-3.7** Writer contract (M2, binding, as amended by Q-9): liveness-bearing writes send fresh `last_updated`; content-only writes do not; no writer ever sends `status`/`expired_at`/`content_changed_at`; run-id watermark + >10% expiry tripwire + failure alerting carried forward when M2 lifecycle lands.
- **FR-3.8** `netlify/functions/refresh-deals.mts`: stale "every 15 minutes" comment fixed; sequencing made real — either chained off pipeline completion (repository_dispatch / final verify step) or its ordering assumption documented as best-effort with the alert-reconciliation tolerating unverified prices.

### W4 — Render everything that exists (audit cause 4)
- **FR-4.1** New conditional PDP blocks (render **only when data exists**), each with a stable `data-block` marker (§5): attributes/spec table (from `feed_attrs` + captured attrs); delivery/shipping; condition; energy label; variant/family links (`item_group_id`).
- **FR-4.2** *(reversed 2026-07-19 per Q-8/TH-3)* An existing description **always renders** — never suppress, even when `trim(description) == trim(product_name)` (title-echo). The remedy for title-echo descriptions is better capture (FR-1.2/FR-1.4), not suppression; the beyond-title-echo share is a reported metric.
- **FR-4.3** Brand normalization at ingest via a **census-seeded mapping table** (committed file, path frozen at sign-off) covering every distinct `(shop_name, brand)` pair — the census shows suffixes (`ROCKBROS-EU`), case variants (`sunshare`), typos (`ROCKBORS`), and full-country forms (`Sunshare Deutschland`) that a token heuristic misses; explicit exceptions list included. JSON-LD `brand` uses the normalized value.
- **FR-4.4** FR-PDP-6 re-affirmed. In scope of the no-fabrication audit: the JSON-LD `model` heuristic (Q-7) **and** the PriceHeatBar two-point fallback (fabricates a "series" from compare-at on rows without history — relabel as range-not-history, remove, or record as non-goal at sign-off).
- **FR-4.5** Enriched galleries render: thumbnails + "More images" for `gallery ≥ 2`. Known coupling stated: the More-images section is suppressed when `description_html` contains `<img` (raw-string check) — either keep as a documented exception or respecify against sanitizer-surviving imgs; EC-14 includes a desc-html-with-img sample either way.
- **FR-4.6** *(Q-5-gated)* Visible rating/reviews block when legitimately captured; otherwise the parity gap is a recorded exclusion.

### W5 — SEO / AEO / GEO emission
- **FR-5.1** JSON-LD Product enriched from real data only: full `image` array (deduped-unproxied set), `additionalProperty` from attrs, `itemCondition`, `OfferShippingDetails` when known, `sku` everywhere, gtin/mpn preserved; `aggregateRating` only with a defined provenance field (Q-5; if omit → absent everywhere); `model` emitted only from DB fields if Q-7 = remove-heuristic.
- **FR-5.2** Agent surface: `GET /<locale>/deal/<slug>/md` (nested route handler — a `.md` suffix cannot coexist with the `[slug]` page route) returning `text/markdown` with pinned field labels (`Price:`, `Availability:`, fixed disclosure sentence, attrs, price-history summary); **discoverable**: `llms.txt` at root indexes the surface and the sitemap (or an llms.txt-linked index) enumerates it — agents can walk the graph, not just probe known slugs. Hidden-row behavior follows Q-1.
- **FR-5.3** Richness budgets: the §8 threshold computations live in **one shared module** consumed by both the harness and `check-budgets.mjs`; strict mode (UNMEASURED = non-zero exit) used in acceptance and in a **named upstream scheduled workflow** (fork PRs can't see DB secrets — CI on PRs runs only secret-free checks); thresholds env-overridable (`RICHNESS_TH1_PCT=101` → expected failure replaces the file-mutation test).

### FR-0 — Verification harness
`scripts/verify-spec-pdp-content.mjs`: read-only. **Acceptance mode (default):** requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GH_TOKEN, SITE_URL; an EC that cannot execute FAILs (exit non-zero) — SKIP exists only for Q-gated scope reductions with whitelisted pinned reasons, and any SKIP is printed. `--allow-skip` (local iteration) still exits non-zero. Missing schema objects (e.g. `last_verified` absent) = FAIL with reason, never a crash or silent pass. Percentage ECs enforce **denominator floors** (FAIL if denominator < floor; floors set with TH-* at sign-off). Acceptance runs execute where secrets exist (upstream), never on the fork.

## 8. Success criteria — exit criteria

Thresholds **TH-1…TH-4** (renamed from T-* to avoid v3.1 task-ID collision; **semantics set by the user 2026-07-19 — completeness invariants, not richness percentages**): **TH-1** every visible PDP has ≥1 product image — a single image is a complete PDP; zero images = broken = fail (gate: 0 visible deals with empty gallery AND no image_url). **TH-2** every visible PDP has a non-empty title — absent title = fail (gate: 0 visible deals with empty/missing product_name). **TH-3** every visible PDP renders a visible description — any description passes; absent = fail (gate: 0 visible deals with no description data; consequence: FR-4.2 suppression reversed — an existing description always renders). **TH-4** advertisers at 0 products with no recorded exclusion: 0. All four are 0-count invariants with a catalog non-empty floor. Richness metrics (multi-image share, capture-success rates, beyond-title-echo description share) are **reported by the harness, non-gating**; capture *mechanisms* remain enforced by the mechanism clauses in EC-1/EC-2/EC-3/EC-21.

Global EC rules: "latest run" always means **latest completed scheduled non-dry-run run on `oleg1981-sudo/DealRadar`, created within the last 48h** (recency guards against dead schedules); log assertions parse **pinned grammars** defined in the producing FR; HTTP probes select rows by **pinned SQL** (stable ordering) and locate content by `data-block` markers with **positive controls** for every absence check; `array_length` filters are computed client-side (PostgREST can't express them); W1 ECs are **mechanism-discriminating** (provenance run-ids, enrich sweep ≈ 0), not status-quo-green.

| EC | Verifies | Check (encoded in FR-0 harness) |
|---|---|---|
| EC-1 | FR-1.1/1.3, TH-1 | **TH-1 invariant:** 0 visible deals with no image (empty gallery AND null/empty image_url; catalog non-empty floor). **Mechanism (gating):** rows first verified post-implementation carry gallery written by the **same verify run-id**; latest enrich log sweep ≤ small backfill bound. **Reported (non-gating):** capture-success rate vs persisted fetch outcomes, multi-image share |
| EC-2 | FR-1.2, TH-2/TH-3 | **Invariants:** 0 visible deals with empty product_name; 0 visible deals with no description data (`description` empty AND `description_html` null). **Mechanism (gating):** >0 hidden rows with `description_html` (today exactly 0 — proves capture decoupled from the discount branch). **Reported:** hidden-row capture rate on successfully-fetched Shopify rows |
| EC-3 | FR-1.4 (Q-3 approved) | **Mechanism:** extractor registry ships with the Renogy section extractor; latest capture run log shows Renogy section-captures > 0 (pinned grammar); HTTP: a qualifying visible Renogy deal renders `data-block="description"` and ≥2 distinct gallery URLs. **Reported:** share of Renogy rows with description beyond title-echo |
| EC-4 | FR-1.5 | Latest snapshot run log: covered-row count == total deals count (pinned grammar); SQL guard: 0 deals older than 48h lacking any price_history row in 48h (client-side anti-join; non-empty floor); note: one row per UTC day (overwrite semantics) |
| EC-5 | FR-2.1 | `feed_attrs` exists; fill-rate grammar present in latest ingest log for **both** formats (v2 predicate pinned: `product_id ~ '^awin:[A-Z]{2}:adv'`; legacy: `'^awin:[0-9]+$'`); attr-bearing rows > 0 **or** the fill-rate report proves all rich columns empty (captured attrs count toward the check) |
| EC-6 | FR-2.2/2.3 | Ground truth = feed list acquired by the watchdog run itself: every feed appears as `ingested|excluded(<reason>)` in the latest completed `coverage-watchdog.yml` run (≤48h); TH-4 via SQL join against per-advertiser deal counts; remotePatterns tripwire clause evaluated (0 uncovered image hosts) |
| EC-7 | FR-2.4/2.5 | Latest **scheduled** programmes-sync run ≤48h old AND success; PostgREST: `ops_metrics` rows for feed-size + fill-rate keys with `recorded_at ≥ now()-48h` |
| EC-8 | FR-3.1 | File assertions: `--max-minutes` budget flags present on verify+enrich (re-pinned 2026-07-19), `continue-on-error` absent from IndexNow steps in both workflows; latest scheduled verify run (≤48h): steps Verify/Enrich/Snapshot/IndexNow each `conclusion=success` by exact name (dry-runs excluded) |
| EC-9 | FR-3.2 | Count of sweep-eligible rows (`source='awin' AND merchant_url IS NOT NULL`, **hidden included**) with `last_verified IS NULL OR < now()-48h`, excluding fresh-blocked hosts (same rule as EC-1), = 0 (missing column = FAIL) |
| EC-10 | FR-3.3 | For the pinned workflow list (ingest/verify/sync/purge/cost-guardrail/db-migrate), every fork run **created after the fix-merge commit timestamp** has all jobs `conclusion=skipped` |
| EC-11 | FR-3.4 | Latest scheduled apply verify run log contains `committed=<n> attempted=<n>` (pinned grammar); vitest `flushPatches` retry test exists and latest upstream CI run is green; invalid-key smoke (CI-only) recorded passing |
| EC-12 | FR-3.5 *(Q-6 resolved pre-freeze)* | Machine artifact per chosen channel — e.g. GitHub: an issue labeled `alert-test` created by the alert workflow within 30 days, and the creating run `conclusion=success`. File-existence alone never passes |
| EC-13 | FR-3.6 | Latest completed non-dry-run submit step: `conclusion=success`, log contains `submitted=<n> excluded_never_published=<m>` grammar + slug sample; sampled slugs' hidden-state-at-submit logged by the script (harness re-checks only for rows unchanged since the run started) |
| EC-14 | FR-4.1/4.5 | Pinned-SQL probes: 3 attr-bearing + 3 attr-less deals (a class with <3 members → SKIP `insufficient-cohort` under the printed-skip rule, FAIL if the attrs pipeline has been live >7 days with zero attr-bearing rows) — `data-block="attrs"` present/absent respectively; ≥2 rendered gallery images on enriched samples; one desc-html-with-`<img>` sample exercises the FR-4.5 coupling decision |
| EC-15 | FR-4.2 (as amended), TH-2/TH-3 | Pinned-SQL probes **including a `description==title` row**: every visible probe renders a non-empty title and `data-block="description"` (presence — suppression reversed); marker conditionality negative-controlled via a no-description fixture (a live no-description visible row is itself a TH-3 violation caught by EC-2) |
| EC-16 | FR-4.3 | Mapping table (frozen path) has an entry for every distinct `(shop_name, brand)` pair in prod; 0 visible rows whose brand matches a recorded polluted alias; JSON-LD `brand` on probe pages equals the mapped value |
| EC-17 | FR-5.1 | Probe pages: JSON-LD parses, `@type=Product`; `image` length == count of **deduped-unproxied** DB gallery URLs (gallery NULL → 1); `additionalProperty` present iff attrs exist; `aggregateRating` absent unless provenance field set (Q-5); if Q-7 = remove: `model` present only when DB mpn/model_number exists |
| EC-18 | FR-5.2 | 3 pinned-SQL slugs: `GET /<locale>/deal/<slug>/md` → 200 `text/markdown` containing the pinned field labels + disclosure sentence; `GET /llms.txt` → 200 referencing the surface; **discovery**: the index the llms.txt names enumerates ≥ the probed slugs |
| EC-19 | FR-5.3 | Shared-module richness checks run MEASURED and green in strict mode (UNMEASURED = FAIL); env-override mutation (`RICHNESS_TH1_PCT=101`) exits non-zero; latest upstream scheduled budget workflow run (≤48h) green |
| EC-20 | Global | Reference deal `awin:DE:adv127459:47006571266179` **or fallback cohort** (any visible Renogy DE deal): gallery ≥2, `data-block="description"` present with EC-3's predicate *(description clause Q-3-gated)*, JSON-LD image ≥2; FAIL only if no Renogy DE deal qualifies |
| EC-21 | FR-3.7/FR-1.2 (Q-9) | Static grep: no writer sends `status`/`expired_at`/`content_changed_at`; rows touched by the latest verify run: liveness-changed rows have `last_updated` within the run window AND content-only-touched rows do **not** (provenance-discriminated) |
| EC-22 | FR-1.6 | vitest: `upsertDeals` keep-richer merge test green (a provider row without gallery does not null an enriched gallery) |
| EC-23 | FR-3.8 | `refresh-deals.mts` comment matches its actual schedule; if chained: the dispatch linkage exists in the final verify step (file assertion) |
| EC-24 | Q-1/Q-2 invariant | HTTP probes: every sampled visible (`hidden=false`) PDP emits **no** noindex (robots meta/header), including at least one deal with ≤1 price_history row (proven without baseline); every sampled hidden PDP emits noindex. Positive+negative control mandatory |

## 9. Boundaries

- **Always:** dry-run by default (write flags per §3); write-class split per FR-1.2/Q-9 (liveness writes bump `last_updated`, content-only writes don't; never `status`/`expired_at`/`content_changed_at`); sanitize captured HTML with the existing two-pass allowlist; per-host pacing ≥1s with abandon-on-block + persisted outcomes; keep-richer merge for gallery **in every writer**; render `null` over placeholder; `pnpm test && pnpm typecheck` before commits.
- **Ask first:** schema migrations; anything executed on or configured in the **upstream repo**; rendered-page scraping beyond product JSON endpoints (Q-3); IndexNow/hidden-status policy (Q-1); the M2 writer-contract amendment (Q-9 — it modifies a locked spec and must be recorded there); new dependencies; touching M2/v3.1 locked surfaces.
- **Never:** fabricate reviews/ratings/specs/price-history; 404 previously-emitted URLs (M2 lock — retirement is 410-by-policy); submit never-published URLs to IndexNow; bypass HTML sanitization; parallelize fetches within one merchant host; commit secrets; weaken the discount-proof gate silently (Q-2 owns that); read price/compareAt from non-market-verified responses (currency guard).
- **Explicit exclusion:** the dormant render-time provider-fetch path (kelkoo/tradedoubler/strackr when Supabase is unconfigured) is out of scope; it bypasses W4/W5 guarantees and must not gain credentials without a spec revision.

## 10. Open questions (sign-off gates)

- **Q-1 RESOLVED (2026-07-19):** hidden/unproven PDPs serve **200 + noindex**. **Indexability invariant (user-mandated):** a proven deal (`hidden=false`, i.e. original price + sale price < original, e.g. live-verified compare-at) is **indexable — never noindex — regardless of price-history baseline availability**. Indexation gates on proven-discount status only. Verified by EC-24.
- **Q-2 RESOLVED (2026-07-19):** implement price-drop promotion (P1-7) with guardrails as an **optional additional promotion route** (derives the "original price" from the deal's own N-day baseline when the merchant sets no compare-at). Mandatory provenance for any proven deal = regular price + discounted price lower than it. Baseline comparison is **never required for indexation** — a compare-at-proven deal indexes immediately with zero history rows.
- **Q-3 RESOLVED (2026-07-19):** yes — per-merchant rendered-page extractors approved, under the existing respectful-fetch contract (pacing, abandon-on-block, two-pass sanitization).
- **Q-4 RESOLVED (2026-07-19):** ROCKBROS stays **Google-only**; the coverage watchdog carries a freshness tripwire on the legacy feed's Last-Imported date — revisit only if it refreshes. Capture-at-verify (FR-1.1) supplies galleries.
- **Q-5 RESOLVED (2026-07-19):** **capture with provenance** — aggregateRating read from merchant page JSON-LD, stored with a provenance field, rendered as a visible rating block (FR-4.6 is now an active requirement, not gated) and emitted in JSON-LD per FR-5.1; EC-17's aggregateRating clause enforces provenance-present-or-absent-markup.
- **Q-6 RESOLVED (2026-07-19):** **GitHub Issues on upstream** (`oleg1981-sudo/DealRadar`, label `pipeline-alert`; monthly test-fire creates the `alert-test` issue EC-12 verifies).
- **Q-7 RESOLVED (2026-07-19):** **remove** the `extractTrailingModelCode` heuristic — JSON-LD `model` only from DB mpn/model_number; EC-17 clause active.
- **Q-8 RESOLVED (2026-07-19, user-defined semantics):** thresholds are completeness invariants — TH-1 image present (1 image = complete PDP; 0 = broken/fail), TH-2 title present (absent = fail), TH-3 description visible (any = pass, absent = fail), TH-4 = 0. See §8. Richness percentages demoted to reported non-gating metrics; FR-4.2 suppression reversed accordingly.
- **Q-9 RESOLVED (2026-07-19):** **amendment approved** — write-class split: price/stock/visibility updates = proof of life → bump `last_updated`; content-only saves (gallery/description/attrs/rating) = not proof of life → leave `last_updated` alone. Formally recorded as a dated addendum in the M2 spec dir (`docs/specs/url-structure/2026-07-08_v2/amendment-2026-07-19_write-classes.md`); enforced by EC-21.

## 11. Assumptions (correct now or they stand)

- **A-1** Implementation lands on `main` via PR; scheduled execution and **acceptance harness runs** happen upstream (`oleg1981-sudo/DealRadar`), which holds all secrets.
- **A-2** Supabase prod is a shared surface across parallel sessions — migrations via the Apply-DB-schema workflow only.
- **A-3** M2 lifecycle (`status`) not yet deployed; spec targets the `hidden` model, forward-compatible via FR-3.7/Q-9.
- **A-4** The 62-column Google schema is stable; unread-column fill rates measured by FR-2.1's first report.
- **A-5** Netlify serves PDPs no-store — enrichment visible immediately; no CDN purge step.
- **A-6** Non-Shopify advertisers not yet in catalog; FR-1.3 fallbacks built fixture-first, and FR-2.2's remotePatterns tripwire (not a manual "review at that time") detects arrival.

## 12. Phase gate

This document is Phase 1 (SPECIFY). On sign-off → Phase 2 plan at `docs/specs/pdp-full-content/2026-07-16_v1/plan.md` → Phase 3 tasks at `docs/specs/pdp-full-content/2026-07-16_v1/todo.md` (tasks ≤5 files, acceptance + verify each) → Phase 4 incremental implementation, FR-0 harness built first (red → green as workstreams land). **Never write to `tasks/plan.md`/`tasks/todo.md` — those are the restored M2 url-slug deliverables (b53bb3e).**

## 13. v3.1 crosswalk (registration stub — completed at sign-off)

| This spec | v3.1 / M2 territory | Disposition |
|---|---|---|
| FR-1.5 / Q-2 | P1-7 price-drop promotion | Baseline only here; promotion via v3.1 gate |
| FR-5.1 | FR-SEO-2 (JSON-LD; single-Offer per M2 correction) | Builds on M2-corrected single-Offer shape |
| FR-3.7 / Q-9 | M2 writer contract (locked) | Amendment recorded in M2 spec dir |
| FR-4.x | v3.1 PDP content DSNs | New T-rows registered at sign-off (TH-* naming avoids T-* collision) |
| FR-2.2 watchdog | v3.1 coverage OBJ / audit P0-5 | Implements; registered as new T-row |
| Q-1 | M2 §5 lifecycle (no-404 lock) | Option set constrained accordingly |
