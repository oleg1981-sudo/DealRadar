# PDP richness root cause — verified findings + non-recurrence blueprint

**Date:** 2026-07-16 · **Trigger:** new AWIN programmes (Renogy DE et al.) render thin PDPs (1 image, title-as-description) vs the merchants' rich original pages.
**Method:** initial 4-agent audit (rendering / ingest / ops / DB) followed by a 6-agent adversarial verification pass (every claim independently re-derived; fresh SQL, fresh `gh` logs, live-site curls). Verdicts below reflect the *post-adversarial* state.

## 1. Verified root-cause chain

Not an API-fetch bug. Not a rendering bug. Prod deploy is current (adversarially confirmed: live Kuishi/BlazeVideo PDPs render 5-image galleries + multi-paragraph HTML on the same deploy that renders Renogy thin; CSP fingerprint proves post-a3acee0 build).

The thin PDP is the intersection of four verified causes:

| # | Cause | Status | Evidence |
|---|---|---|---|
| 1 | **Google-format feeds are born thin.** v2 mapper reads `image_link` + `additional_image_link` (`scripts/lib/enhanced-feed.cjs:127-128`), but `additional_image_link` is empty in every row of every active feed — all 5,141 v2 rows have gallery length exactly 1 (`gallery[1] = image_url`, max=1 in every v2 shop, ever). | CONFIRMED | DB sweep ×2 snapshots; findings.md Pass-2 feed scan |
| 2 | **Gallery enrichment structurally lags and was starved today.** Galleries come only from `enrich-galleries.cjs` (Shopify `/products/<handle>.js`), gated `hidden=false`, and it runs as the *last-but-two* step of verify-awin.yml. Both verify runs on 2026-07-16 were job-timeout-killed at exactly 30 min (pre-63b77bb SHA), skipping the enrich step → **zero v2 rows have ever had gallery ≥ 2**, including the 664 already-visible ones. | CONFIRMED | runs 29479161823, 29479423844 (upstream); step conclusions `skipped` |
| 3 | **The description half is mostly Renogy-specific, not v2-generic** (correction to the initial audit). verify's incremental flushing captured `description_html` for 422/664 visible v2 rows *during* the timed-out runs; every visible non-Renogy v2 row has it (ROCKBROS 174/174, Welax 113/113, AOSU 86/86, Omidi 36/36, ANTHBOT 6/6). Renogy is a **triple-source failure**: feed description ≈ title (avg 150 chars; 262/291 rows < 100), Shopify JSON `description` is empty (live probe: `description:''` alongside 10 images), and capture is gated on the proven-discount branch. ~242 visible Renogy PDPs stay title-only under the current architecture no matter how reliably it runs. | CONFIRMED (corrected) | live `.js` probes; per-shop SQL |
| 4 | **Vendor parity is capped by missing PDP features.** No reviews block exists anywhere (grep: zero aggregateRating/review code); the spec block renders at most brand/model/EAN (FR-PDP-6 no-fabrication); AWIN `specifications`-class columns were never read by any ingest version; ~45 of the 62 Google-feed columns are unread (energy/certification never sampled non-empty — residual unknown). | CONFIRMED | rendering trace + repo greps |

**Hidden-until-proven interaction (design consequence, quantified):** 4,477/5,141 v2 rows (87%) are hidden with `discount_percent=0`; the only un-hide writer is `verify-awin.cjs` `decide()` on live Shopify `compare_at > price`. A merchant that discounts by lowering `price` (no compare_at) can **never** be promoted, and `snapshot-prices.cjs` filters `hidden=false` so no baseline accrues for the planned price-drop promotion (P1-7, unimplemented). Most of the sweep the 150-min timeout was raised for consists of rows that currently can never publish — fetched daily, rich payload discarded.

## 2. Ops timeline 2026-07-16 (UTC, reconciled — dual-repo discovery)

Every scheduled workflow runs on **both** `oleg1981-sudo/DealRadar` (upstream, holds all secrets) **and** the `Manzela/DealRadar` fork (secrets empty). The fork produces daily red failures (ingest 05:45, sync 06:39, verify 07:26 — each env-check exit-1 within seconds) plus **misleading green no-ops** (purge-alerts/db-migrate/cost-guardrail "skip" and exit 0). GitHub's scheduler also ran ~2.5 h late across the board today.

