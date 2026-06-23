# Task Checklist: DealRadar Live Integration, Compliance & GEO - Version 2

This checklist breaks down the transition of DealRadar to the live Strackr API, database triggers, transactions tracking, sitemaps, edge middleware, GDPR compliance, and legal notice pages into granular, sequence-ordered development tasks.

---

## Phase 0: Research & Verification
- [ ] **Task 0.1: Verify Strackr API and image CDN**
  - *Action:* Confirm official Strackr publisher API endpoint schema for deals/offers, checking return fields for prices, EAN, network, and commission indicators. Determine Strackr's image CDN hostname.
  - *Verification:* Document the verified API URL and response shape in a text scratchpad.

---

## Phase 1: Database Schema Migration
- [ ] **Task 1.1: Add schema updates to supabase/schema.sql**
  - *Action:* Append new columns to `deals` table. Create `price_history` and `transactions` tables. Write the `record_price_history()` trigger function and bind it to `deals`. Add RLS statements and indexes on `slug`, `ean_code`, and foreign keys.
  - *Verification:* Check syntax correctness of the SQL script.
- [ ] **Task 1.2: Execute database schema migrations**
  - *Action:* Execute the SQL migration statements on the active Supabase PostgreSQL database.
  - *Verification:* Verify all tables (`price_history`, `transactions`) and columns exist, and the trigger function is registered.

---

## Phase 2: Core Types & Helpers
- [ ] **Task 2.1: Implement slug utility**
  - *Action:* Create `src/lib/utils/slug.ts` with a `slugify()` function that converts arbitrary strings to lowercase, diacritic-free, hyphenated tokens.
  - *Verification:* Execute a terminal script testing different inputs.
- [ ] **Task 2.2: Implement secure crypto helper**
  - *Action:* Create `src/lib/utils/crypto.ts` with helpers to generate and verify HMAC SHA-256 tokens for email unsubscribe actions, signed with `CRON_SECRET`.
  - *Verification:* Add a local test assertion verifying correct signature matching.
- [ ] **Task 2.3: Refactor affiliate URL decorator**
  - *Action:* Update `decorateAffiliateUrl` in `src/lib/utils/affiliate.ts` to programmatically build the unified parameter string: `dealradar_${country}_${category}_${productId}` and map it to the provider's standard tracking parameter.
  - *Verification:* Run type check to ensure compilation.
- [ ] **Task 2.4: Extend NormalizedDeal interface**
  - *Action:* Add `affiliateNetwork`, `merchantName`, `nativeProductId`, `eanCode`, `trackingUrl`, `description`, `historicalLowPrice`, and `slug` optional fields to `NormalizedDeal` in `src/lib/providers/types.ts`.
  - *Verification:* Run `pnpm tsc --noEmit` and assert no compilation errors.

---

## Phase 3: Repository & Registry Logic Updates
- [ ] **Task 3.1: Update deals.repo.ts mapping helpers**
  - *Action:* Update `toRow` and `fromRow` in `src/lib/db/deals.repo.ts` to map the new database columns.
  - *Verification:* Run `pnpm tsc --noEmit`.
- [ ] **Task 3.2: Implement slug detail lookup**
  - *Action:* Implement `getDealBySlug(slug: string): Promise<NormalizedDeal | null>` inside `src/lib/db/deals.repo.ts`.
  - *Verification:* Run tests asserting correct entity recovery.
- [ ] **Task 3.3: Implement daily historical price and cached low updates**
  - *Action:* In `/api/refresh` daily sync path, execute a batch query to recalculate the 90-day lowest price in `price_history` for active deals and write it to the `historical_low_price` cached column.
  - *Verification:* Verify that the cached column updates correctly after refresh execution.
- [ ] **Task 3.4: Implement Hybrid Deduplication in provider registry**
  - *Action:* In `src/lib/providers/registry.ts`, group fetched deals by EAN (or slugified name+merchant key if EAN is missing). For duplicates, retain the lowest `sale_price` (deepest discount), resolving ties by provider priority order.
  - *Verification:* Verify deduplication logic via unit tests.

