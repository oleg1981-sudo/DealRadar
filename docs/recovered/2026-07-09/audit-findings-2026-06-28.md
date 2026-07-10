# DealRadar — Ground-Truth Scope Audit (`2026-06-23_v2`)

> **RECOVERED FILE** — verbatim re-emission (2026-07-09) of `audit/findings.md` as read into session context on 2026-07-08, after the original was destroyed by a working-tree replacement. Its companion `audit/audit-plan.md` was never read into a surviving context and is NOT recoverable. Note: many findings below were subsequently remediated in commits `6dee1c9` + `91140c9` and/or by the 2026-06-28→2026-07-09 main-branch work — read this as the 2026-06-28 baseline, not current state.

**Date:** 2026-06-28 · **Method:** Forensic verification of the `docs/ground_source_of_truth/2026-06-23_v2` scope (prd/requirements/design/tasks + both spec-audit red-team reports) against the **actual executable code only**.

**Ground rules applied (per request):** `.md` files and code comments (`//`, `/* */`, `#`, `--`) were treated as **non-evidence**. Every status below is judged from real statements in `.ts/.tsx/.cjs/.mts/.sql/.json/config`. Coverage = 14 parallel slice-finders → independent adversarial re-verification of every actionable finding → completeness critic (false-negative hunt). 94 sub-agents, 139 findings, **77 confirmed / 2 refuted (retracted below)**. The S12 "security" slice failed structured output; its scope was reconstructed manually (see §6) and by GAP-6.

---

## 1. Verification ground truth (deterministic, run locally)

| Check | Command | Result |
|---|---|---|
| TypeScript | `tsc --noEmit` | **exit 0**, zero errors (Task 7.3 ✅ / NFR-TECH) |
| Production build | `next build` | **exit 0**, "Compiled successfully", 78/78 pages, **no warnings** (Task 7.3 ✅) |
| Mock fallback | build with empty env | all providers log mock + **no crash**; deal page is `ƒ` SSR, `sitemap.xml` + 13-locale legal pages generated (Task 7.4 ✅ for build path) |
| ESLint | `next lint` | **not configured** (prompts interactively; no eslint config in repo) |

The build is healthy. **The defects below are functional/compliance/correctness gaps that compile cleanly** — exactly why the `.md` "ALL FINDINGS RESOLVED" claim is misleading.

---

## 2. Deliverable scorecard (PRD §9 buckets, verified against code)

| ID | Deliverable | Verdict | Evidence |
|---|---|---|---|
| **U-1** | SSR Deal Page | 🔴 **Broken on live path** | Page renders, but `ingest-awin.cjs` writes `slug=NULL` → `getDealBySlug` (`deals.repo.ts:140`) never matches → **100% of live deal pages 404** (GAP-1) |
| **U-2** | Real-Time Prices | 🟠 Contingent | Real AWIN/Kelkoo/TD pipeline exists but **Strackr not built**; all live feeds credential-gated; refresh runs **daily**, not real-time |
| **U-3** | Price-Drop Alerts | 🔴 **Non-functional on live path** | `notifyPriceDrops` only called in `/api/refresh`, where AWIN returns `[]` → alerts never fire for ingested deals (GAP-2). Email template itself is correct (N-1 ✅) |
| **U-4** | Geo-Localized Content | 🟢 Implemented | `middleware.ts:8-32` edge-geo + `resolve.ts` fallback, default DE ✅ |
| **U-5** | Legal Pages | 🔴 **English-only** | imprint/privacy/terms hardcoded English, **zero i18n keys in all 13 locales**; privacy 5/6 sections (S13-legal-pages, S8) |
| **U-6** | Cookie Consent | 🟠 Deviated | Custom banner works but **not** spec's FOSS `vanilla-cookieconsent`; **no re-open/withdraw**; Accept/Reject not equal-weight |
| **U-7** | Affiliate Disclosure | 🔴 Missing on cards | `DealCard` CTA has **no visible badge**; `SponsoredBadge` is dead code (wrong namespace); deal-page label hardcoded English |
| **P-1** | SubID Tracking | 🟢 Implemented | `affiliate.ts:12-32` unified subID + correct param map ✅ |
| **P-2** | Postback Webhook | 🟠 Partial | Endpoint works but not timing-safe, reads `subid`/`clickref` not `subid3`, no status/commission validation, drops `subid3`/`raw_payload` |
| **P-3** | Schema.org Markup | 🟠 Partial | `availability` present but **`Offer` not `AggregateOffer`**, **`itemCondition` absent** (S-1 NOT fully resolved) |
| **P-4** | Dynamic Sitemap | 🔴 Broken | `se`≠`sv` (Swedish 404s), slug mismatch → deal URLs 404, **no hreflang**, DE-only, hits live APIs not Supabase |
| **P-5** | AI Proof Fields | 🔴 Missing | No 90-day-low statement, no verification timestamp anywhere on deal page (FR-GEO-2) |
| **P-6** | Price History | 🟢 Mostly | table + trigger + 90-day RPC wired (`refresh/route.ts:51`); trigger omits daily-fill branch |
| **V-1** | Deduplication | 🟠 Partial | Hybrid dedup correct, but **EAN branch is dead** — no provider/ingest sets `eanCode` → cross-merchant matching never happens |
| **V-2** | DB Migrations | 🟠 Partial | Schema present but deviates from design (different columns, weaker `transactions`); **no migration runner/CI** (Task 1.2 unverifiable) |
| **V-3** | API Security | 🟢 Sound core | Bearer auth, RLS on all 4 tables, server-only service role (GAP-6) ✅; hardening gaps below |
| **V-4** | GDPR Erasure | 🟠 Partial | Manual unsubscribe works; **one-click POST 405s** (no POST handler); **no automated retention** (NFR-PRIV-1) |
| **V-5** | Mock Fallback | 🟢 Implemented | every provider + repo degrade gracefully ✅ |
| **V-6** | Build Health | 🟢 Implemented | clean build ✅ |
| **V-7** | robots.txt | 🟠 Partial | `Disallow: /api/` + sitemap ✅; **missing explicit AI-bot Allow** groups |