Upstream (real) sequence: 05:31 legacy ingest (cron, pre-v2 SHA) → 07:01 programmes-sync **FAILED PGRST102** ("All object keys must match" — heterogeneous bulk-upsert payload; programmes table did not sync today) → 07:08 v2 dry-run → 07:10 v2 apply run 29479041426 (5,960 upserted; 5,141 inserted hidden; also logged `ops_metrics` 404 — table missing, telemetry silently lost) → 07:12 + 07:17 verify runs both killed at 30:00 (enrich/snapshot/IndexNow skipped ×2) → 08:53 timeout fix 63b77bb pushed → 08:54 verify run 29485121663 in progress (survived past 30 min; enrich pending as of 09:34).

**IndexNow side effect:** the 07:12 ingest submitted 5,960 URLs including ~5,149 hidden never-published PDPs, which serve HTTP 200 "unavailable" + OutOfStock JSON-LD (not 404 as the submit script assumes) — pushing the worst version of the symptom to Bing/Yandex/Seznam while the sitemap excludes them.

## 3. Adversarial corrections & noteworthy latent risks (initial audit → corrected)

- "Enrichment never ran" → true **only for galleries**; descriptions were flowing mid-timeout (incremental flush every 50 patches).
- Legacy "~100% multi-image" → 99.4% (BlazeVideo 85.3%, 5 single-image rows; Sunshare is the only legacy shop with visible rows missing description_html — all 80 of them).
- "Legacy ~10 price snapshots" → true for 814/846; 32 legacy deals have zero history (31 hidden, 1 visible).
- PDP "100% DB-driven" → true on the production (Supabase-configured) path; a dormant render-time provider-fetch path exists when Supabase is unconfigured (kelkoo/tradedoubler/strackr).
- "No synthesized content" → visible UI yes; JSON-LD additionally synthesizes `model` via `extractTrailingModelCode(product_name)` when mpn/model_number absent.
- **Verifier throws away the gallery it already downloaded**: `toState()` (`verify-awin.cjs:101-112`) keeps price/compareAt/descriptionHtml and discards `json.images`; `enrich-galleries.cjs` later re-fetches the *identical* endpoint. Double per-host load (~6k rows × 2 sweeps at 1 s/host), and galleries lag promotion by ≥1 further successful pass.
- **Coverage holes:** Hollyland DE (455 products) + Autofull EU (32) silently excluded by the `Language==='German'`/EUR gates → 0 pages, no alert (watchdog P0-5 unimplemented). Latent dual-format language trap: advertiser with non-German Google feed + German legacy feed loses both.
- **Non-Shopify fragility (latent, compounding):** `next.config.mjs` remotePatterns allows only cdn.shopify.com among merchant CDNs (100% of current rows are Shopify — safe today); verify/enrich are Shopify-`/products/*.js`-only, so a non-Shopify advertiser both breaks `next/image` AND can never be promoted. Renogy path quirk: `/de/products/*.js` 404s; only the germanDomain fallback works — other domain shapes would stay hidden forever.
- ROCKBROS dual-format: a legacy feed with `alternate_image_*` columns exists but is discarded in favor of the (fresher, image-poorer) Google feed; the legacy feed was 2 months stale — trade-off, revisit if it refreshes.
- `flushPatches` swallows per-row PATCH failures (log-only); `htmlCaptured` is "attempted", not "committed". `enrich-galleries` PATCH omits `last_updated` (doesn't count as liveness heartbeat — undocumented interplay). `/api/refresh` upsert path would clobber enriched galleries for future non-AWIN providers (inert today).
- Brand pollution: `brand='Renogy DE'` (advertiser-suffixed) flows into spec block + JSON-LD.
- 19 visible v2 + 80 legacy rows render `description == product_name` — a zero-information "Product details" section that should be suppressed.

## 4. Non-recurrence blueprint (end goal: fetch everything AWIN offers; render everything that exists; emit it for SEO/AEO/GEO)

Ground truth constraint (verified): even "all columns" cannot make these PDPs rich from feed alone — Google-format rich columns are advertiser-empty and `sale_price` is empty in all 7,100 rows. The architecture must therefore fund richness from **feed (everything offered) + merchant-page capture (everything visible) + guardrails (prove it stays that way)**.

### Phase A — capture-at-verify unification (highest leverage, kills cause 2+3 structurally)
1. `verify-awin.cjs toState()`: keep `json.images`; write `gallery` (unproxied, capped 6, keep-richer rule) in the **same patch** that un-hides/updates a deal. Retire `enrich-galleries.cjs` to a backfill role. Halves merchant fetch load; galleries arrive at promotion time.
2. Capture content (description_html, images, structured bits) for **all fetched rows**, not just the proven-discount branch — hidden rows are fetched daily anyway; today 100% of their rich payload is discarded.
3. Non-Shopify + path-shape fallbacks: try `/products/<handle>.js` → `.json` → merchant-page `<script type="application/ld+json">` Product + OG tags (generic, works for any platform). Renogy-style section content: per-merchant extractor interface with a rendered-page fallback (Renogy's rich description lives in sections/metafields — unreachable via product JSON; this is the only fix for the ~242 title-only Renogy PDPs).
4. Snapshot prices for hidden rows too (drop the `hidden=false` filter in `snapshot-prices.cjs`) and implement P1-7 price-drop promotion so lowered-price (no compare_at) merchants can ever publish.

### Phase B — acquisition completeness (cause 1 + coverage)
5. Parse **all 62 Google columns** into a `feed_attrs jsonb` (colour, size, material, dimensions, energy_efficiency_class, certification, condition, shipping, item_group_id, product_type, …) — store whatever is non-empty; per-column fill-rate report per advertiser after every ingest (loud regression signal). Same for the legacy ~70-column feed (already regenerated 2026-07-15 with full columns).
6. Coverage watchdog (P0-5): join `affiliate_programmes` × feed-list format flags × per-advertiser ingested counts; alert on any joined advertiser at 0 products (would have caught Hollyland/Autofull). Make language/currency policy explicit rather than a silent gate.
7. Fix programmes-sync PGRST102 (homogenize bulk-upsert keys) + apply the `ops_metrics` migration.

### Phase C — pipeline robustness (never starve again)
8. Pass `--deadline` in verify-awin.yml (script supports it; graceful exit lets enrich/snapshot/IndexNow run); add watermark ordering (`ORDER BY last_verified ASC` + persisted cursor) so repeated interruptions rotate coverage instead of starving the tail.
9. Disable schedules on the fork (gate jobs on `github.repository_owner`) — removes daily red noise and the double-run risk if secrets ever land there; make the green no-op skips fail loudly instead.
10. Retry/report failed row-patches (flushPatches); emit committed (not attempted) counts; alert if the enrich stage hasn't succeeded in 24 h.
11. IndexNow: stop submitting hidden/never-published URLs (or make the hidden-PDP status policy consistent: 200+OutOfStock vs 404 vs noindex — decide once, align submit script, sitemap, robots).

### Phase D — render everything that exists (conditional blocks; FR-PDP-6 preserved)
12. New conditional PDP blocks fed by `feed_attrs` + captured content: full spec table (only real attributes), delivery/shipping, condition, variant/family links (item_group_id), energy label. Suppress the description block when `description === product_name`. Normalize brand (strip advertiser suffix) at ingest.
13. Reviews: only from a legitimate source (merchant JSON-LD aggregateRating capture is feasible in the Phase-A extractor); never fabricate.

### Phase E — SEO / AEO / GEO emission
14. JSON-LD: emit `additionalProperty` from real spec attrs, `itemCondition`, `shippingDetails`, `sku` everywhere, gallery image array (exists), aggregateRating only when captured-real. Keep gtin/mpn coverage (already 4,763/5,141).
15. Agent-readable layer: `llms.txt` + per-deal markdown endpoint (`/deal/<slug>.md` or `/api/agent/deal/<slug>`) exposing the same structured facts (price, history, attrs, availability, affiliate disclosure) — the "Markdown graph context" surface; sitemap-linked.
16. Richness budget in CI (extend `check-budgets.mjs`): fail/alert when % of visible deals with gallery≥2 or description≥240 chars regresses below thresholds — the direct "this can never silently happen again" guardrail.

## 5. Open items at time of writing
- ~~Run 29485121663 still in verify~~ **RESOLVED — causal model empirically confirmed:** the run completed all steps green. Verify swept 5,987 deals in 5,915 s (98.6 min — would have been killed under the old 30-min cap); enrich then ran (`[gallery] 861 of 1671 visible deals need enrichment → enriched 855, unchanged 6, errors 0`, 518.8 s). The reference Renogy deal went gallery 1 → **6 images** (the exact set predicted from its Shopify JSON) while `description_html` stayed NULL (the predicted permanent Renogy gap — needs the section extractor). Note: `last_updated` was untouched by the gallery PATCH, confirming the heartbeat-interplay finding.
- ~45 unread Google-feed columns: fill-rates unverifiable without a feed re-pull; sample non-empty columns during Phase B.
- ROCKBROS legacy-feed alternate_image population unverified (feed stale since 2026-05-15).