---

## Phase 4: Strackr Provider Integration
- [ ] **Task 4.1: Create Strackr provider file**
  - *Action:* Create `src/lib/providers/strackr.ts` implementing `PriceProvider`. Conforms to registry contracts and handles real unified fetching using the verified schema.
  - *Verification:* Conform classes to `PriceProvider` contract.
- [ ] **Task 4.2: Register Strackr provider**
  - *Action:* Register the provider in `src/lib/providers/registry.ts` with high priority.
  - *Verification:* Verify fallback mock warnings when credentials are absent in dev mode.

---

## Phase 5: Geolocation & Webhook Postbacks
- [ ] **Task 5.1: Create edge geolocation resolver**
  - *Action:* Update `src/middleware.ts` to parse geo-headers and set the `dr_location` cookie.
  - *Verification:* Assert header forwarding and cookie output.
- [ ] **Task 5.2: Implement webhook postback endpoint**
  - *Action:* Create `src/app/api/postbacks/route.ts`. Parse commission pings, validate query parameter credentials (`secret`), extract product ID from the unified subID, and write to `transactions` table.
  - *Verification:* POST mock payload and verify table inserts.
- [ ] **Task 5.3: Add IP-based rate limiting to price alerts signup**
  - *Action:* Update `src/app/api/alerts/route.ts` to enforce a rate limit of 5 submissions/hour per IP via Upstash Redis.
  - *Verification:* Trigger multiple requests and verify it returns HTTP 429 after 5 hits.

---

## Phase 6: Pages, Routing, Legal & Compliance
- [ ] **Task 6.1: Create SSR Deal Details page**
  - *Action:* Create `src/app/[locale]/deal/[slug]/page.tsx`. Retrieve deal, output alternates, Schema.org JSON-LD markup, and call `notFound()` if deal doesn't exist.
  - *Verification:* Navigate to valid and invalid slugs and check page source and HTTP response status.
- [ ] **Task 6.2: Link cards to detail paths**
  - *Action:* Modify `src/components/deals/DealCard.tsx` and detail triggers to route to the static path `/[locale]/deal/[slug]` instead of a modal.
  - *Verification:* Click a deal card and assert routing transitions.
- [ ] **Task 6.3: Implement sitemap.ts**
  - *Action:* Create `src/app/sitemap.ts` at the root. Fetch active deals from Supabase, map locales, output alternates. Update `robots.txt` Sitemap entry.
  - *Verification:* Fetch `/sitemap.xml` and verify valid XML schema structure.
- [ ] **Task 6.4: Implement localized Legal Pages**
  - *Action:* Create:
    - `/imprint` -> `src/app/[locale]/imprint/page.tsx`
    - `/privacy` -> `src/app/[locale]/privacy/page.tsx`
    - `/terms` -> `src/app/[locale]/terms/page.tsx`
  - *Verification:* Verify pages render correctly with correct languages.
- [ ] **Task 6.5: Implement secure unsubscribe route**
  - *Action:* Create `/api/alerts/unsubscribe` route (`src/app/api/alerts/unsubscribe/route.ts`). Check HMAC token, delete subscriber row from `price_alerts`, and display localized confirmation.
  - *Verification:* Trigger with valid and invalid signatures; assert deletion and error checks.
- [ ] **Task 6.6: Add Legal links to Footer**
  - *Action:* Update `src/components/layout/Footer.tsx` to include localized routing links to the Imprint, Privacy, and Terms pages.
  - *Verification:* Inspect layout footer and verify navigation.

---

## Phase 7: Compilation & Validation
- [ ] **Task 7.1: Update environment variables template**
  - *Action:* Add `STRACKR_API_KEY` and `WEBHOOK_SECRET` to `.env.example`.
- [ ] **Task 7.2: Whitelist Strackr CDN in Next.js config**
  - *Action:* Update `next.config.mjs` image rules.
- [ ] **Task 7.3: Run production build**
  - *Action:* Run Next.js production build (`pnpm build` or `npm run build`) and verify it compiles with zero compilation errors.