---

## 3. P0 — Critical / production-breaking (block any "done"/launch claim)

### P0-1 · Live deal pages 404 — AWIN ingest writes `slug=NULL` (GAP-1)
- **Where:** `scripts/ingest-awin.cjs:116-134` (`normalizeRow` emits 17 cols, no `slug`); `deals.repo.ts:140` looks up by `slug`; `supabase/schema.sql:88,97` slug nullable, no backfill.
- **Impact:** The only writer of real production deals omits `slug`; every interactive `DealCard → /deal/[slug]` navigation 404s in production. Masked in dev because the mock path (`deals.repo.ts:138`) also matches `slugify(productName)`. **U-1, the flagship deliverable, is non-functional live.**
- **Fix:** Compute+persist `slug` in `normalizeRow` using the exact repo convention `${slugify(name)}-${productId.replace(/[^a-z0-9]/gi,'-')}`; also populate `ean_code` from the feed GTIN. Add a DB backstop: `slug NOT NULL` via a `BEFORE INSERT` trigger or generated default, plus a one-time backfill `UPDATE`.

### P0-2 · Price-drop alerts never fire for live deals (GAP-2)
- **Where:** `notifyPriceDrops` invoked only at `refresh/route.ts:43`; `awin.ts:45-48` returns `[]` when `AWIN_FEED_URL` set. No other caller (grep-confirmed).
- **Impact:** The live ingestion pipeline (`ingest-awin.cjs`) bypasses alert dispatch entirely → **U-3 / FR-ING-8 non-functional on the real data path** despite a correct email template + unsubscribe + rate limit.
- **Fix:** Run the alert pass against rows actually written — add a post-upsert notify step in the ingest pipeline (or a follow-on `/api/refresh-alerts` the Action calls) that re-reads pending `price_alerts` joined to the upserted `product_id`s and emails drops.

### P0-3 · One-click unsubscribe returns HTTP 405 (S9-oneclick-post / N-1 partial)
- **Where:** `alerts.repo.ts:80` advertises `List-Unsubscribe-Post: List-Unsubscribe=One-Click`; `alerts/unsubscribe/route.ts:7` exports **only GET**.
- **Impact:** Gmail/Yahoo bulk-sender one-click unsubscribe POSTs → 405 → user stays subscribed. RFC 8058 contract broken; bulk-sender compliance risk.
- **Fix:** Add `export async function POST(req)` sharing a verify+delete helper with GET; return 200, no redirect.

