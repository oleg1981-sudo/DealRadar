# Requirements Document — Version 3 (Canonical)
## Project: DealRadar Headless Affiliate Aggregator, GEO & EU Compliance

**Traceability:** Every requirement in this document is traceable to the canonical [prd.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-06-23_v2/prd.md). PRD section references are noted in brackets.

---

## 1. Functional Requirements (EARS Notation)

### 1.1 Ingestion & Data Pipeline [PRD §5.1]

* **FR-ING-1 (Event-driven):** When the `/api/refresh` endpoint receives a valid POST request with `Bearer CRON_SECRET` authorization, the system shall fetch live deals from the Strackr API (endpoint TBD — verified in Phase 0).
  - **Acceptance:** Response from Strackr is parsed. On success, deals are passed to normalization. On failure, a `ProviderError` is thrown and logged; existing DB data remains intact.

* **FR-ING-2 (State-driven):** While importing deals from the API, the system shall normalize product details (name, prices, image URL, affiliate tracking link, network name, merchant name, EAN code) to fit the internal `NormalizedDeal` TypeScript interface.
  - **Acceptance:** All fields in `NormalizedDeal` are populated or explicitly set to `null`. No raw/untyped data passes through.

* **FR-ING-3 (Ubiquitous):** The system shall compute a dynamic discount percentage for each ingested deal based on `((original_price - sale_price) / original_price) * 100`, clamped to 0–100%.
  - **Acceptance:** The `computeDiscountPercent()` guard in `types.ts` is used. Negative or NaN percentages never render.

* **FR-ING-4 (Unwanted Behavior — Hybrid Deduplication):** If the system identifies a duplicate product (sharing the same EAN barcode, or matching cleaned name + merchant keys when EAN is absent) across multiple networks, then the system shall:
  1. Prefer the deal with the **lower sale price** (deepest discount).
  2. If sale prices are equal, prefer the network with the **highest priority** in the registry's priority order (Kelkoo > Tradedoubler > Awin).
  - **Acceptance:** Unit tests confirm: (a) EAN-based grouping produces correct survivors, (b) name+merchant fallback works when EAN is null, (c) price tiebreaker uses priority order, (d) the winner's productId is the one persisted.

* **FR-ING-5 (Event-driven):** When saving deals to the database, the system shall run a bulk upsert that inserts new deals and updates existing records by matching on the primary key `product_id`.
  - **Acceptance:** Supabase `.upsert()` is called with `onConflict: 'product_id'`. `ignoreDuplicates: false` ensures prices are updated.

* **FR-ING-6 (Event-driven — Price History Trigger):** When a deal's price is updated via upsert, the database trigger `trigger_record_price_history` shall automatically log a snapshot in the `price_history` table if the price changed OR if no snapshot exists for that product on the current calendar day.
  - **Acceptance:** After an upsert that changes `sale_price`, a new row appears in `price_history`. Unchanged prices on the same day do NOT create duplicate rows.

* **FR-ING-7 (State-driven — 90-Day Low Cache):** While executing the daily refresh, the system shall calculate and update the cached `historical_low_price` on the `deals` table for all deals based on a 90-day window query of the `price_history` table.
  - **Acceptance:** `historical_low_price` reflects the minimum `sale_price` from `price_history` WHERE `recorded_at >= NOW() - INTERVAL '90 days'`.

* **FR-ING-8 (Event-driven — Alert Dispatch):** When a deal's price drops below the user's subscribed alert price during ingestion, the system shall dispatch a price-drop email alert to the subscriber and mark the alert as notified.
  - **Acceptance:** `notifyPriceDrops()` sends email, flips `notified = true` and sets `notified_at`. Email contains visible unsubscribe link (see FR-COMP-3).

### 1.2 Tracking & Monetization [PRD §5.4]

* **FR-TRK-1 (Ubiquitous):** The system shall construct affiliate links with a programmatically appended single unified subID structured as `dealradar_${country}_${category}_${productId}` mapped to the network's custom tracking parameter:
  - Kelkoo: `custom1`
  - Awin: `clickref`
  - Tradedoubler: `epi`
  - **Acceptance:** Inspect the `href` of any outbound deal link in the rendered HTML. The URL contains the correct tracking parameter with the unified subID value.

