# Task Checklist — Version 3 (Canonical)
## DealRadar: Live Integration, GEO, Compliance & EU Legal

**Traceability:** Every task traces to a requirement in [requirements.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-06-23_v2/requirements.md) and a design in [design.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-06-23_v2/design.md).

**Executor Guardrails:**
1. **No Vibe Coding.** Every code change MUST reference a specific task ID and conform to design.md.
2. **Verify Before Proceeding.** Each task has explicit verification steps. Do NOT mark complete without running them.
3. **Mock Fallback Preserved.** No change may break the app when API keys are absent. Test with empty `.env.local`.
4. **Incremental Builds.** Run `pnpm tsc --noEmit` after every TypeScript change. Fix errors before proceeding.
5. **Existing Tests Pass.** If any existing tests exist, they must still pass after changes.

---

## Phase 0: Research & Verification

- [ ] **Task 0.1: Verify Strackr API schema** [FR-ING-1, design.md §3.1]
  - *Action:* Read the official Strackr publisher API documentation. Confirm:
    1. The actual endpoint URL for fetching deals/offers.
    2. The exact JSON response field names and nesting structure.
    3. Pagination method (cursor, offset, page).
    4. Rate limits and authentication mechanism.
    5. Image CDN hostname(s) used in response `image` fields.
  - *Expected Output:* A scratch document recording the verified endpoint URL, full response schema, and CDN hostname.
  - *Verification:* The documented endpoint and schema replace the provisional examples in design.md §3.1 before any code is written.
  - *Anti-Hallucination Guard:* Do NOT fabricate field names. If documentation is unclear, document the ambiguity and request clarification.

---

## Phase 1: Database Schema Migration

