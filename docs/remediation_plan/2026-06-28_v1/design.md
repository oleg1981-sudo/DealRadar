# DealRadar Remediation — Design

> Step 5 of the planning pipeline. Every component traces to ≥1 requirement (machine-checked: 0 components without a requirement). Component inventory is rendered from `plan.json`.

## 1. Context & architecture (unchanged backbone; targeted changes)

```
                 ┌─────────────── scheduled (daily) ───────────────┐
                 │                                                  │
   GitHub Action │  scripts/ingest-awin.cjs ──► Supabase (deals)    │  Netlify fn ──► POST /api/refresh
   (AWIN feed)   │     + slug + ean (NEW)        + price_history    │   (Kelkoo/TD/Strackr via registry)
                 │     + live-path notify (NEW)  + transactions     │       + 90-day low + notify
                 └──────────────────────┬───────────────────────────┘
                                        ▼
  Visitor ──► next-intl middleware (edge geo + locale) ──► [locale] pages (SSR)
                                        │                      ├─ grid/card ──► /deal/[slug] (SSR, JSON-LD, proof, badge)
                                        │                      ├─ legal pages (localized)
                                        │                      └─ Footer (4 links) + CookieConsent (FOSS)
                                        ▼
            /api/deals (Redis cache 30m) · /api/alerts (rate limit) · /api/alerts/unsubscribe (GET+POST)
            · /api/postbacks (timing-safe) · /api/refresh (Bearer)
```

**Design decision — fix the live writer, not just the request path.** The audit's two critical defects (slug-null, alert bypass) both live in `scripts/ingest-awin.cjs`, the *out-of-band* writer the request-path code never touches. The remediation therefore treats the ingest script as a first-class component (C-ingest, phase 0), not a script afterthought. This is the single most important architectural correction.

