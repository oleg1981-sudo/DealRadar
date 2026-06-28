# DealRadar Remediation — Tasks (phased, dependency-ordered)
> Generated from `plan.json`. 33 tasks across 6 phases. Each task → requirement(s) → named verification.

**Spine (hard prerequisite):** ingest writes slug -> deal page resolves by slug -> live-path price-drop alert dispatch -> one-click unsubscribe POST


## Phase 0 — SPINE — minimal end-to-end core loop

- **T0.1** — Schema: slug NOT NULL (+BEFORE-INSERT default) + one-time backfill UPDATE; confirm RLS on all 4 tables + hot-path indexes
  - Requirements: R-RTE-2, R-SEC-3, R-PERF-2
  - Verification: SELECT count(*) FROM deals WHERE slug IS NULL -> 0; RLS enabled on deals/price_alerts/price_history/transactions; all listed indexes present; re-run schema idempotent
  - Depends on: —

- **T0.2** — ingest-awin.cjs normalizeRow writes slug (canonical rule) + ean_code/metadata cols; discount via shared guard
  - Requirements: R-ING-4
  - Verification: dry-run prints rows with non-empty slug; assert generated slug == deals.repo toRow() for same input; discount uses the shared guard (no unguarded inline %)
  - Depends on: T0.1

- **T0.3** — Live-path price-drop notify: invoke notify over upserted product_ids from the ingest pipeline (or /api/refresh-alerts called by the Action); assert email retains unsubscribe link + List-Unsubscribe headers
  - Requirements: R-MAIL-1, R-MAIL-2
  - Verification: integration: seed a price_alert, run ingest with a lower price -> 1 email dispatched + notified=true; email HTML has unsubscribe <a> and List-Unsubscribe + List-Unsubscribe-Post headers
  - Depends on: T0.2

- **T0.4** — Add POST one-click handler to unsubscribe route sharing HMAC verify+delete with GET (idempotent)
  - Requirements: R-MAIL-3, R-MAIL-4
  - Verification: curl -X POST '<unsub-url>' -> 200 and row deleted; invalid token -> error, 0 deletions; GET still 200; second call idempotent
  - Depends on: —

- **T0.5** — Spine smoke: ingest -> open the deal page by its written slug -> trigger alert -> POST unsubscribe; bogus slug -> 404
  - Requirements: R-RTE-2, R-ING-4, R-MAIL-1, R-MAIL-3, R-RTE-1
  - Verification: scripted E2E over the 4 steps returns 200/sent/deleted with no 404; /<locale>/deal/<bogus> returns HTTP 404
  - Depends on: T0.1, T0.2, T0.3, T0.4

## Phase 1 — Compliance & i18n core

- **T1.1** — Add legal.* + unsubscribe + footer + badge + proof message keys to en.json (source of truth)
  - Requirements: R-I18N-1, R-I18N-2, R-COMP-1
  - Verification: en.json defines all new namespaces; key-parity script lists the 12 locales as missing (pre-translation)
  - Depends on: —

- **T1.2** — Machine-translate new keys into the other 12 locales; flag binding legal copy + real Impressum for legal review
  - Requirements: R-I18N-1
  - Verification: key-parity script reports 0 missing keys across 13 locales; a TODO marker lists keys needing legal sign-off
  - Depends on: T1.1

- **T1.3** — Refactor imprint/privacy/terms to getTranslations + setRequestLocale; privacy to 6 sections; remove hardcoded English + dead import
  - Requirements: R-I18N-2, R-COMP-1
  - Verification: /de/privacy renders German; grep 0 hardcoded English literals; privacy shows 6 sections
  - Depends on: T1.2

- **T1.4** — Add vanilla-cookieconsent@^3; create src/components/consent/CookieConsent.tsx (necessary readOnly, analytics off); mount in root layout; remove custom banner
  - Requirements: R-COMP-3, R-COMP-5
  - Verification: incognito shows banner; no non-essential cookie pre-Accept; next build exit 0
  - Depends on: —

- **T1.5** — Footer: 4 localized controls incl. Cookie Settings dispatching showPreferences
  - Requirements: R-COMP-4, R-COMP-6, R-I18N-4
  - Verification: Footer renders 4 controls; clicking Cookie Settings re-opens consent and toggling analytics persists
  - Depends on: T1.4