### P0-4 · Legal pages are English-only across all 13 locales (S13-legal-pages, S8-localized-content)
- **Where:** `imprint/page.tsx:1` imports `useTranslations` but never calls it (dead); `privacy/page.tsx`, `terms/page.tsx` don't import next-intl at all — 100% hardcoded English. No `imprint`/`privacy`/`terms` namespace in any `src/messages/*.json`.
- **Impact:** For a GDPR/Impressum-positioned EU product, `/de/privacy`, `/fr/privacy` etc. serve English. FR-COMP-1/U-5 "renders in the current locale's language" is **false**. (GDPR Art. 12 "clear and plain language".)
- **Fix:** Introduce `legal.imprint/privacy/terms` structured section keys; refactor the 3 pages to `getTranslations` + `setRequestLocale`; translate all 13 locales. **Legally-binding copy needs professional/legal review** (assumption #4 in requirements.md). Also: privacy is 5/6 sections (add Third-Party Processors + real Cookies section + dedicated Automated-Unsubscribe). Imprint legal data is placeholder (`BE 0123.456.789`) — must be real before launch.

---

## 4. P1 — High (core product thesis: GEO/SEO, compliance, security)

### GEO / SEO (the product's entire reason for being)
- **P1-1 · JSON-LD incomplete** (`deal/[slug]/page.tsx:35-53`): plain `Product`+`Offer`, **no `AggregateOffer`**, **no `itemCondition`** (S-1 only half-resolved). Fix to `AggregateOffer{lowPrice,highPrice,offerCount,availability}` + `Offer{itemCondition:NewCondition, priceSpecification}`.
- **P1-2 · AI proof fields missing** (P-5, FR-GEO-2): render visible "lowest price in 90 days" (drive from `deal.historicalLowPrice`) + "Verified at … CET" (`deal.lastUpdated`), as normal visible text (no `sr-only`), localized.
- **P1-3 · Sitemap Swedish `se`≠`sv`** (`sitemap.ts:8`): all `/se/*` URLs 404; real `sv` absent. Fix: `import { LOCALES } from '@/i18n/routing'`.
- **P1-4 · Sitemap deal slugs 404 in production** (`sitemap.ts:42`): emits `slugify(productName)` but Supabase stores `…-productId`. Source slug from Supabase, or mirror the repo's exact generation.
- **P1-5 · Sitemap no hreflang** (`sitemap.ts`): emit one entry per page with `alternates.languages` (+ `x-default`) instead of independent duplicates.
- **P1-6 · robots.txt missing AI-bot groups** (`public/robots.txt`): add explicit `OAI-SearchBot`, `PerplexityBot`, `Google-Extended` `Allow:` groups (the GEO thesis).
- **P1-7 · Deal-page CTA missing `rel`** (`deal/[slug]/page.tsx:116` = `rel="noopener noreferrer"`): add `nofollow sponsored` — the most SEO-important page leaks link equity (DealCard has it at `:93`).
- **P1-8 · Deal page chrome hardcoded English** despite existing `deal.*` keys: route via `getTranslations('deal')` (+ localize `generateMetadata`, add hreflang `alternates.languages`).

### Compliance
- **P1-9 · DealCard has no affiliate badge** (`DealCard.tsx:90-102`; N-3 **not** resolved): wire the orphaned `SponsoredBadge` (fix its namespace `'deals'→'deal'`, `SponsoredBadge.tsx`) adjacent to the CTA on every card; localize the deal-page label too.
- **P1-10 · No cookie re-open / withdrawal path** (`CookieBanner.tsx:24-34` shows only when `consent===null`; `Footer.tsx:14-16` has 3 links): add a "Cookie Settings" footer control that re-opens consent + a granular preferences view (GDPR Art. 7(3) withdrawal).
- **P1-11 · Cookie banner not equal-weight** (`CookieBanner.tsx:48-51`): Accept = primary CTA, Reject = muted outline → EDPB dark-pattern; give both identical weight.

### Security
- **P1-12 · HMAC fallback secret** (`crypto.ts:3` `|| 'dealradar-default-cron-secret'`): if `CRON_SECRET` unset, tokens are forgeable. Throw at load in production; keep dev fallback only.
- **P1-13 · Postback hardening** (`postbacks/route.ts:10,21-25`): non-constant-time secret compare; accepts `CRON_SECRET` fallback (conflates cron & financial-write auth); reads `subid`/`clickref` not `subid3` (Kelkoo/TD attribution silently fails); **no status-enum / commission-numeric validation** (DB also lacks the CHECKs). Use `timingSafeEqual`, require `WEBHOOK_SECRET`, validate, network-aware subID parse.
- **P1-14 · Rate-limit bypass** (`alerts/route.ts:16,18,46`): trusts leftmost `X-Forwarded-For` (spoofable) and uses non-atomic GET-then-SET (race; TTL resets each write). Use the trusted edge IP and atomic `INCR`+`EXPIRE` (or `@upstash/ratelimit`).
- **P1-15 · PostgREST filter injection** (`deals.repo.ts:84`): user-controllable `city` (from `dr_location` cookie) is string-interpolated into `.or(\`city.eq.${city},city.is.null\`)` without the sanitization applied to search tokens (`:90-91`). Sanitize/encode `city` or use parameterized filters.

---

## 5. P2 — Medium / Low (correctness, robustness, spec conformance, hygiene)

- **Schema vs design drift** (`schema.sql:87-95`): different 8 columns than design §2.2 (internally consistent across types/repo, so functional — but reconcile design ↔ code). `transactions` missing FK / `subid3` / `raw_payload` / `received_at` / CHECKs (`S1-transactions-table`).
- **Trigger daily-fill branch missing** (`schema.sql:127-136`): unchanged-price days record no snapshot; `<>` not NULL-safe. Add `is distinct from` + `not exists … today` branch.
- **EAN dedup branch dead** (V-1): populate `eanCode` in providers + ingest so cross-merchant matching actually runs.
- **NFR-PRIV-1 no automated retention** (GAP-3): only manual unsubscribe; add scheduled purge of stale/notified `price_alerts` + document in privacy policy.
- **Task 1.2 not reproducible** (GAP-7): no migration runner/CI; add `supabase db push` job or versioned migrations.
- **Refresh serial fan-out** (`refresh/route.ts:36-49`): 160 country×category passes serially in one 300s function — fine on mock, risk of timeout under live latency; bound concurrency / shard.
- **Sitemap hits live APIs not Supabase** (`sitemap.ts:40`) and is DE-only/200-cap; read from Supabase across countries.
- **Unsubscribe pages hardcoded English** (`alerts/unsubscribe/route.ts:16-43`): pass `&locale=` and localize.
- **Footer labels hardcoded English** (`Footer.tsx:14-16`): add `footer.imprint/privacy/terms/cookieSettings` keys.
- **Email CTA uses raw `shopUrl`** (`alerts.repo.ts:102`): price-drop email "View the deal" link is **not** decorated → affiliate attribution lost on email clicks. Use `decorateAffiliateUrl`.
- **AWIN ingest reimplements discount math** (`ingest-awin.cjs:109`) instead of `computeDiscountPercent` (GAP-4) — bounded by DB CHECK, harmless; document or share.
- **Strackr config dead** (`.env.example:36-37`, `next.config.mjs:15` `**.strackr.com`): either implement the provider or remove dead config (see Decision A).
- **`historicalLowPrice===0` collapses to null** in `fromRow` (`deals.repo.ts:49`): use `!= null` check.

---

## 6. Verified-correct (spec claims that genuinely hold in code)

slugify NFD/collapse/trim (`slug.ts`) · HMAC timing-safe verify (`crypto.ts:16-25`) · unified subID + param map (`affiliate.ts`) · `computeDiscountPercent` clamp (`types.ts:111`) · `toRow/fromRow` round-trip + `getDealBySlug` + 90-day RPC wiring (`deals.repo.ts`) · hybrid-dedup core minus EAN (`registry.ts:90-105`) · `notFound()` (M-8, `deal/[slug]/page.tsx:30`) · middleware edge-geo + default DE (FR-LOC, `middleware.ts`) · alert email **unsubscribe link + List-Unsubscribe headers** (N-1 GET path, `alerts.repo.ts:71-103`) · rate limit 5→429 (`alerts/route.ts`) · Redis 30-min cache on `/api/deals` (NFR-PERF-1) · `maxDuration=300` (`refresh/route.ts:19`) · graceful degradation everywhere · **NFR-SEC-1/2/3: Bearer auth + RLS on all 4 tables + server-only service role + transient geo** (GAP-6) · escapeHtml in email (`alerts.repo.ts:107`) · daily cron schedules (D-2; `refresh-deals.mts:33`, `ingest-awin.yml:18`) · `.env.example` has both new vars (Task 7.1) · build clean (Task 7.3).

## 7. Retracted false positives (adversarially refuted — NOT issues)

- **Mixed-case email breaks unsubscribe** — *retracted*: signup lowercases+trims (`alerts/route.ts:31`), token + delete both use lowercased email → consistent.
- **U-2 "default deployment is all mock"** (S4-u2-default-mock) — *downgraded to expected*: pre-launch credential-gated state, not a code defect (affiliate approval required). Track "live feed active" as a launch checklist item.
- **Deal-page `hreflang` "missing" as High** (S6-meta-hreflang) — *downgraded to Low*: canonical is correct; hreflang is an enhancement (covered by P1-5/P1-8).

---

*The companion `audit/audit-plan.md` (prioritized, execution-ready fix plan and sequencing) was NOT recoverable.*
