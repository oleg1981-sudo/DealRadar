# Tasks: PDP Full-Content Pipeline (Phase 3)

Plan: `plan.md` v1.1 · Spec: `spec.md` v1.2 · Status legend: `[ ]` open · `[x]` done · `[~]` in progress
**Tree note (2026-07-19):** catalog is now 33,324 deals / 28,935 visible (per-fid acquisition 38955e1) — all capacity budgets sized for ~35k rows, not the audit-era 6k.

## Stage 0 — un-gated hardening

- [x] T0.2 Verify PGRST102 fix deployed (658eb5e): latest upstream programmes-sync run succeeded 2026-07-19 09:23 UTC. No work needed.
- [x] T0.3 ops_metrics present in prod (verified via SQL 2026-07-19). No dispatch needed.
- [x] T0.1 Pipeline budget + IndexNow hardening (done 2026-07-19; adversarially reviewed — homepage-ping regression, retry asymmetry, flag-parse, ordering starvation all fixed; spec re-pinned to --max-minutes)
  - Acceptance: verify-awin.yml passes `--max-minutes` to verify AND enrich (enrich gains the flag); budgets sum < timeout-minutes 150; `continue-on-error` removed from IndexNow steps in BOTH verify-awin.yml and ingest-awin.yml; indexnow-submit.cjs retries transient 429/5xx (bounded) and excludes hidden rows (interim FR-3.6) with a logged excluded count; stale "404 refresh" comments corrected (hidden = 200+noindex per Q-1).
  - Verify: `python3 -c "import yaml,glob; [yaml.safe_load(open(f)) for f in glob.glob('.github/workflows/*.yml')]"`; `node scripts/enrich-galleries.cjs --limit 1 --max-minutes 1` dry-run exits 0; `node scripts/indexnow-submit.cjs --dry-run` logs excluded count.
  - Files: .github/workflows/verify-awin.yml, .github/workflows/ingest-awin.yml, scripts/enrich-galleries.cjs, scripts/indexnow-submit.cjs
- [x] T0.4 Owner-gate all secret-dependent jobs (done; 7/7 gated, review-verified; EC-10 green after merge+fork-sync) (`if: github.repository_owner == 'oleg1981-sudo'`): ingest-awin, verify-awin, awin-programmes-sync, purge-alerts, cost-guardrail, db-migrate, thin-loop-drill (ci.yml stays ungated — secret-free, must run on fork PRs).
  - Verify: YAML parse + grep count = 7; EC-10 after next fork sync.
- [x] T0.5 refresh-deals.mts: fix stale "every 15 minutes" docstring; document best-effort ordering (GitHub cron lateness tolerance). Verify: comment matches `schedule: '0 6 * * *'` (EC-23).
- [x] T0.6 noindex on hidden PDPs (done; review found zero defects; EC-24 green after deploy) via generateMetadata robots; visible PDPs emit no robots restriction (Q-1/EC-24). Verify: local render or prod probe of one hidden + one visible slug.

## Stage 1 — schema + harness
- [x] T1.1 Single migration (applied to prod 2026-07-19: 7 columns + fetch_outcomes + first_published_at trigger + 28,935-row backfill; mirrored in schema.sql): feed_attrs, last_verified, rating+provenance, fetch_outcomes, capture run-id, first_published_at. Ask-first gate + A-2 coordination. Verify: db-verify.mjs extended; columns present.
- [x] T1.2 Harness skeleton (done; baseline run: 2 PASS / 5 FAIL / 17 RED; TH-1=0, TH-2=0, TH-3=2 via service-role SQL — invariants nearly green already) `scripts/verify-spec-pdp-content.mjs`: acceptance-mode env, EC registry, RED stubs ×24; implement EC-24, EC-8(file), TH-1..TH-3 SQL. Verify: exits non-zero listing RED ECs.