- [ ] **Task 1.1: Append schema migration SQL** [FR-ING-5, FR-ING-6, FR-TRK-2, design.md §2.1]
  - *File:* `supabase/schema.sql`
  - *Action:* Append the incremental SQL from design.md §2.1:
    1. ALTER `deals` table: add 8 new columns.
    2. Generate slugs for existing records.
    3. Add `unique_deal_slug` constraint.
    4. CREATE `price_history` table with FK, CHECK constraint, and trigger.
    5. CREATE `transactions` table with UNIQUE, CHECK, RLS.
    6. CREATE indexes on `slug`, `ean_code`, `price_history(product_id)`, `transactions(product_id)`.
    7. CREATE `record_price_history()` trigger function.
    8. BIND trigger to `deals` table.
  - *Verification:*
    - [ ] SQL syntax check: `SELECT 1;` at the end of each statement block.
    - [ ] No column name conflicts with existing `deals` columns (verify against schema.sql lines 6-24).
    - [ ] `last_updated` is NOT added (it already exists — the source PRD's `updated_at` maps to this).

- [ ] **Task 1.2: Execute migration on Supabase** [FR-ING-6, FR-TRK-2]
  - *Action:* Run the migration SQL in the Supabase SQL Editor or via `supabase db push`.
  - *Verification:*
    - [ ] `SELECT * FROM information_schema.columns WHERE table_name = 'deals'` includes all 8 new columns.
    - [ ] `SELECT * FROM information_schema.tables WHERE table_name IN ('price_history', 'transactions')` returns 2 rows.
    - [ ] `SELECT tgname FROM pg_trigger WHERE tgname = 'trigger_record_price_history'` returns 1 row.

---

## Phase 2: Core Types & Helpers

- [ ] **Task 2.1: Create slug utility** [FR-RTE-1, design.md §1]
  - *File:* `src/lib/utils/slug.ts` [NEW]
  - *Action:* Implement `slugify(input: string): string` that:
    1. Converts to lowercase.
    2. Removes diacritics (e.g., ü → u, é → e) via `normalize('NFD').replace(/[\u0300-\u036f]/g, '')`.
    3. Replaces non-alphanumeric characters with hyphens.
    4. Collapses consecutive hyphens.
    5. Trims leading/trailing hyphens.
  - *Verification:*
    - [ ] `slugify('Samsung Galaxy S24 Ultra™')` → `'samsung-galaxy-s24-ultra'`
    - [ ] `slugify('Ärmel über Nüsse')` → `'armel-uber-nusse'`
    - [ ] `slugify('---test---')` → `'test'`

- [ ] **Task 2.2: Create crypto helper** [FR-COMP-3, FR-COMP-4, design.md §3.4]
  - *File:* `src/lib/utils/crypto.ts` [NEW]
  - *Action:* Implement:
    - `generateUnsubscribeToken(email: string, productId: string): string` — HMAC SHA-256 of `email:productId` signed with `CRON_SECRET`.
    - `verifyUnsubscribeToken(email: string, productId: string, token: string): boolean` — timing-safe comparison.
  - *Verification:*
    - [ ] `generateUnsubscribeToken('a@b.com', 'kelkoo:123')` returns a 64-char hex string.
    - [ ] `verifyUnsubscribeToken('a@b.com', 'kelkoo:123', correctToken)` returns `true`.
    - [ ] `verifyUnsubscribeToken('a@b.com', 'kelkoo:123', 'bad')` returns `false`.

- [ ] **Task 2.3: Refactor affiliate URL decorator** [FR-TRK-1, design.md §3.3]
  - *File:* `src/lib/utils/affiliate.ts` [MODIFY]
  - *Action:* Update `decorateAffiliateUrl()` signature to accept `country`, `category`, and `productId`. Build unified subID: `dealradar_${country}_${category}_${productId}`. Map to network's param name.
  - *Current code reference:* Lines 6-9 define `SUBID_PARAM` (correct). Line 17 appends static `'dealradar'` (must be replaced with unified subID).
  - *Verification:*
    - [ ] `decorateAffiliateUrl('https://track.awin.com/click?m=1', 'awin', 'DE', 'electronics', 'awin:67890')` → URL contains `clickref=dealradar_DE_electronics_awin%3A67890`.
    - [ ] `pnpm tsc --noEmit` passes.

- [ ] **Task 2.4: Extend NormalizedDeal interface** [FR-ING-2, design.md §2.2]
  - *File:* `src/lib/providers/types.ts` [MODIFY]
  - *Action:* Add 8 optional fields to `NormalizedDeal` interface (see design.md §2.2).
  - *Verification:*
    - [ ] `pnpm tsc --noEmit` passes with zero errors.
    - [ ] Existing provider implementations (kelkoo.ts, awin.ts, tradedoubler.ts, dummyjson.ts, idealo.mock.ts) still compile without changes.

---

## Phase 3: Repository & Registry Logic Updates

- [ ] **Task 3.1: Update deals.repo.ts column mapping** [FR-ING-5, design.md §2]
  - *File:* `src/lib/db/deals.repo.ts` [MODIFY]
  - *Action:* Update `toRow()` and `fromRow()` functions to map the 8 new columns.
  - *Verification:*
    - [ ] `pnpm tsc --noEmit` passes.
    - [ ] Round-trip: `fromRow(toRow(deal))` preserves all new fields.

- [ ] **Task 3.2: Implement getDealBySlug()** [FR-RTE-2, design.md §4.1]
  - *File:* `src/lib/db/deals.repo.ts` [MODIFY]
  - *Action:* Add `getDealBySlug(slug: string): Promise<NormalizedDeal | null>` that queries `deals` WHERE `slug = $1`, returns null if not found.
  - *Verification:*
    - [ ] With Supabase configured: returns deal for valid slug, null for invalid.
    - [ ] Without Supabase: returns null (graceful degradation).

- [ ] **Task 3.3: Implement 90-day historical low calculation** [FR-ING-7, design.md §2.1]
  - *File:* `src/app/api/refresh/route.ts` [MODIFY]
  - *Action:* After the main upsert loop, execute a batch SQL query:
    ```sql
    UPDATE deals d SET historical_low_price = sub.min_price
    FROM (
      SELECT product_id, MIN(sale_price) AS min_price
      FROM price_history
      WHERE recorded_at >= NOW() - INTERVAL '90 days'
      GROUP BY product_id
    ) sub
    WHERE d.product_id = sub.product_id;
    ```
  - *Verification:*
    - [ ] After refresh, `deals.historical_low_price` reflects the minimum from `price_history` within 90 days.

- [ ] **Task 3.4: Implement Hybrid Deduplication** [FR-ING-4, design.md §4.2]
  - *File:* `src/lib/providers/registry.ts` [MODIFY]
  - *Action:* In `fetchDealsAcrossProviders()`, after collecting all deals from all providers, apply the deduplication logic from design.md §4.2:
    1. Group by EAN (if present) or `slugify(name)_slugify(merchant)`.
    2. Keep lowest `salePrice`.
    3. Break ties by provider `priority` (lower number wins).
  - *Current code reference:* Lines 73-84 currently deduplicate by `productId` only (Set-based). This must be replaced with the EAN/name+merchant grouping strategy.
  - *Verification:*
    - [ ] Unit test: two deals with same EAN, different prices → only lowest survives.
    - [ ] Unit test: two deals with null EAN, same name+merchant, same price → provider priority breaks tie.
    - [ ] Unit test: two deals with different EANs → both survive.

---

## Phase 4: Strackr Provider Integration

- [ ] **Task 4.1: Create Strackr provider** [FR-ING-1, FR-ING-2, design.md §3.1]
  - *File:* `src/lib/providers/strackr.ts` [NEW]
  - *Action:* Implement `StrackrProvider` conforming to the `PriceProvider` interface:
    - `id: 'strackr'`
    - `init()`: check `STRACKR_API_KEY` env var. Return `{ ok: false, isMock: true }` with warning if absent.
    - `fetchDeals()`: call verified Strackr endpoint. Map response to `NormalizedDeal[]`.
  - *Dependency:* Task 0.1 MUST be completed first (verified API schema).
  - *Verification:*
    - [ ] `pnpm tsc --noEmit` passes.
    - [ ] With key absent: `init()` returns `isMock: true`, `fetchDeals()` is never called.
    - [ ] With key present: `fetchDeals()` returns normalized deals.

- [ ] **Task 4.2: Register Strackr provider** [FR-ING-1]
  - *File:* `src/lib/providers/registry.ts` [MODIFY]
  - *Action:* Import `StrackrProvider` and add to `ALL_PROVIDERS` array with appropriate priority.
  - *Verification:*
    - [ ] `pnpm dev` starts without errors.
    - [ ] Console shows mock warning for Strackr when key is absent.

---

## Phase 5: Geolocation, Webhooks & Rate Limiting

- [ ] **Task 5.1: Add edge geo-header parsing to middleware** [FR-LOC-1, FR-LOC-2, design.md §1 Architecture Decision]
  - *File:* `src/middleware.ts` [MODIFY]
  - *Action:* Wrap `intlMiddleware` to:
    1. Check if `dr_location` cookie exists on the request.
    2. If absent: read `X-NF-Country` (Netlify) or `x-vercel-ip-country` (Vercel) header.
    3. Validate against `isSupportedCountry()`.
    4. Set `dr_location` response cookie with the resolved or default (`DE`) country code.
    5. Forward to `intlMiddleware`.
  - *Important:* Do NOT remove `resolve.ts` — it remains the client-side fallback (see design.md §1 Architecture Decision).
  - *Verification:*
    - [ ] Locally (no headers): `resolve.ts` chain still works.
    - [ ] Simulated Netlify header `X-NF-Country: FR` → `dr_location` cookie set to `FR|`.

- [ ] **Task 5.2: Create postback webhook endpoint** [FR-TRK-2, design.md §3.2]
  - *File:* `src/app/api/postbacks/route.ts` [NEW]
  - *Action:* Implement POST handler:
    1. Validate `secret` query parameter against `WEBHOOK_SECRET`.
    2. Parse JSON body for `transaction_id`, `commission_earned`, `status`, `subid3`.
    3. Split `subid3` to extract `productId`.
    4. Insert into `transactions` table via Supabase.
    5. Return 200 on success, 401 on invalid secret, 400 on bad payload.
  - *Verification:*
    - [ ] `curl -X POST '/api/postbacks?secret=VALID' -d '{"transaction_id":"tx1","commission_earned":10,"status":"pending","subid3":"dealradar_DE_electronics_kelkoo:123"}'` → 200.
    - [ ] `curl -X POST '/api/postbacks?secret=INVALID' -d '{}'` → 401.
    - [ ] Row appears in `transactions` table with correct `product_id`.

- [ ] **Task 5.3: Add rate limiting to price alerts signup** [FR-COMP-5, design.md §3.6]
  - *File:* `src/app/api/alerts/route.ts` [MODIFY]
  - *Action:* Before the `createPriceAlert()` call:
    1. Extract client IP from request headers (`x-forwarded-for` or `req.ip`).
    2. Use Upstash Redis: GET `ratelimit:alerts:${ip}`.
    3. If count ≥ 5 → return 429.
    4. Otherwise → INCR with `EX 3600` TTL.
  - *Graceful Degradation:* If Redis is not configured, skip rate limiting (log warning).
  - *Verification:*
    - [ ] Send 5 requests → all return 200.
    - [ ] Send 6th request → returns 429.
    - [ ] Without Redis env vars: all requests pass (no crash).

---

## Phase 6: Pages, Routing, Legal & Compliance

- [ ] **Task 6.1: Create SSR Deal Detail page** [FR-RTE-1, FR-RTE-2, FR-GEO-1, FR-GEO-2, design.md §4.1]
  - *File:* `src/app/[locale]/deal/[slug]/page.tsx` [NEW]
  - *Action:* Implement as specified in design.md §4.1:
    1. `generateMetadata()`: title, description, canonical alternate links.
    2. `getDealBySlug()` → `notFound()` if absent.
    3. JSON-LD `<script>` block with `Product`, `AggregateOffer`, `availability`, `itemCondition`.
    4. AI-Scrapable Proof Fields: "Lowest price in 90 days" text, verification timestamp.
    5. Visible affiliate badge adjacent to the CTA button.
  - *Verification:*
    - [ ] Navigate to `/en/deal/valid-slug` → page renders with all metadata.
    - [ ] Navigate to `/en/deal/nonexistent` → 404 page.
    - [ ] View page source → valid JSON-LD block with `availability` and `itemCondition`.
    - [ ] Affiliate badge is visible next to the CTA link.

- [ ] **Task 6.2: Migrate DealCard from modal to SSR routing** [FR-RTE-1, FR-COMP-2]
  - *File:* `src/components/deals/DealCard.tsx` [MODIFY]
  - *Action:*
    1. Replace modal trigger with `<Link href={/[locale]/deal/[slug]}>` navigation.
    2. Add visible "Affiliate-Link" / "Werbung" badge adjacent to the outbound CTA button.
  - *Sub-action:* After SSR page is confirmed working, DELETE `src/components/deals/DealDetailModal.tsx`.
  - *Verification:*
    - [ ] Click deal card → navigates to `/[locale]/deal/[slug]`.
    - [ ] Affiliate badge visible on every deal card.
    - [ ] `DealDetailModal.tsx` deleted and no import references remain.

- [ ] **Task 6.3: Create sitemap.ts and robots.txt** [FR-GEO-3, FR-GEO-4, design.md §4.5]
  - *Files:* `src/app/sitemap.ts` [NEW], `public/robots.txt` [NEW]
  - *Action:*
    1. `sitemap.ts`: Query all active deals from Supabase. Map across all locales. Output with `hreflang` alternates. Include static pages (home, categories, legal pages).
    2. `robots.txt`: Copy content from design.md §4.5.
  - *Verification:*
    - [ ] `GET /sitemap.xml` returns valid XML with deal entries.
    - [ ] `GET /robots.txt` contains `Disallow: /api/` and `Sitemap:` directive.

- [ ] **Task 6.4: Create localized Legal Pages** [FR-COMP-1, design.md §4.3]
  - *Files:* [NEW]
    - `src/app/[locale]/imprint/page.tsx`
    - `src/app/[locale]/privacy/page.tsx`
    - `src/app/[locale]/terms/page.tsx`
  - *Action:* Implement as specified in design.md §4.3. Use `useTranslations()` for localized content. Add message keys to locale JSON files.
  - *Verification:*
    - [ ] Navigate to `/en/imprint`, `/de/imprint`, etc. Content renders.
    - [ ] Navigate to `/en/privacy` → all 6 sections present.
    - [ ] Navigate to `/en/terms` → all 4 sections present.

- [ ] **Task 6.5: Create unsubscribe endpoint** [FR-COMP-3, FR-COMP-4, design.md §3.4]
  - *File:* `src/app/api/alerts/unsubscribe/route.ts` [NEW]
  - *Action:* Implement GET handler:
    1. Parse query params: `email`, `productId`, `token`.
    2. Verify token via `verifyUnsubscribeToken()`.
    3. On valid: delete row from `price_alerts` WHERE `email` AND `product_id`.
    4. Render localized confirmation HTML.
    5. On invalid: render error HTML.
    6. Idempotent: if row already deleted, still render success.
  - *Verification:*
    - [ ] Valid token → row deleted + confirmation page.
    - [ ] Invalid token → error page (no deletion).
    - [ ] Same link clicked twice → no crash, success on both.

- [ ] **Task 6.6: Update email template with unsubscribe link** [FR-COMP-3, design.md §3.5]
  - *Files:* `src/lib/db/alerts.repo.ts` [MODIFY], `src/lib/email/send.ts` [MODIFY]
  - *Action:*
    1. In `priceDropEmail()`: import `generateUnsubscribeToken()`. Build unsubscribe URL. Append visible "Unsubscribe" link to HTML footer.
    2. In `sendEmail()`: accept optional `unsubscribeUrl` parameter. When provided, add `List-Unsubscribe` and `List-Unsubscribe-Post` headers to the Resend API request.
  - *Current code reference:* `alerts.repo.ts` lines 84-94 (email template), `send.ts` lines 27-30 (fetch to Resend).
  - *Verification:*
    - [ ] Inspect generated email HTML → visible "Unsubscribe" link present.
    - [ ] Inspect Resend API request body → `List-Unsubscribe` header included.

- [ ] **Task 6.7: Add legal links and Cookie Settings to Footer** [FR-COMP-1]
  - *File:* `src/components/layout/Footer.tsx` [MODIFY]
  - *Action:* Add localized `<Link>` elements for: Imprint, Privacy, Terms, Cookie Settings. "Cookie Settings" calls `CookieConsent.showPreferences()`.
  - *Current code reference:* Footer.tsx is 15 lines. Only contains affiliate disclosure text and LanguageSwitcher.
  - *Verification:*
    - [ ] Footer shows 4 new links.
    - [ ] Clicking "Cookie Settings" opens the consent preferences modal.

- [ ] **Task 6.8: Integrate cookie consent banner** [FR-COMP-6, design.md §4.4]
  - *Files:* `src/components/consent/CookieConsent.tsx` [NEW], root layout [MODIFY]
  - *Action:*
    1. Install `vanilla-cookieconsent`: `pnpm add vanilla-cookieconsent`.
    2. Create `CookieConsent.tsx` as a `'use client'` component.
    3. Initialize in `useEffect` with categories: `necessary`, `analytics`.
    4. Import and render in the root layout.
  - *Verification:*
    - [ ] Incognito browser visit → banner appears.
    - [ ] Accept → banner closes, preference persisted.
    - [ ] Reject → banner closes, no analytics cookies set.
    - [ ] Refresh page → banner does NOT reappear (preference saved).

---

## Phase 7: Compilation, Configuration & Validation

- [ ] **Task 7.1: Update .env.example** [design.md §5]
  - *File:* `.env.example` [MODIFY]
  - *Action:* Add entries for `STRACKR_API_KEY` and `WEBHOOK_SECRET` with documentation comments.
  - *Verification:*
    - [ ] File contains both new variables with descriptive comments.

- [ ] **Task 7.2: Update next.config.mjs image whitelist** [design.md §5]
  - *File:* `next.config.mjs` [MODIFY]
  - *Action:* Add `{ protocol: 'https', hostname: '**.strackr.com' }` to `remotePatterns`.
  - *Dependency:* If Phase 0 reveals a different CDN hostname, use that instead.
  - *Verification:*
    - [ ] `pnpm build` does not warn about unoptimized images from Strackr domains.

- [ ] **Task 7.3: Full production build** [NFR-TECH all]
  - *Action:* Run `pnpm build` and verify:
    - [ ] Exit code 0.
    - [ ] Zero TypeScript compilation errors.
    - [ ] Zero `next build` warnings related to our changes.

- [ ] **Task 7.4: Mock fallback regression test** [Persona C, NFR-TECH-7]
  - *Action:* Run `pnpm dev` with **empty** `.env.local` (no API keys, no Supabase, no Redis).
  - *Verification:*
    - [ ] App starts without errors.
    - [ ] Home page renders deal cards (mock data).
    - [ ] Console shows mock warnings for each provider.
    - [ ] No crashes on any page navigation.

---

## Deliverable Traceability Matrix

| Deliverable Bucket | PRD ID | Task(s) |
|---|---|---|
| **U-1: SSR Deal Page** | §9.1 U-1 | 6.1, 6.2 |
| **U-2: Real-Time Prices** | §9.1 U-2 | 0.1, 4.1, 4.2, 3.4 |
| **U-3: Price Drop Alerts** | §9.1 U-3 | 6.5, 6.6, 5.3 |
| **U-4: Geo-Localized Content** | §9.1 U-4 | 5.1 |
| **U-5: Legal Pages** | §9.1 U-5 | 6.4, 6.7 |
| **U-6: Cookie Consent** | §9.1 U-6 | 6.8 |
| **U-7: Affiliate Disclosure** | §9.1 U-7 | 6.1, 6.2 |
| **P-1: SubID Tracking** | §9.2 P-1 | 2.3 |
| **P-2: Postback Webhook** | §9.2 P-2 | 5.2, 1.1 |
| **P-3: Schema.org Markup** | §9.2 P-3 | 6.1 |
| **P-4: Dynamic Sitemap** | §9.2 P-4 | 6.3 |
| **P-5: AI Proof Fields** | §9.2 P-5 | 6.1, 3.3 |
| **P-6: Price History** | §9.2 P-6 | 1.1, 1.2, 3.3 |
| **V-1: Deduplication** | §9.3 V-1 | 3.4 |
| **V-2: DB Migrations** | §9.3 V-2 | 1.1, 1.2 |
| **V-3: API Security** | §9.3 V-3 | 5.2, existing |
| **V-4: GDPR Erasure** | §9.3 V-4 | 6.5, 6.6, 2.2 |
| **V-5: Mock Fallback** | §9.3 V-5 | 7.4 |
| **V-6: Build Health** | §9.3 V-6 | 7.3 |
| **V-7: robots.txt** | §9.3 V-7 | 6.3 |
