# Spec Compilation Audit Report
## Cross-Reference: Source PRD × Compiled Specs × Live Codebase

**Auditor:** Principal Architect  
**Date:** 2026-06-23  
**Scope:** All artifacts in `docs/ground_source_of_truth/2026-06-23_v1/`  
**Method:** Line-by-line cross-reference of source [DealRadar.md](file:///Users/danielmanzela/DealRadar/docs/High-level%20docs/DealRadar.md) against compiled specs and verified against live codebase files.

---

## Audit Legend

| Severity | Meaning |
|---|---|
| 🔴 **CRITICAL** | Missing component or hallucination that would cause build failure or architectural misalignment |
| 🟡 **WARNING** | Incomplete coverage, ambiguous specification, or drift from source material |
| 🟢 **VERIFIED** | Correctly specified, matches both source PRD and codebase reality |

---

## Section 1: Hallucination Check

### 🟡 HALLUCINATION H-1: Strackr API Endpoint URL Fabricated

**Location:** design.md §3 API Contracts  
**Claim:** `https://api.strackr.com/v3/offers`  
**Reality:** The source PRD (line 169) uses a placeholder URL `https://strackr.com`. The real Strackr API endpoint and its exact path have **not been verified** against Strackr's actual documentation. The `/v3/offers` path was invented.  
**Risk:** Building against a fabricated endpoint guarantees a 404 at runtime.  
**Fix:** Mark the endpoint as `TBD — verify against Strackr publisher docs` and add a task to read the actual Strackr API documentation before implementation.

### 🟡 HALLUCINATION H-2: Strackr Response Payload Schema Unverified

**Location:** design.md §3 API Contracts  
**Claim:** Response has `{ results: [{ id, name, description, image, url, merchant: { name }, network, prices: { price, old_price, discount_percent }, extra: { ean } }] }`  
**Reality:** This shape was derived from the source PRD's speculative code example (lines 152–162), NOT from actual Strackr API documentation. The source PRD itself states this is illustrative.  
**Risk:** Field names, nesting, and pagination may differ significantly from the real API.  
**Fix:** Add a research task (Phase 0) to fetch the real Strackr API schema before locking the `StrackrProvider` interface.

### 🟢 VERIFIED: No Hallucinated Codebase Files

All file paths referenced in design.md (both `[MODIFY]` and `[NEW]`) correctly map to existing or planned locations within the real `src/` directory structure. No phantom files referenced.

---

## Section 2: Drift from Source PRD

### 🔴 CRITICAL D-1: Deduplication Strategy Contradicts Source PRD

**Source PRD (line 63):** *"defaulting to whichever network pays the **highest commission rate**"*  
**Compiled Spec (requirements.md FR-ING-4, design.md §4):** *"persist only the deal that offers the **deepest discount percentage**"*  
**Analysis:** The source PRD explicitly says to prefer deals from networks that pay DealRadar the highest commission. The compiled spec drifted to "deepest discount for the user" — a fundamentally different business decision. These are opposite optimization targets.  
**Fix:** This is an **open design question** that needs explicit product owner sign-off. Document both strategies and flag for user decision:
- **Option A (Source PRD):** Keep the deal from the highest-commission network (maximizes revenue).
- **Option B (Current Spec):** Keep the deal with the deepest discount (maximizes user value).
- **Option C (Hybrid):** Keep deepest discount, but break ties using commission rate.

### 🟡 WARNING D-2: Cron Schedule Mismatch

**Source PRD (line 57):** *"running every 1 to 4 hours"*  
**Source PRD (line 102):** *"Netlify Scheduled Function (15 min)"*  
**Live Codebase (refresh-deals.mts line 33):** `schedule: '0 4 * * *'` → **once daily at 04:00 UTC**  
**Compiled Spec:** Silently assumes 15-minute intervals without acknowledging the live codebase reality.  
**Fix:** The spec must explicitly state the target cron schedule and note the current value differs. Recommend adding a task to update `refresh-deals.mts` schedule from daily to the target interval.

### 🟡 WARNING D-3: Source PRD Mentions `updated_at` Column — Codebase Already Has `last_updated`

**Source PRD (line 135):** `ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP...`  
**Live Codebase (schema.sql line 23):** Column is named `last_updated timestamptz`.  
**Compiled Spec:** Does not add `updated_at` (correct — the column already exists as `last_updated`), but also does not explicitly call out this reconciliation.  
**Fix:** Add a note in design.md that the source PRD's `updated_at` maps to the existing `last_updated` column.

### 🟡 WARNING D-4: Source PRD Path for Strackr Service Differs from Design

**Source PRD (line 146):** `src/lib/affiliate/strackr.ts`  
**Compiled Design:** `src/lib/providers/strackr.ts`  
**Analysis:** The design correctly adapts the PRD's suggested path to match the existing provider pattern (`src/lib/providers/`), which is the right architectural decision. However, this deviation should be explicitly documented as intentional.  
**Status:** Correct decision, just needs a callout note.

---

## Section 3: Missing Critical Components

### 🔴 CRITICAL M-1: No `price_history` Table or Tracking Mechanism

**Source PRD (lines 459–463):** Requires "Historic Price Context" proof fields:
- *"This product has reached its lowest price in 90 days"*
- A 90-day lookback requires a historical price series, not just a single `historical_low_price` scalar.

**Live Codebase (price-history.ts lines 10-13):** Explicitly states:
> *"When the daily refresh starts recording real snapshots (a price_history table), feed that recorded series into priceSeries()"*

**Compiled Spec:** Only adds a single `historical_low_price` column. This is insufficient for "90-day lowest" claims — you need a time-series of price snapshots.  
**Fix:** Add a `price_history` table to the schema migration:
```sql
CREATE TABLE IF NOT EXISTS public.price_history (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id   text NOT NULL REFERENCES public.deals(product_id) ON DELETE CASCADE,
  sale_price   numeric(12,2) NOT NULL,
  recorded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_history_product_idx
  ON public.price_history (product_id, recorded_at DESC);
```
Add a task to insert a snapshot row on every refresh upsert.

### 🔴 CRITICAL M-2: No `transactions` / Commission Tracking Table

**Source PRD (lines 71–77):** Defines a transaction postback system tracking `transaction_id`, `commission_earned`, `status`, and `subid3`.  
**Compiled tasks.md (Task 7.1):** Says "implement postback route" and "verify commission changes in database."  
**Missing:** There is no `transactions` table defined anywhere in the schema migration. The postback route has nowhere to write data.  
**Fix:** Add a `transactions` table to the schema:
```sql
CREATE TABLE IF NOT EXISTS public.transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id     text NOT NULL UNIQUE,
  product_id         text REFERENCES public.deals(product_id),
  commission_earned  numeric(12,2) NOT NULL,
  status             text NOT NULL CHECK (status IN ('pending', 'approved', 'declined')),
  raw_payload        jsonb,
  received_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
```

### 🟡 WARNING M-3: No `STRACKR_API_KEY` in `.env.example`

**Current .env.example:** Does not list `STRACKR_API_KEY`.  
**Fix:** Add a task to append `STRACKR_API_KEY=` with documentation to `.env.example`.

### 🟡 WARNING M-4: `next.config.mjs` `remotePatterns` Missing Strackr CDN

**Current next.config.mjs:** Only allows image domains from `cdn.dummyjson.com`, `**.kelkoogroup.net`, `**.awin1.com`, `**.tradedoubler.com`.  
**Fix:** Add Strackr/aggregator CDN patterns (or a broad pattern) to the image configuration. Add as a task.

### 🟡 WARNING M-5: Affiliate URL Decoration Not Updated for SubID Structure

**Source PRD (lines 39–41):** Requires subIDs: `?subid1=user_country&subid2=product_category&subid3=deal_id`  
**Current affiliate.ts:** Only appends a single static `dealradar` value per network-specific param name.  
**Compiled Requirements (FR-TRK-1):** Correctly requires the structured subIDs.  
**Missing from tasks.md:** There is no task to update affiliate.ts to implement the structured subID appending.  
**Fix:** Add a task between Phase 4 and Phase 5 to refactor `decorateAffiliateUrl()`.

### 🟡 WARNING M-6: Sitemap Path Architecture Issue

**Design (line 24):** `src/app/[locale]/sitemap.xml/route.ts`  
**Issue:** Placing the sitemap under `[locale]` means each locale gets a separate sitemap (`/en/sitemap.xml`, `/de/sitemap.xml`). This is valid but requires a sitemap index at the root. The `robots.txt` spec references `Sitemap: https://dealradar.app` without a path — it should be `Sitemap: https://dealradar.app/sitemap.xml` or reference a sitemap index.  
**Fix:** Either:
- (a) Place sitemap at `src/app/sitemap.xml/route.ts` (root, aggregating all locales), or
- (b) Add a root `sitemap-index.xml` that references per-locale sitemaps.

### 🟡 WARNING M-7: No GDPR/Privacy Impact Assessment for Postback Data

**Source PRD (lines 71–77):** Transaction postbacks contain user purchase data routed through DealRadar's server.  
**Current codebase:** Has a GDPR cookie banner and geo-consent prompt.  
**Missing:** The spec does not address GDPR implications of storing transaction/commission data that may indirectly identify users.  
**Fix:** Add a privacy note to the PRD and requirements documenting data retention policies for the `transactions` table.

### 🟡 WARNING M-8: Deal Detail Page `not-found` Handling

**Source PRD (line 398):** Shows `if (!deal) return <div>Deal not found</div>` — a bare div.  
**Codebase pattern:** The app uses Next.js `notFound()` function from `next/navigation` (see layout.tsx line 39).  
**Fix:** The task for the deal detail page should specify calling `notFound()` (not rendering a bare div) to trigger the app's existing not-found page.

---

## Section 4: Verified Correct Items

| Item | Status |
|---|---|
| Database columns (`affiliate_network`, `merchant_name`, `native_product_id`, `ean_code`, `tracking_url`, `slug`, `historical_low_price`, `description`) | 🟢 Match source PRD |
| `unique_deal_per_network` constraint on `(affiliate_network, native_product_id)` | 🟢 Match source PRD line 139 |
| Strackr provider follows existing `PriceProvider` interface pattern | 🟢 Correct architectural decision |
| JSON-LD `Product` + `AggregateOffer` schema structure | 🟢 Matches source PRD lines 401–434 |
| `robots.txt` bot allowances and API disallows | 🟢 Matches source PRD lines 475–493 |
| Edge middleware geo-header parsing approach | 🟢 Matches source PRD lines 505–507 |
| Mock fallback behavior preserved when keys absent | 🟢 Matches existing codebase pattern |
| Slug generation formula (`slugify(name)-productId`) | 🟢 Ensures uniqueness |
| Email alerts via existing Resend integration | 🟢 Matches send.ts |
| Redis caching layer preserved at 30-min TTL | 🟢 Matches redis.ts line 12 |
| RLS stays enabled on all tables | 🟢 Matches schema.sql line 62 |

---

## Section 5: Recommended Spec Revisions (Priority Order)

1. **🔴 D-1:** Resolve deduplication strategy (commission vs. discount) — **requires product owner decision**.
2. **🔴 M-1:** Add `price_history` table + snapshot insertion task.
3. **🔴 M-2:** Add `transactions` table for postback commission tracking.
4. **🟡 H-1/H-2:** Mark Strackr API endpoint and payload as `TBD` pending real documentation review.
5. **🟡 M-5:** Add task to refactor `affiliate.ts` for structured subIDs.
6. **🟡 M-3:** Add `STRACKR_API_KEY` to `.env.example`.
7. **🟡 M-4:** Add Strackr CDN to `next.config.mjs` remote patterns.
8. **🟡 M-6:** Fix sitemap path architecture and `robots.txt` sitemap reference.
9. **🟡 D-2:** Document target cron schedule and add task to update `refresh-deals.mts`.
10. **🟡 D-3:** Document `updated_at` → `last_updated` reconciliation note.
11. **🟡 M-7:** Add GDPR data retention note for transaction data.
12. **🟡 M-8:** Use `notFound()` not bare div in deal detail page.
