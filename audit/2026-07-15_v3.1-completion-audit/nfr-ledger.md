### NFR-COST-2 [PARTIAL] (area:ING)
Evidence: AWIN feed download in scripts/ingest-awin.cjs is a single unbounded stream fetch of the whole feed; the only size-related control is a --limit flag (ingest-awin.cjs:36) that caps KEPT rows post-filter, not download bytes, and a header comment estimating '~300 MB / ~200k' rows (ingest-awin.cjs:3).
Gap: No byte-budget tracking, no abort-on-breach, and no alert wiring exist anywhere in the ingest script or its workflow (.github/workflows/ingest-awin.yml) for an egress-cap breach — the NFR's 'alert on a breach' clause is entirely unimplemented; the cap is aspirational documentation only.

### NFR-SEC-1 [DONE] (area:MON)
Evidence: Dedicated `WEBHOOK_SECRET` (no `CRON_SECRET` fallback, explicit comment at route.ts:28-29 'postbacks != cron auth'), compared via `timingSafeEqualStr` (crypto.ts:44-52, uses `crypto.timingSafeEqual`); wrong secret -> 401 at route.ts:36, tested green at route.test.ts:93-97.
Gap: None found for this narrower secret-auth NFR.

### NFR-SEC-4 [NOT_DONE] (area:MON)
Evidence: n/a — feature absent.
Gap: Requires 'HMAC body signature + replay guard beyond the query-param secret; tampered/replayed -> rejected.' Neither exists anywhere in `src/app/api/postbacks/route.ts` or `src/lib/utils/crypto.ts` — see T-MON-2 gap for full detail. Postback auth today is solely the static query-string secret.

