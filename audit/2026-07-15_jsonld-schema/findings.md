# JSON-LD schema audit — findings (Pass 1: codebase + live cross-reference)

**Date:** 2026-07-15 · **Target:** PDP structured data vs actual page HTML, for SEO/AEO/GEO
**Reference URL used throughout:** `/en/deal/2tlg-wildkameras-…-a323-awin-31184682119` (BlazeVideo DE, AWIN)

## What exists today

Three JSON-LD blocks render on every PDP (verified live, 2026-07-15):

| Block | Source | Notes |
|---|---|---|
| `Organization` | `src/app/[locale]/layout.tsx:43-49` | Site-wide brand node (name, url, logo). |
| `Product` | `src/app/[locale]/deal/[slug]/page.tsx:81-108` | Per-deal; single `Offer` (deliberately not `AggregateOffer`), `seller`, `priceSpecification` with `valueAddedTaxIncluded: true`. |
| `BreadcrumbList` | `src/app/[locale]/deal/[slug]/page.tsx:136-144` | Home › category › (matched subcategory). Mirrors the visible `<nav aria-label="Breadcrumb">`. |

Data flow: AWIN feed → `scripts/ingest-awin.cjs` (columns consumed at lines 121-171) → `deals` table → `getDealBySlug` (`src/lib/db/deals.repo.ts`) → page. Description text is cleaned/capped at **8,000 chars** by `feedDescription()` (`scripts/lib/description.cjs:17`, `MAX_PLAIN`). Images come from `productGallery()` (`src/lib/utils/product-details.ts`) which un-proxies AWIN's 200×200 productserve thumbnails to full-res merchant originals — live page emits 6 images.

XSS hardening is in place: `<` escaped to `<` before injection (`page.tsx:148-149`).

Conditional identifier fields already exist in code but were **absent for the tested deal** (feed gaps, confirmed live):
- `gtin` ← `ean_code` (`page.tsx:91`)
- `mpn` ← `mpn || model_number` (`page.tsx:92`)
- No `sku` emission at all (and no merchant SKU column is ingested).

## Live test-result cross-reference (root causes confirmed)

| Reported issue (GSC URL inspection / Rich Results, 2026-07-15) | Verified root cause |
|---|---|
| "Invalid string length in field 'name' (optional)" | Live `name` is **157 chars** — raw feed `product_name` incl. `\| A323` suffix. Google's product-title limit is 150. `page.tsx:84`. |
| "Invalid string length in field 'description' (optional)" | Live `description` is **5,572 chars** — raw feed description passed through the 8,000-char ingest cap. Google's limit is 5,000. `page.tsx:89`. |
| "Missing field 'shippingDetails' (optional)" | Never emitted. AWIN feeds carry `delivery_cost`/`delivery_time` columns but `ingest-awin.cjs` does not consume them. |
| "Missing field 'hasMerchantReturnPolicy' (optional)" | Never emitted. No return-policy data exists anywhere in the pipeline. Applicability to an affiliate (non-transactional) page is a Pass-2 research question — Google's merchant-listing experience targets pages where the shopper can buy on-site. |
| Schema.org validator: 0 errors / 0 warnings | Markup is syntactically valid. (`http://schema.org/InStock` in validator output is display normalization — the source emits `https://`, `page.tsx:97`.) |
| Only "Product" detected in GSC paste | Not a defect: live HTML has all 3 blocks; GSC lists Breadcrumbs under a separate rich-result type. |
| Lighthouse SEO 100, "Structured data is valid" | Consistent with the above — issues are quality/completeness, not validity. |
| A11y 92 + Agentic Browsing 1/2: "Buttons do not have an accessible name" | `LocationPicker` header button (`src/components/layout/LocationPicker.tsx:35-44`): its only always-visible content is an `aria-hidden` icon; the text span is `hidden sm:inline`, so on mobile the button has **no accessible name**. |
| A11y contrast failures | `text-accent` uppercase merchant label (`page.tsx:196`), `text-zinc-400 line-through` was-price (`page.tsx:203`), `bg-zinc-100` affiliate badge, accent CTA text — token-level contrast ratios below AA on white. |
| Perf 99 — render-blocking CSS (420 ms), no preconnects, 11 KB legacy polyfills | Two small CSS files block first paint; `browserslist` targets transpile Baseline features (`Array.prototype.at` etc. polyfilled in chunk 945). Cosmetic at current scores. |

## Gaps / observations beyond the reports