## Phase 2 — SEO / AEO

- **T2.1** — Deal page JSON-LD -> Product+AggregateOffer (lowPrice/highPrice/offerCount) + itemCondition NewCondition
  - Requirements: R-GEO-1
  - Verification: Rich Results Test: 0 errors; grep finds AggregateOffer + itemCondition
  - Depends on: —

- **T2.2** — Deal page: visible localized 90-day-low + 'Verified at .. CET' proof fields; fix fromRow historical_low_price != null read
  - Requirements: R-GEO-2
  - Verification: page source contains both strings; neither is sr-only/display:none; a deal with historical_low_price=0 still renders the proof line (no null-collapse)
  - Depends on: T1.2

- **T2.3** — Deal page: localize chrome + metadata; add alternates.languages (13) + x-default; CTA rel 'nofollow sponsored'
  - Requirements: R-I18N-3, R-GEO-5, R-GEO-6
  - Verification: /de/deal/* chrome German; metadata.languages has 13 entries; CTA rel contains nofollow+sponsored
  - Depends on: T1.2

- **T2.4** — Wire localized SponsoredBadge (fix namespace) adjacent to CTA on DealCard + deal page; remove dead DealDetailModal
  - Requirements: R-COMP-2, R-RTE-3
  - Verification: badge visible by every CTA; grep DealDetailModal -> 0
  - Depends on: —

- **T2.5** — Sitemap: import LOCALES; Supabase-sourced slugs across all countries; per-URL hreflang + x-default
  - Requirements: R-GEO-4
  - Verification: no /se/* URLs; a sampled deal URL returns 200; entries carry alternates.languages
  - Depends on: T0.1

- **T2.6** — robots.txt: explicit OAI-SearchBot/PerplexityBot/Google-Extended allow groups (keep Disallow /api/ + Sitemap)
  - Requirements: R-GEO-3
  - Verification: grep finds the 3 groups + Disallow /api/ + Sitemap
  - Depends on: —

## Phase 3 — Security hardening

- **T3.1** — crypto: throw on missing CRON_SECRET in production; keep dev fallback; ensure timing-safe compares
  - Requirements: R-SEC-1, R-SEC-5
  - Verification: prod boot without CRON_SECRET throws; dev unaffected; grep no prod default secret
  - Depends on: —

- **T3.2** — postbacks: timingSafeEqual; require WEBHOOK_SECRET (no CRON fallback grant); network-aware subID; status/commission validation; persist subid3/raw_payload
  - Requirements: R-MON-2, R-MON-3
  - Verification: bad status/commission -> 400; WEBHOOK_SECRET unset -> 401; Kelkoo/TD subID attributed; raw_payload stored
  - Depends on: T3.4

- **T3.3** — rate limit: trusted edge IP + atomic INCR/EXPIRE (or @upstash/ratelimit); warn when Redis unconfigured; confirm 30-min cache TTL on /api/deals
  - Requirements: R-MAIL-7, R-OPS-2, R-PERF-1
  - Verification: 6th request -> 429 under concurrency; XFF spoof ineffective; no-Redis logs warning + passes; CACHE_TTL_SECONDS resolves to 1800 (30*60) and /api/deals returns cached:true on 2nd identical request
  - Depends on: —

- **T3.4** — affiliate: lossless productId encoding so subID round-trips for ids with ':' and '-'
  - Requirements: R-MON-3, R-MON-1
  - Verification: unit test: decorate then parse recovers original productId for kelkoo:abc-123
  - Depends on: —

- **T3.5** — deals.repo: sanitize city before .or() filter (search-token charset) or parameterize
  - Requirements: R-SEC-4
  - Verification: test: crafted city cannot add a filter clause; normal city still scopes results
  - Depends on: —

## Phase 4 — Ingestion depth & data integrity

- **T4.1** — Implement StrackrProvider + register in ALL_PROVIDERS (verified Strackr endpoint/schema; mock when key absent)
  - Requirements: R-ING-1
  - Verification: tsc exit 0; key-absent -> isMock + 0 network calls; registry includes strackr
  - Depends on: —

- **T4.2** — Populate eanCode/gtin in providers + ingest; explicit equal-price priority tie-break in dedup
  - Requirements: R-ING-2, R-ING-3
  - Verification: registry dedup has an explicit equal-price priority tie-break; the 3 dedup unit tests in T5.3 cover EAN-survivor, name+merchant fallback, price-tie->priority
  - Depends on: —

- **T4.3** — Schema: transactions FK + subid3 + raw_payload + received_at + CHECKs; no PII columns; trigger daily-fill (IS DISTINCT FROM)
  - Requirements: R-MON-4, R-ING-5, R-SEC-6
  - Verification: garbage status/negative commission rejected; transactions has no email/name/IP column; same-day same-price -> 1 snapshot, next-day -> 2
  - Depends on: T0.1

- **T4.4** — Refresh: bounded-concurrency fan-out within maxDuration=300; keep 90-day low recompute
  - Requirements: R-ING-8, R-ING-6, R-SEC-2
  - Verification: mock smoke run < 60s; maxDuration=300 retained; bearer still enforced
  - Depends on: —

- **T4.5** — Email CTA via decorateAffiliateUrl; localize unsubscribe pages (locale in URL + getTranslations); scheduled price_alerts retention purge + privacy retention statement
  - Requirements: R-MAIL-6, R-MAIL-5, R-I18N-5
  - Verification: email CTA contains subID; unsubscribe URL carries &locale and /de renders German; retention job deletes rows past window; privacy states period
  - Depends on: T1.3

## Phase 5 — Ops, testing, a11y, regression

- **T5.1** — Migration runner: package script + CI job applying schema idempotently with post-apply checks
  - Requirements: R-OPS-1
  - Verification: CI applies schema twice with no error; checks confirm trigger + RPC exist
  - Depends on: —

- **T5.2** — ESLint config (next/core-web-vitals) committed
  - Requirements: R-TEST-3
  - Verification: next lint runs non-interactively, exit 0
  - Depends on: —

- **T5.3** — vitest config + unit tests (slug, crypto round-trip, affiliate round-trip, 3 dedup cases)
  - Requirements: R-TEST-1
  - Verification: pnpm test exit 0 with the listed cases
  - Depends on: T5.2, T3.4, T4.2

- **T5.4** — i18n key-parity check script + fix any gaps (regression gate)
  - Requirements: R-I18N-1
  - Verification: parity script exit 0: 0 missing/empty keys across 13 locales
  - Depends on: T1.2

- **T5.5** — Empty/loading/error states on search + category + grid
  - Requirements: R-UX-1
  - Verification: 0-result query shows empty state; forced API error shows error UI (not blank)
  - Depends on: —

- **T5.6** — Accessibility pass: labels/alt/focus/contrast on home + deal page
  - Requirements: R-UX-2
  - Verification: axe scan: 0 critical violations on home + deal page; CTA contrast >= 4.5:1
  - Depends on: T2.3

- **T5.7** — Regression: middleware edge-geo + default DE + locale routing/detection smoke; final tsc + next build green
  - Requirements: R-LOC-1, R-LOC-2, R-TEST-2, R-ING-7
  - Verification: unsupported geo header -> dr_location=DE; unprefixed request redirects to a locale prefix; tsc + next build exit 0, no new warnings
  - Depends on: T0.5, T1.5, T2.6, T3.5, T4.5, T5.6

---

## Dependency edges
- T0.1 → T0.2
- T0.2 → T0.3
- T0.1 → T0.5
- T0.2 → T0.5
- T0.3 → T0.5
- T0.4 → T0.5
- T1.1 → T1.2
- T1.2 → T1.3
- T1.4 → T1.5
- T1.2 → T2.2
- T1.2 → T2.3
- T0.1 → T2.5
- T3.4 → T3.2
- T0.1 → T4.3
- T1.3 → T4.5
- T5.2 → T5.3
- T3.4 → T5.3
- T4.2 → T5.3
- T1.2 → T5.4
- T2.3 → T5.6
- T0.5 → T5.7
- T1.5 → T5.7
- T2.6 → T5.7
- T3.5 → T5.7
- T4.5 → T5.7
- T5.6 → T5.7