### NFR-PRIV-1 [DONE] (area:MON)
Evidence: SubID grammar is exactly `dealradar_{country}_{category}_{hex(productId)}` (affiliate.ts:44-49, `SUBID_PREFIX='dealradar'`); productId is hex-encoded via TextEncoder (no email/name/PII fields ever enter buildSubId's inputs — only country, category, productId).
Gap: None found.

### NFR-PERF-2 [PARTIAL] (area:PDP)
Evidence: PDP structurally supports good CWV: fixed-aspect-ratio containers for images (`aspect-square`, `aspect-[4/3]` classes in DealGallery.tsx and DealCard.tsx) mitigate CLS; next/image used throughout with explicit width/height/sizes (page.tsx:293-301); `export const dynamic = 'force-dynamic'` (page.tsx:28) declares the rendering strategy the FR required be explicit.
Gap: No Lighthouse/CrUX field-data measurement was run in this pass — LCP<2.5s and CLS≈0 cannot be confirmed or denied from static code alone; this remains an unverified runtime claim requiring a live/staging Lighthouse pass per the task's own Verify method.

### NFR-SEO-1 [NOT_DONE] (area:SEO)
Evidence: Index coverage requires the GSC coverage poll (T-SEO-8) which does not exist (no pollCoverage, no operator_signals table).
Gap: No mechanism in-repo measures or tracks the 0 -> >=1,000 indexed-URL SLO; sitemap itself is now DB-driven/ISR (ready to be crawled) but nothing polls or records coverage.

### NFR-SEO-2 [PARTIAL] (area:SEO)
Evidence: A single siteUrl() helper (src/lib/utils/site-url.ts) is now used consistently across canonical/hreflang/sitemap/JSON-LD-url/unsubscribe-link call sites (page.tsx, sitemaps.ts, robots.ts, alerts.repo.ts), and public/robots.txt (the shadowed dead-weight file carrying a dealradar.eu Sitemap line) is deleted.
Gap: No CI enforcement exists to keep it at 0 sampled non-dealradar.me references going forward (see T-SEO-1 gap); grep of src/public still returns 4 comment/test hits referencing the old host literal, and the prod-live check can only be done via the unwired scripts/verify-deploy.mjs, not automatically.

### NFR-SEO-3 [NOT_DONE] (area:SEO)
Evidence: JSON-LD availability remains a hardcoded 'https://schema.org/InStock' constant at src/app/[locale]/deal/[slug]/page.tsx:97, contradicted no differently than the doc's own carried-over SC5 finding; the offer is a single Offer object, not an AggregateOffer with lowPrice/highPrice/offerCount as required by structured-data validity checks tied to FR-SEO-2.
Gap: No live Rich Results Test result is recorded anywhere in-repo to confirm/deny 0-errors; based on the hardcoded availability and missing AggregateOffer fields the SLO is unmet on its own terms even without running RRT.

### NFR-SEO-4 [NOT_DONE] (area:SEO)
Evidence: No citation-probe script/workflow exists (see T-SEO-9) — grep for probe-citations.mjs / citation-probe.yml returns nothing.
Gap: No mechanism exists to observe or record an AI-engine citation at all.

### NFR-PERF-1 [PARTIAL] (area:INF)
Evidence: src/lib/cache/redis.ts sets CACHE_TTL_SECONDS=1800 and src/app/api/deals/route.ts:42-53 implements a correct cacheGet→queryDeals→cacheSet pattern that should return cached:true on a repeat identical request.
Gap: Live test: 3 consecutive identical requests to https://dealradar.me/api/deals?country=DE&category=electronics all returned cached:false — either Upstash is not configured in prod or cache reads/writes are silently failing (redis.ts:18-28 swallows fetch errors and returns null), contradicting the NFR's live SLO.

### NFR-REL-1 [NOT_DONE] (area:INF)
Evidence: grep for uptime/healthcheck/health-check across src/, scripts/, .github/ returns nothing.
Gap: No uptime probe or availability-monitoring mechanism exists in the repo at all; the ≥99.5%/mo SLO cannot be measured or enforced by anything in-repo.

### NFR-REL-5 [NOT_DONE] (area:INF)
Evidence: Same as T-INF-4 — no ci.yml exists anywhere in git history, and no workflow runs tsc --noEmit, next build, or pnpm test.
Gap: No build/test health gate exists in CI at all.

### NFR-REL-6 [NOT_DONE] (area:INF)
Evidence: Same as T-INF-11 — no restore-drill.mjs, no rollback documentation in schema.sql.
Gap: No code-side DR mechanism exists; PITR/backup dashboard status unverified (permission-denied for direct prod SQL beyond schema.sql grep in this session).

### NFR-SEC-2 [PARTIAL] (area:INF)
Evidence: Live Supabase (MCP): all 5 public tables (deals, price_alerts, price_history, transactions, affiliate_programmes) have rls_enabled=true.
Gap: Live pg_policies query for schema=public returns ZERO rows across all tables — RLS is enabled but no explicit policies exist. This is a deny-all-to-anon posture (safe, since the app uses the service-role key server-side, confirmed via get_advisors flagging it only as INFO-level 'RLS Enabled No Policy', not a vulnerability), but it means the literal acceptance text 'RLS on all tables (pg_policies)' — read as policies existing — does not hold.

### NFR-SEC-3 [DONE] (area:INF)
Evidence: Live curl to https://dealradar.me/en shows content-security-policy, strict-transport-security (max-age=63072000; includeSubDomains; preload), x-content-type-options: nosniff, x-frame-options: DENY headers present, matching next.config.mjs:10-33 exactly.
Gap: None found.

### NFR-SEC-5 [NOT_DONE] (area:INF)
Evidence: sanitizeCity exists at src/lib/db/deals.repo.ts:270 but is unexported and untested.
Gap: No unit test exists anywhere in the repo exercising city-injection sanitization (grep for sanitizeCity across *.test.ts returns nothing) — the NFR's SLO ('unit test') is unmet even though the underlying sanitization logic exists.

### NFR-SEC-6 [NOT_DONE] (area:INF)
Evidence: Same as T-INF-7 — only /api/alerts has a rate limiter; live 8x rapid /api/deals requests all returned 200.
Gap: No atomic sliding-window rate limiting on write/expensive endpoints (refresh, postbacks, search, deals) — the (N+1)th request never returns 429 on any of them.

### NFR-PRIV-4 [DONE] (area:INF)
Evidence: grep -in 'lat\b|lon\b|latitude|longitude' supabase/schema.sql returns nothing.
Gap: None found.

### NFR-COST-1 [NOT_DONE] (area:INF)
Evidence: scripts/check-budgets.mjs does not exist anywhere in the repo.
Gap: checkBudgets() is entirely unimplemented; no spend-cap check of any kind exists.

### NFR-COST-2 [NOT_DONE] (area:INF)
Evidence: Same as NFR-COST-1 — no check-budgets.mjs or cost-guardrail.yml exists.
Gap: No AWIN egress-cap check exists anywhere in the repo.

### NFR-COST-3 [NOT_DONE] (area:INF)
Evidence: Same as NFR-COST-1/2.
Gap: No Vertex/LLM token-spend tracking or max-iteration guard exists for any agentic cron in the repo.

### NFR-OBS-3 [NOT_DONE] (area:INF)
Evidence: Same as T-INF-10 — no cron_heartbeat signal anywhere, and refresh-deals.mts / db-migrate.yml both silently exit 0/200 on a missing secret instead of alarming.
Gap: No liveness/cron-silence alerting mechanism exists in the repo.

### NFR-PERF-3 [PARTIAL] (area:INF)
Evidence: supabase/schema.sql has indexes covering the deal-listing, search (trgm), slug, and ean hot paths (lines 39-52, 121-122).
Gap: No EXPLAIN CI gate exists (scripts/explain-gate.mjs is absent) to prove/enforce no-seq-scan on an ongoing basis — index presence is not continuously verified.

### NFR-SCALE-1 [PARTIAL] (area:INF)
Evidence: src/app/api/refresh/route.ts:53-72 implements a bounded worker pool (concurrency env-tunable) for the 160-task country×category fan-out within a single invocation.
Gap: No measurement of Netlify's actual serverless ceiling exists anywhere in the repo, and no chunk-to-N-tasks/invocation or GH-Action offload path exists as a fallback if the single-invocation ceiling is insufficient.

### NFR-SCALE-3 [PARTIAL] (area:INF)
Evidence: Hot-path indexes exist in schema.sql (see NFR-PERF-3).
Gap: No DB-size-trend-vs-A-09-scale-up-trigger monitoring exists — this depends on the same absent check-budgets.mjs mechanism (NFR-COST-1).

### NFR-PRIV-1 [DONE] (area:CMP)
Evidence: src/lib/utils/affiliate.ts:39-44 buildSubId() produces exactly `dealradar_<country>_<category>_<productHex>` (SUBID_PREFIX='dealradar', 4 underscore-delimited fields per decodeSubId:57-58 parity check). productId is hex-encoded via TextEncoder (toHex, affiliate.ts:24-29), never email/name; country/category are sanitized alphanumeric tokens, not user-identifying.
Gap: None found.

### NFR-PRIV-2 [DONE] (area:CMP)
Evidence: unsubscribe/route.ts:10-21 deletes the matching price_alerts row keyed on email+productId after HMAC verification, and is explicitly idempotent by design ('idempotent: success even if the row was already gone', line 20). Both GET (route.ts:43-55) and POST (route.ts:61-72) verbs perform the same deletion.
Gap: Erasure itself works, but note the GET-verb-is-state-changing defect tracked under T-CMP-5 is a related security/UX concern (accidental erasure via prefetch), not a failure of the erasure mechanism itself.

### NFR-PRIV-3 [PARTIAL] (area:CMP)
Evidence: Opt-in analytics default OFF is correctly implemented: CookieConsent.tsx:29 `analytics: { enabled: false }`, and Analytics.tsx:116-131 gates all tag loading on granted consent.
Gap: The other half of this NFR — 'consent audit logged with no PII (Art 5(2))' — is entirely unimplemented; see T-CMP-6 (no api/consent route, no consent_audit table anywhere in the repo).

### NFR-PRIV-4 [DONE] (area:CMP)
Evidence: grep -ni 'lat|lng|longitude|latitude' supabase/schema.sql returns zero matches — no geo-coordinate column exists on any table. Location handling (middleware.ts:24, useLocation.tsx:32) persists only a coarse `country|city` string cookie, not coordinates.
Gap: None found.

### NFR-OBS-1 [NOT_DONE] (area:OPS)
Evidence: No src/lib/observability/emit.ts exists; grep for 'emit(' / signal-emission patterns tied to named signals (mock-rows, upserted, staleness, 404-rate, JSON-LD validity, index coverage, rank, CTR, postback 401/FK-null/commission, cost) returns nothing in src, netlify, or scripts.
Gap: No signal is emitted on any code path — the substrate this NFR depends on does not exist.

### NFR-OBS-2 [NOT_DONE] (area:OPS)
Evidence: No error-tracking library (Sentry or equivalent) is a dependency in package.json, and no custom tracker module exists anywhere in the repo.
Gap: There is no mechanism to capture an induced/thrown error at all.

### NFR-OBS-3 [NOT_DONE] (area:OPS)
Evidence: No cron-heartbeat or missing-signal/cron-silence alerting exists; netlify/functions/refresh-deals.mts was grepped for 'heartbeat'/'signal'/'emit(' with zero matches, and no other cron infra in .github/workflows references a heartbeat.
Gap: No liveness/dead-stream detection exists anywhere — this NFR is unmet at every level (T-OPS-1's uptime probe, T-INF-10's cron heartbeat, and T-OPS-5's dead-man's-switch are all absent).