1. **No `priceValidUntil`** on the Offer — recommended for product snippets; we verify prices daily, so an honest ~48 h horizon exists (`lastUpdated` + verifier cadence).
2. **No `aggregateRating`/`review`** — correctly absent: no review data exists; fabricating would violate Google structured-data policy. Recorded as *will-not-do*, not a gap to fill.
3. **Content-parity rule risk**: any added `shippingDetails` must also be visible on-page (structured data must reflect page content). Nothing on the PDP currently shows delivery cost.
4. **`sku` absent**: AWIN's `merchant_product_id` (the merchant's own ID) is not ingested; `deal.productId` (`awin:…`) is our composite key, not a merchant SKU.
5. **Model in title, not in schema**: `| A323` is the merchant's model code embedded in `product_name`. A `model`/`mpn` extraction heuristic is possible but risks fabrication on non-conforming names — Pass-2 question.
6. **Breadcrumb leaf points at a noindexed URL**: subcategory crumb `item` is `/search?category=…&q=…` (`page.tsx:133`), and `/[locale]/search` is noindex by design. Valid markup, but the trail's last node is a page Google won't index.
7. **Locale/content mismatch**: the `/en/` page (and all 13 hreflang alternates) serve identical German feed content; only UI chrome translates. Feed-data reality; structurally belongs to the URL/slug-spec-v2 work (M2), not this schema fix.
8. **HTML weight**: the 5.5 KB description is duplicated (visible HTML + JSON-LD) inside a 139 KB page — trimming the JSON-LD copy also trims payload.

## Pass 2 enrichment (2026-07-15: 3 parallel research agents — Google docs, AEO/GEO evidence, competitor extraction)

### The four GSC flags, definitively classified

- **The page's correct target experience is "product snippets", not "merchant listings".** Google's merchant-listing doc (updated 2026-07-07): "Only pages where a shopper can purchase a product are eligible for merchant listing experiences, not pages with links to other sites that sell the product." The product-snippet doc contains Google's own "Shopping aggregator page" example — our exact page type. The merchant-listing-class warnings appear only because our Offer node triggers those checks ("the Merchant listings report includes checks for product snippets that include Offer structured data").
- **Name/description limits confirmed**: 1–150 and 1–5,000 chars, sourced from the Merchant Center product data spec, mirrored by the validators. Notably, **OpenAI's product feed spec uses the identical limits** (title ≤150, description ≤5,000 plain text) — one cap serves both ecosystems.
- **`shippingDetails` / `hasMerchantReturnPolicy` are merchant-listing-only fields** — absent from the product-snippet property set entirely. Google: fixing non-critical issues "isn't necessary to be eligible for rich results." Emitting merchant shipping/return terms we don't control and don't display would collide with the parity policy ("Don't mark up content that is not visible to readers of the page", sd-policies, updated 2026-07-10). **Zero of five competitor sites emit either field.** → Documented N/A, not a gap.

### Evidence that changed Pass-1 assumptions

- **`priceValidUntil` is net-negative for us**: "Your product snippet may not display if the priceValidUntil property indicates a past date" — a stale field is actively harmful (verifier outage → suppressed snippets); omitting is documented-safe, and **no competitor emits it**. Pass-1 item reversed.
- **Chat engines don't read JSON-LD at fetch time**: two independent 2025-26 experiments (searchVIU 8-scenario × 5 systems; Otterly controlled test) found prices present only in JSON-LD were extracted by **zero** of ChatGPT/Claude/Gemini/Perplexity/AI Mode — visible HTML is the extraction surface. Schema pays inside Google's ecosystem (rich results → rank; Otterly measured large SERP-feature/AI-Overview lifts), and rank position dominates AI citation (SSRN 2026: position 1 cited 43% vs 5% at position 7).
- **Attribute-rich beats generic**: Product/Review schema with populated concrete attributes cited 61.7% vs 41.6% for generic-schema pages (SSRN, p=.012), strongest for low-authority domains like ours. But *adding* schema fields per se produced ~zero citation lift (Ahrefs May 2026 causal study). Identifiers (gtin/mpn) are "optional everywhere, harmful nowhere" and gate Shopping-Graph/knowledge-panel matching — the seller-list surface an aggregator wants.
- **Freshness + visibility are the real AEO levers**: ChatGPT shopping offers are 88% crawled from PDPs (Profound, Jun 2026), and rank-1 offers correlate with lowest-price signals, *visible* delivery/availability info, and clear titles. Bing (official, SMX 2025): schema grounds Copilot's LLMs; "use the API at indexnow.org" on updates. Our existing IndexNow-on-price-change automation, AI-crawler robots policy, visible verified-at timestamp, and server-rendered JSON-LD are all validated by this research.

### Competitor reality check (live extraction, 2026-07-15)

idealo and billiger.de set the ceiling: lean `AggregateOffer` (low/high/count — multi-seller, unlike our single-offer deals), first-party `aggregateRating`+reviews, EAN/gtin13 identifiers, `ProductGroup` variants; **none emit shippingDetails/returns/priceValidUntil/seller**. Descriptions are minimal (idealo: 127 chars of boilerplate; billiger/PriceRunner: empty string) — our 5.5 KB spec dump is the outlier. Geizhals and Slickdeals ship essentially no product JSON-LD at all.

### AWIN feed columns (cross-referenced with sibling audit)

The 2026-07-14 PDP-content-parity audit already established: ingest maps `ean`/`mpn`/`model_number` (`ingest-awin.cjs:169-171`) but DB columns are **0/836 populated** because the subscribed Create-a-Feed URL omits those columns. Regenerating the feed URL is its P2-1 and is the single blocking dependency for identifier coverage here. Delivery-cost columns matter for *visible* PDP delivery info (parity audit P1-2), not for JSON-LD.
