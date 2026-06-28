
## Component inventory (31) — every component traces to ≥1 requirement

| ID | Component | Path | Phase | Responsibility | Requirements |
|---|---|---|---|---|---|
| C-ingest | AWIN ingest script | `scripts/ingest-awin.cjs` | 0 | Write slug + metadata cols; invoke live-path notify; reuse discount guard | R-ING-4, R-MAIL-1 |
| C-schema | Supabase schema | `supabase/schema.sql` | 0 | slug NOT NULL + backfill; trigger daily-fill; transactions integrity; indexes; RLS; no-PII | R-RTE-2, R-ING-5, R-MON-4, R-PERF-2, R-SEC-3, R-SEC-6 |
| C-dealsrepo | deals.repo | `src/lib/db/deals.repo.ts` | 0 | slug generation parity; getDealBySlug; city sanitization; historical-low guard | R-RTE-1, R-RTE-2, R-SEC-4, R-ING-6 |
| C-alertsrepo | alerts.repo | `src/lib/db/alerts.repo.ts` | 0 | Live-path notify; decorated email CTA; locale in unsubscribe URL | R-MAIL-1, R-MAIL-2, R-MAIL-6, R-I18N-5 |
| C-unsub | Unsubscribe route | `src/app/api/alerts/unsubscribe/route.ts` | 0 | GET + POST one-click; idempotent delete; localized pages | R-MAIL-3, R-MAIL-4, R-I18N-5 |
| C-legal | Legal pages | `src/app/[locale]/{imprint,privacy,terms}/page.tsx` | 1 | getTranslations; 6-section privacy; real imprint data | R-I18N-2, R-COMP-1 |
| C-consent | CookieConsent (FOSS) | `src/components/consent/CookieConsent.tsx (NEW)` | 1 | vanilla-cookieconsent init; categories; equal-weight; re-open API | R-COMP-3, R-COMP-4, R-COMP-5 |
| C-footer | Footer | `src/components/layout/Footer.tsx` | 1 | 4 localized links incl. Cookie Settings re-open | R-COMP-4, R-COMP-6, R-I18N-4 |
| C-messages | Locale catalogs | `src/messages/*.json` | 1 | legal/unsubscribe/footer/badge/proof keys across 13 locales (machine-translated) | R-I18N-1, R-I18N-2, R-I18N-4, R-I18N-5, R-COMP-1 |
| C-dealpage | SSR deal page | `src/app/[locale]/deal/[slug]/page.tsx` | 2 | AggregateOffer+itemCondition JSON-LD; proof fields; hreflang; rel sponsored; localized chrome; badge | R-GEO-1, R-GEO-2, R-GEO-5, R-GEO-6, R-I18N-3, R-COMP-2, R-RTE-1 |
| C-dealcard | DealCard | `src/components/deals/DealCard.tsx` | 2 | SSR link; remove dead modal; visible affiliate badge | R-RTE-3, R-COMP-2 |
| C-badge | SponsoredBadge | `src/components/deals/SponsoredBadge.tsx` | 2 | Localized affiliate-disclosure badge (fix namespace) | R-COMP-2 |
| C-sitemap | Sitemap | `src/app/sitemap.ts` | 2 | Canonical LOCALES; Supabase slugs; hreflang; all countries | R-GEO-4 |
| C-robots | robots.txt | `public/robots.txt` | 2 | AI-bot allow groups; Disallow /api/; sitemap | R-GEO-3 |
| C-alertsapi | Alerts API | `src/app/api/alerts/route.ts` | 3 | Trusted-IP atomic rate limiting | R-MAIL-7 |
| C-redis | Redis layer | `src/lib/cache/redis.ts` | 3 | Atomic INCR/EXPIRE primitive; 30-min cache TTL; warn when unconfigured | R-MAIL-7, R-PERF-1, R-OPS-2 |
| C-postbacks | Postbacks route | `src/app/api/postbacks/route.ts` | 3 | Timing-safe auth; network-aware subID; status/commission validation; persist subid3/raw_payload; no PII | R-MON-2, R-MON-3, R-SEC-6 |
| C-crypto | Crypto util | `src/lib/utils/crypto.ts` | 3 | No default secret in prod; timing-safe compares | R-SEC-1, R-SEC-5 |
| C-affiliate | Affiliate util | `src/lib/utils/affiliate.ts` | 3 | Unified subID; lossless productId encoding | R-MON-1, R-MON-3 |
| C-strackr | StrackrProvider | `src/lib/providers/strackr.ts (NEW)` | 4 | Live Strackr fetch + normalization + mock fallback | R-ING-1 |
| C-registry | Provider registry | `src/lib/providers/registry.ts` | 4 | Register Strackr; explicit equal-price priority tie-break | R-ING-1, R-ING-3 |
| C-providers | Providers + ingest normalizers | `src/lib/providers/*.ts, scripts/ingest-awin.cjs` | 4 | Populate eanCode/gtin where exposed | R-ING-2 |
| C-refresh | Refresh route | `src/app/api/refresh/route.ts` | 4 | Bounded-concurrency fan-out; 90-day low; bearer auth | R-ING-8, R-ING-6, R-SEC-2 |
| C-retention | Retention job | `supabase/schema.sql + .github/workflows (NEW)` | 4 | Scheduled price_alerts purge | R-MAIL-5 |
| C-middleware | Middleware | `src/middleware.ts` | 5 | Edge geo + default DE; locale routing/detection | R-LOC-1, R-LOC-2 |
| C-migrate | Migration runner | `package.json script + .github/workflows (NEW)` | 5 | Reproducible schema apply + post-checks | R-OPS-1 |
| C-tests | Unit test suite | `vitest.config.ts + *.test.ts (NEW)` | 5 | vitest config + tests for pure logic | R-TEST-1 |
| C-lint | ESLint config | `.eslintrc.json (NEW)` | 5 | Committed next/core-web-vitals config | R-TEST-3 |
| C-build | Build/type gate | `(repo-wide)` | 5 | tsc + next build green | R-TEST-2, R-ING-7 |
| C-uxstates | Data-view states | `src/app/[locale]/{search,category}/*, src/components/deals/DealGrid.tsx` | 5 | Empty/loading/error states | R-UX-1 |
| C-a11y | Accessibility pass | `(UI-wide)` | 5 | axe-clean home + deal page | R-UX-2 |
