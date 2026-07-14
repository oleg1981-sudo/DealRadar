# DealRadar — PDP Content-Parity Remediation Plan

> **Execution status (2026-07-14, branch `worktree-fable-pdp-content-parity`):**
> **DONE** — P0-1, P0-2, P0-3 (commit `7866e46`), P1-1..P1-4 + ⚖A capture (commits `693a85c`, `659de16`), ⚖B ingest-side mapping (identifier columns map automatically once the feed URL ships them).
> **VERIFIED** — 76/76 vitest, tsc clean, prod build clean; rich + plain PDP variants rendered locally and screenshotted (`pdp-new-rich.jpeg`, `pdp-new-plain.jpeg`).
> **PENDING** — multi-agent adversarial review re-run (first run lost to the session limit; inline self-review done), `pnpm db:migrate` against prod at merge (adds `deals.description_html`; verifier degrades gracefully until then), ⚖B dashboard action (regenerate `AWIN_FEED_URL` with ean/mpn/model/short-description columns), ⚖C reviews = SKIP (recommended).

Derived from `findings.md` in this folder. Effort: **S** ≤30 min · **M** ≤2 h · **L** > half-day.
**Approval gate:** nothing here is executed yet. Items marked ⚖ depend on a product decision (bottom).

---

## P0 — Root-cause fixes on data we already legitimately have

| # | Fix | Where | Effort | Acceptance |
|---|---|---|---|---|
| P0-1 | **Stop destroying description structure at ingest**: preserve line breaks (collapse only spaces/tabs, keep `\n`), raise or drop the 1500-char cap (feed column limit permitting), never cut mid-word | `scripts/ingest-awin.cjs:144` | S | After next nightly ingest, BlazeVideo rows have >1500-char descriptions with paragraph breaks; no row ends mid-word |
| P0-2 | **JSON-LD `description` ← `deal.description`** (fallback to synthetic string) — closes the open FR-SEO-2 / FR-PDP-7 conformance gap | `src/app/[locale]/deal/[slug]/page.tsx:83` | S | Rich Results Test shows the real description on the Product node |
| P0-3 | **Add content fields to the nightly-upsert preservation list** so enrichment survives the 03:00 clobber (today only verified prices are preserved; enriched galleries are reverted daily until ~05:00) | `scripts/ingest-awin.cjs:301-313` | S | Enriched gallery/description unchanged after a nightly ingest run |
| ~~P0-4~~ | ~~Verify prod deploy currency~~ — **resolved in Pass 2: prod is current.** Live PDP already serves gallery, description, and all JSON-LD from the latest code; no deploy action needed. | — | — | done (verified 2026-07-14) |

## P1 — Presentation parity with data already stored (no new scope)

| # | Fix | Where | Effort | Acceptance |
|---|---|---|---|---|
| P1-1 | **Structured description rendering**: split stored text into paragraphs (once P0-1 preserves `\n`), render as a proper prose section (readable measure, real type scale) instead of one `text-sm` grey `<p>` | `page.tsx:246-251` + new component | M | BlazeVideo PDP description reads as sectioned prose, not a wall of text |
| P1-2 | **Long-scroll PDP layout**: keep buy-box grid above the fold, add below: full-width feature-image section (the merchant marketing graphics ALREADY in `gallery` — e.g. `A323-features.webp` — shown large instead of hidden behind 64px thumbnails), description section, shop/trust block (`shopLogoUrl`, delivery note), price-history section | `page.tsx:144-253`, `DealGallery.tsx` | L | PDP scrolls like a product page; feature graphics visible at width; mobile OK |
| P1-3 | **Spec/identifier row**: render brand + EAN/MPN/model where present (today 0/836 — pairs with P2-1/⚖B); include `gtin`/`mpn` in JSON-LD when populated | `page.tsx` JSON-LD + body | S | Fields appear when data exists; absent otherwise (no fabrication) |
| P1-4 | Delete dead synthetic `productSizes()` (fabrication leftover, FR-PDP-6 spirit) | `src/lib/utils/product-details.ts:60-83` | S | No references; tree-shake clean |