## Stage 2 — capture-at-verify
- [~] T2.1 Extractor library (Shopify path live inline in verify incl. gallery capture; JSON-LD/OG fallback chain + fixtures pending) (shopify js/json → JSON-LD → OG; priceOk split; fixtures). Verify: vitest green.
- [x] T2.2 verify-awin.cjs three-write-class redesign (done 2026-07-19: liveness/content/watermark classes, hidden-touch removal, /products/ sweep filter excl. 22.9k redirect rows, stalest-first order, fetch_outcomes persistence, capture provenance, committed/attempted grammar, graceful column degrade; EC-9/21 green post-soak) (liveness PATCH / content-only PATCH / liveness touch on verified-alive-visible only; remove hidden-stays-hidden touches; stale-hide re-keyed to last_verified; stalest-first order; graceful degrade on missing columns; migration-applied checkpoint; committed/attempted grammar; chaos drill + invalid-key smoke via thin-loop-drill.yml). Verify: EC-21 cohorts non-vacuous post-soak; EC-1/2/9/11(part).
- [x] T2.3 snapshot-prices covers hidden (filter dropped); enrich-galleries → bounded backfill. Verify: EC-4.
- [x] T2.4 upsertDeals keep-richer via uniform key omission (description_html precedent; PGRST102-safe) + FR-3.7 static audit clean + write-class/merge/retry vitest ×8 (per-signature batching — PGRST102 trap) + FR-3.7 all-writers audit (+ deferral note for M2 watermark/tripwire). Verify: EC-22 vitest; EC-21 grep.
- [ ] T2.5 Post-merge soak: ≥2 upstream cron cycles; EC-9 capacity check at ~35k rows (may need pacing/sharding revisit — flag if 2 daily deadline-bounded runs can't cover the eligible set).

## Stage 3 — acquisition
- [x] T3.1 All-column parse (feed-attrs.cjs generic collector, both normalizers, fill-rate grammar + awin_fill_rates ops_metric; +5 tests) → feed_attrs (both formats) + fill-rate grammar + ops_metrics keys. Verify: EC-5.
- [x] T3.2 watchdog extended IN awin-programmes-sync.yml (remotePatterns tripwire, FR-3.5 36h capture-staleness red, EC-12 self-healing monthly alert-test; alert-issue lifecycle was pre-existing aba8a30); spec/harness re-pinned — no separate workflow scripts/lib/coverage.cjs (aba8a30): TH-4, ROCKBROS freshness tripwire, remotePatterns tripwire, `ingested|excluded(reason)` grammar, Q-6 GitHub-issue alerts + FR-3.5 36h staleness + monthly alert-test; subordinate digest. Verify: EC-6, EC-12.
- [x] T3.3 scripts/lib/feed-policy.json (remaining exclusions: non-German, non-EUR). Verify: EC-6 clause.
- [x] T3.4 Loud no-ops (purge-alerts + db-migrate exit 1 on missing secrets; check-budgets --strict wired in cost-guardrail) (purge-alerts/db-migrate/cost-guardrail exit non-zero on missing secrets, upstream only). Verify: EC-11(rest).

## Stage 4 — rendering
- [ ] T4.1 data-block markers + new conditional blocks (attrs/shipping/condition/energy/variants) + FR-4.2-as-amended + rating block + FR-4.5 More-images with sanitizer-aware `<img>` coupling. Verify: EC-14, EC-15.
- [ ] T4.2 Brand census → scripts/lib/brand-map.json → ingest normalization + JSON-LD. Verify: EC-16.
- [ ] T4.3 Remove extractTrailingModelCode; PriceHeatBar relabel range-not-history. Verify: EC-17 clause.

## Stage 5 — emission
- [ ] T5.1 JSON-LD enrichment (image array, additionalProperty, itemCondition, shipping, sku, rating-with-provenance, model-from-DB). Verify: EC-17.
- [ ] T5.2 /deal/<slug>/md route + llms.txt + discovery index. Verify: EC-18.
- [ ] T5.3 Richness shared module + strict budgets + upstream scheduled workflow; full FR-3.6 split via first_published_at (graduates T0.1's interim filter). Verify: EC-13, EC-19.

## Stage 6 — gated expansions
- [ ] T6.1 Renogy section extractor (+ page-level rating capture). Verify: EC-3.
- [ ] T6.2 P1-7 price-drop promotion (baseline ≥N days of hidden snapshots; liveness write; sets first_published_at). Verify: EC-24 unaffected.

## Final
- [ ] TF.1 Full acceptance harness run on upstream — EC-1..EC-24 all executed, EC-20 green.