* **FR-TRK-2 (Event-driven):** When the serverless postback listener (`/api/postbacks`) receives a transaction ping, the system shall:
  1. Validate `secret` query parameter against `WEBHOOK_SECRET`.
  2. Parse the subID to extract `productId`.
  3. Query `deals` for matching `product_id`.
  4. Insert a record into the `transactions` table.
  - **Acceptance:** POST with valid secret → 200 + row in `transactions`. POST with invalid/missing secret → 401. Malformed payload → 400.

### 1.3 Generative Engine Optimization (GEO) & SEO [PRD §5.2]

* **FR-GEO-1 (Ubiquitous):** The system shall output semantic `Product` and `AggregateOffer` schema markups (JSON-LD) on every SSR deal page, including `availability` (`https://schema.org/InStock`) and `itemCondition` (`https://schema.org/NewCondition`).
  - **Acceptance:** Paste page source into [Schema.org Validator](https://validator.schema.org/). Zero errors. `availability` and `itemCondition` present.

* **FR-GEO-2 (Ubiquitous):** The system shall inject "AI-Scrapable Proof Fields" on every deal page:
  - 90-day historic low price status (e.g., *"This product has reached its lowest price in 90 days on DealRadar."*)
  - Relative price comparison text.
  - Verification timestamp (e.g., *"Verified at 21:51 CET."*).
  - **Acceptance:** Visible text elements exist in the HTML containing price context and timestamp. Not hidden via CSS.

* **FR-GEO-3 (Ubiquitous):** The system shall expose a `robots.txt` that:
  - Allows AI search agents (`OAI-SearchBot`, `PerplexityBot`, `Google-Extended`).
  - Disallows all API routes: `Disallow: /api/`.
  - References the sitemap: `Sitemap: https://dealradar.app/sitemap.xml`.
  - **Acceptance:** `GET /robots.txt` returns the specified content. No API routes are crawlable.

* **FR-GEO-4 (Event-driven):** The system shall dynamically generate `/sitemap.xml` using Next.js `sitemap.ts` at the app root, yielding all static paths, active categories, and active deals with localized `hreflang` alternates.
  - **Acceptance:** `GET /sitemap.xml` returns valid XML. Entries include deal pages for all active deals across all supported locales.

### 1.4 Geolocation & Middleware Scoping [PRD §5.3]

* **FR-LOC-1 (Event-driven):** When a request lacks the `dr_location` cookie, the middleware shall resolve the visitor's country code using platform geo-forwarding headers and set the `dr_location` response cookie. The existing client-side `resolve.ts` chain remains as a fallback for non-edge environments.
  - **Acceptance:** On Netlify/Vercel: first visit sets `dr_location` cookie from headers. Locally: `resolve.ts` fallback chain works.

* **FR-LOC-2 (Unwanted Behavior):** If the resolved country is not supported, then the system shall write default country code `DE` to the `dr_location` cookie.
  - **Acceptance:** Request from unsupported country → `dr_location=DE%7C`.

### 1.5 Legal Compliance & Privacy [PRD §5.5]

* **FR-COMP-1 (Ubiquitous — Legal Pages):** The system shall display localized footer links to: **Imprint**, **Privacy Policy**, **Terms of Service**, and **Cookie Settings**.
  - **Acceptance:** Footer contains 4 links. Each navigates to the correct `/[locale]/...` page. Content renders in the current locale's language.

* **FR-COMP-2 (Ubiquitous — Affiliate Disclosure):** The system shall display a visible "Affiliate-Link" or "Werbung" badge adjacent to every outbound affiliate link on DealCard and the SSR deal detail page.
  - **Acceptance:** Visual inspection shows badge/tooltip next to every CTA button. Not just footer text.

* **FR-COMP-3 (Event-driven — Email Unsubscribe):** When a price alert email is dispatched:
  1. Email HTML footer contains a visible "Unsubscribe" link pointing to `/api/alerts/unsubscribe?email=...&productId=...&token=...`.
  2. `token` = `HMAC-SHA256(email:productId, CRON_SECRET)`.
  3. Email includes `List-Unsubscribe` and `List-Unsubscribe-Post` headers (RFC 8058).
  - **Acceptance:** Inspect raw email source. Visible unsubscribe link present. Headers present.

* **FR-COMP-4 (Event-driven — Erasure):** When the unsubscribe route receives a valid HMAC token, the system shall delete the matching subscription from `price_alerts`.
  - **Acceptance:** Valid token → row deleted + confirmation rendered. Invalid token → error rendered. Re-accessing same link → idempotent (no crash).

* **FR-COMP-5 (Event-driven — Rate Limiting):** Alert signup requests are rate-limited to 5/hour per IP via Upstash Redis.
  - **Acceptance:** 6th request within 1 hour from same IP → HTTP 429.

* **FR-COMP-6 (Ubiquitous — Cookie Consent):** The system shall display a cookie consent banner using `vanilla-cookieconsent` with categories: Essential (always on), Analytics (opt-in). Equal Accept/Reject options.
  - **Acceptance:** Incognito browser visit shows banner. No non-essential cookies set before consent. Preference persists across sessions.

---

## 2. Non-Functional Requirements [PRD §6]

### Performance & Caching
* **NFR-PERF-1:** Page response times ≤ 100ms via Upstash Redis caching (30-min TTL).
* **NFR-PERF-2:** Database queries use GIN/B-tree indices. No full-table scans on hot paths.
* **NFR-PERF-3:** `/api/refresh` completes within `maxDuration = 300` seconds.

### Security & Privacy
* **NFR-SEC-1:** `/api/refresh` requires `Bearer CRON_SECRET`. `/api/postbacks` requires `secret` query param = `WEBHOOK_SECRET`.
* **NFR-SEC-2:** RLS enabled on all tables. Service-role key used server-side only.
* **NFR-SEC-3:** Geo coordinates handled transiently. Never persisted.
* **NFR-PRIV-1:** `transactions` stores no PII. `price_alerts` implements automated GDPR deletion.

### Tech Stack Constraints
* **NFR-TECH-1:** Node.js 20, TypeScript.
* **NFR-TECH-2:** Supabase PostgreSQL.
* **NFR-TECH-3:** Next.js 14 App Router + `next-intl`.
* **NFR-TECH-4:** Upstash Redis (REST).
* **NFR-TECH-5:** Resend email API.
* **NFR-TECH-6:** Netlify deployment with `@netlify/plugin-nextjs`.
* **NFR-TECH-7:** FOSS solutions preferred over custom (CRITICAL PRAGMATISM).

---

## 3. Edge Cases & Assumptions

### Edge Cases
| Scenario | Expected Behavior |
|---|---|
| Strackr API unreachable (5xx/429) | `ProviderError` thrown. Log entry written. Existing DB rows remain intact. |
| No price change during upsert | `last_updated` updated. Trigger checks: same price + same day = no duplicate `price_history` row. |
| Missing EAN for duplicate deals | Deduplication falls back to `slugify(name)_slugify(merchant)` composite key. |
| Unsupported country code | System writes `DE` to `dr_location` cookie. |
| Deal hard-deleted by stale purge cron | `ON DELETE CASCADE` removes associated `price_history` rows. Document risk. |
| Invalid slug in deal page URL | `notFound()` called. Standard Next.js 404 rendered. |
| Unsubscribe link accessed twice | Second click is idempotent — no crash, no error. Alert already deleted. |

### Assumptions
1. `STRACKR_API_KEY` active with DACH/EU permissions.
2. Resend email sender verified for production domain.
3. Deployment platform supports geo-forwarding headers.
4. Legal counsel has approved Imprint/Privacy/Terms copy.

---

## 4. Success Metrics [PRD §10]

| Metric | Target | Method |
|---|---|---|
| AI Indexation | Citation growth from AI search engines within 90 days | Referral analytics |
| Core Web Vitals | LCP < 2.5s, CLS = 0.0 | Lighthouse/PageSpeed |
| Monetization | First `approved` transaction within 30 days of live activation | `transactions` table query |
| Compliance | Pass GDPR + Impressum manual audit | Checklist verification |
| Build Health | Zero TypeScript errors on `pnpm build` | CI exit code |
| Schema Validity | All deal pages pass Schema.org Rich Results Test | Automated validation |