**Stack/tooling choices (justified, current facts verified via `npm view`):**
- **Consent: `vanilla-cookieconsent@3.1.0` (MIT)** over the custom banner — satisfies NFR-TECH-7 (FOSS), and provides granular categories, a `showPreferences()` re-open API, consent versioning/expiry, and equal-weight layouts out of the box (the three compliance gaps the custom banner has). Alternative (harden custom) rejected per Decision B: more code to reach parity, no versioning.
- **Rate limit: `@upstash/ratelimit@2.0.8` (MIT)** (or a hand-rolled atomic `INCR`+`EXPIRE` in `redis.ts`) over the current GET-then-SET — eliminates the TOCTOU race and TTL-reset bug deterministically.
- **Tests: `vitest@4.1.9` (MIT)** — native ESM/TS, zero-config with the existing toolchain; the repo currently has no runner (Task 3.4's mandated unit tests are unmet).
- **Strackr provider** mirrors the existing `kelkoo.ts` shape (PriceProvider contract) — no new abstraction (N1).

## 2. Core flows (changed paths)

**Live deal → page (fixes GAP-1):** ingest `normalizeRow()` computes `slug = slugify(name)+'-'+sanitize(productId)` (identical to `deals.repo.toRow()`), persists it + `ean_code`; DB enforces `slug NOT NULL` (BEFORE-INSERT default as backstop) and a one-time backfill covers legacy rows. `getDealBySlug(slug)` then resolves every live deal → HTTP 200.

**Live drop → alert (fixes GAP-2):** after the ingest upsert, a notify step re-reads pending `price_alerts` for the upserted `product_id`s and calls the existing `notifyPriceDrops` path (email already correct: visible link + List-Unsubscribe). One-click POST handler added to the unsubscribe route (shared verify+delete with GET).

**Postback (hardens P-2):** `secret` compared with `timingSafeEqual` against `WEBHOOK_SECRET` (no CRON fallback grant); `subid3`/network-aware field parsed case-insensitively; `status`∈enum and `commission`≥0 validated (400 otherwise); `subid3` + `raw_payload` persisted; productId encoding made lossless so it round-trips.

**Consent (fixes U-6):** `CookieConsent.tsx` initializes `vanilla-cookieconsent` (`necessary` read-only on, `analytics` default off) in the root layout; Footer "Cookie Settings" calls `showPreferences()`; no non-essential cookie before Accept; Accept/Reject equal-weight.

## 3. Data model & schema changes (`supabase/schema.sql`)

- `deals.slug`: add `NOT NULL` guarantee (BEFORE-INSERT trigger default using the canonical rule) + one-time backfill `UPDATE … WHERE slug IS NULL`. Keep the partial unique index. (R-RTE-2)
- `price_history` trigger `record_price_history()`: add the "no snapshot today" branch and use `IS DISTINCT FROM` (NULL-safe). (R-ING-5)
- `transactions`: add `product_id` FK `ON DELETE SET NULL`, `subid3 text`, `raw_payload jsonb`, `received_at timestamptz`, `CHECK (commission_earned >= 0)`, `CHECK (status IN ('pending','approved','declined','paid'))`. Confirm **no PII columns** (R-MON-4, R-SEC-6).
- Indexes (confirm/keep): `deals(country,discount_percent)`, `deals(country,category,discount_percent)`, `deals(slug)`, `deals(ean_code)`, `price_history(product_id,recorded_at)`, `transactions(product_id)`. (R-PERF-2)
- RLS enabled on all 4 tables; service-role only (no policies = deny-all to anon). (R-SEC-3)
- All DDL idempotent (`IF NOT EXISTS` / `OR REPLACE`) so the migration runner (R-OPS-1) can re-apply safely.

`NormalizedDeal` (types.ts) is internally consistent with the schema (`upc_code/mpn/model_number/merchant_id/affiliate_subid`); we **reconcile the design-doc drift** by documenting the chosen column set as canonical (not reverting to design §2.2 names) and ensure `eanCode` is now actually populated (R-ING-2).

## 4. Interfaces & contracts (key)

- `decorateAffiliateUrl(url, source, country, category, productId)` → unchanged signature; productId encoding made reversible so the postback parser recovers the exact id (round-trip property, unit-tested). (R-MON-1/3)
- Unsubscribe URL contract: `…/api/alerts/unsubscribe?email&productId&token&locale`; GET renders localized page, POST (one-click, RFC 8058) returns 200. (R-MAIL-3/4, R-I18N-5)
- JSON-LD contract (deal page): `Product` → `AggregateOffer { priceCurrency, lowPrice, highPrice, offerCount, availability }` → `offers[] { price, priceCurrency, availability, itemCondition=NewCondition, url, seller, priceSpecification }`. (R-GEO-1)
- Sitemap entry contract: one entry per logical page with `alternates.languages` (13 + `x-default`); deal slugs sourced from Supabase. (R-GEO-4)
- Consent API: `showPreferences()` re-open; categories `{ necessary: {enabled:true, readOnly:true}, analytics: {enabled:false} }`. (R-COMP-3/4/5)

## 5. Error handling & degradation
- Mock fallback preserved on empty `.env` (R-ING-7): each integration returns mock/no-op + a **structured named warning** (R-OPS-2), including the rate limiter when Redis is absent (currently silent).
- Fail-closed auth: `/api/refresh` and `/api/postbacks` return 401 when their secret is unset (no default-secret bypass — R-SEC-1).
- Ingest robustness: a per-row normalization error skips the row with a logged reason; a feed-level failure leaves existing DB rows intact (ProviderError semantics).
- Idempotency: unsubscribe (delete idempotent), upserts (`onConflict`), and migrations (idempotent DDL).

## 6. Testing strategy
- **Unit (vitest):** `slugify` edge cases; HMAC token gen/verify round-trip + tamper; `decorateAffiliateUrl`→postback-parse round-trip (incl. ids with `:` and `-`); dedup 3 cases (EAN survivor, name+merchant fallback, price-tie→priority). (R-TEST-1)
- **Integration/E2E (scripted):** spine smoke (T0.5) — ingest → deal page 200 → alert email → POST unsubscribe; bogus slug → 404.
- **Static gates:** `tsc --noEmit`, `next build` (no new warnings), `next lint` (config added), `validate_plan.mjs` (plan integrity), i18n key-parity script. (R-TEST-2/3, R-I18N-1)
- **Manual/tooled:** Google Rich Results Test (SC5), axe scan home+deal page (R-UX-2).

## 7. Component inventory

<!-- Rendered from plan.json via render_docs.mjs (_components_table.md). Re-render if plan.json changes. -->

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