## P2 — New data, gated on decisions ⚖

| # | Fix | Where | Effort | Acceptance |
|---|---|---|---|---|
| P2-1 ⚖B | **Regenerate AWIN Create-a-Feed URL** to include `ean`, `mpn`, `model_number`, `product_short_description`, `specifications`, `colour`, `dimensions`, `delivery_cost/time`, `condition`; map them in ingest (columns for identifiers already exist; specs need a `jsonb` column + `NormalizedDeal` extension) | AWIN dashboard + `ingest-awin.cjs:119-167` + `schema.sql` + `types.ts` | M–L | New nightly rows populate identifiers; fill-rate report per column |
| P2-2 ⚖A | **Capture the merchant description already being fetched**: `verify-awin.cjs`/`enrich-galleries.cjs` download Shopify `products/<handle>.js` daily — its `description` field is the merchant's full rendered body HTML (every feature block). Store sanitized version (new `description_html`/blocks column), render behind sanitizer. Today it is fetched and discarded. | `scripts/verify-awin.cjs:110-163` or `enrich-galleries.cjs:66-92` + schema + PDP | M–L | BlazeVideo PDP shows the merchant's full sectioned description; XSS-sanitized; survives nightly ingest (needs P0-3) |
| P2-3 ⚖C | **Reviews/ratings**: not in AWIN feeds; on this merchant they are injected by the **Rivyo** app (9 reviews, 4.8★) and — verified in Pass 2 — **absent from merchant JSON-LD**, so structured-data harvesting is dead. Remaining options: (i) skip — spec omits them; (ii) Rivyo/review-app widget-API scrape (higher effort, ToS-sensitive, per-app fragmentation); (iii) third-party review APIs. Legal/ToS review required for (ii)/(iii). | new scope | L | Decision recorded; if in: rating stored + rendered + JSON-LD `aggregateRating` |
| P2-4 | **Curated editorial blocks** (specs/comparison/FAQ) per the spec's own durable fix: `deal_curation` overlay, human `legal_ok` gate (FR-PDP-4/T-PDP-4, M2) | per `design.md:104-106` | L | Overlay table + authoring script + PDP render, per spec acceptance |

## Decisions needed (⚖)

- **A — Merchant content harvesting.** The spec sanctions merchant Shopify fetches only for price/stock. Extending the same daily fetch to store the description (P2-2) is the cheapest path to real parity but is *new scope* — approve, reject, or send to spec amendment?
- **B — Feed regeneration.** The `columns=` list lives in the `AWIN_FEED_URL` secret; enriching it is an AWIN-dashboard action outside the repo. Who regenerates, and do we want the full column set?
- **C — Reviews.** In (via merchant JSON-LD or API — legal review needed) or explicitly out (spec's current implicit position)?

## Changes from pass 1

Pass 2 (live-page inspection + direct fetches, 2026-07-14 — evidence in `findings.md` §Pass 2 and the two full-page screenshots in this folder):

- **P0-4 closed as verified**: prod serves the current PDP build (gallery + description + JSON-LD all present live). No deploy action.
- **P0-1 confirmed user-visible**: the live description ends mid-word ("…schalten Sie den St") — production proof of the ingest truncation.
- **P2-2 (⚖A) upgraded to the highest-leverage item**: Shopify `.js` verified live — `description` = 10,925 chars of structured HTML (7.3× our stored text) with feature blocks, spec bullet list, and video embeds; 12 images (we cap 6). Our pipeline downloads this daily and discards it.
- **P2-3 (⚖C) narrowed**: merchant JSON-LD has no rating — the cheap harvest path is dead; reviews are Rivyo-widget-only (9 reviews, 4.8★). Skip or commit to app-level scraping.
- **Parity gap quantified** for the exemplar: 10,403 px vs 1,532 px page height, 14 vs 2 content headings, 2 videos vs 0, 29 large images vs hero+6 thumbs — supports P1-2's long-scroll layout as the presentation-side fix.
- Still open: AWIN feed header dry-run (needs `AWIN_FEED_URL` secret) to size P2-1 (⚖B).
