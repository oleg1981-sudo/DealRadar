# DealRadar — PDP Content-Parity Audit: Findings

**Date:** 2026-07-14 · **Trigger:** Why does our deal page look nothing like the merchant's original product page?
**Exemplar pair:** merchant `https://www.blazevideos.de/products/2pcs-a323-brown` (Shopify PDP) vs ours `https://dealradar.me/en/deal/2tlg-wildkameras-…-awin-31184682119`
**Method (Pass 1, codebase + production DB only):** 5 parallel slice-readers — PDP render tree, data model/repo, ingest pipeline, live Supabase row for this exact deal, v3.1 spec decisions. Browser comparison of the two live pages is Pass 2.

---

## TL;DR — the root cause is layered, and mostly NOT a rendering bug

The PDP renders essentially **everything the data model can carry** (`getDealBySlug` selects `*`, `fromRow` maps every column, the page consumes every content-bearing field — `deals.repo.ts:290`, `:40-62`). The content poverty is upstream and structural, in four layers:

| # | Layer | Root cause | Bucket |
|---|---|---|---|
| 1 | **Ingest degrades the description** | `ingest-awin.cjs:144` does `.trim().replace(/\s+/g, ' ').slice(0, 1500)` — collapses ALL whitespace (paragraphs/headings destroyed) then hard-truncates at 1500 chars, mid-word, no ellipsis. **Live proof:** this deal's description is exactly 1500 chars ending `"…schalten Sie den St"`; **423 of 836 deals** sit at exactly the 1500 cap (table max = 1500). | (b) ingested but degraded |
| 2 | **Renderer flattens what survives** | `page.tsx:246-251` renders the description as ONE escaped `<p class="whitespace-pre-line text-sm …">` — no blocks, no headings, no HTML. Page is a single-viewport `max-w-4xl` (896px) card + one paragraph (`page.tsx:145,175`). A Shopify long-scroll PDP can never be approximated by this layout, even with perfect data. | rendering ceiling |
| 3 | **Reviews / specs / feature blocks are structurally unmodeled** | No column, no table, no `NormalizedDeal` field for ratings, review text, spec key-values, feature sections, delivery info, or videos — anywhere (`schema.sql:6-36,102-110`, `types.ts:20-61`; live DB has exactly 4 tables: deals, price_history, price_alerts, transactions). AWIN feeds do not carry reviews at all. | (d) never existed in feed + schema absence |
| 4 | **Ignored feed columns** | Ingest reads ~20 feed columns; it never references `ean`, `mpn`, `model_number`, `product_short_description`, `specifications`, `promotional_text`, `colour`, `dimensions`, `delivery_cost`, `delivery_time`, `condition`, etc. (`ingest-awin.cjs:119-167`). DB columns `ean_code/upc_code/mpn/model_number` exist but are **0/836 populated**. | (a) never ingested |

**The single most important discovery:** the pipeline **already fetches the merchant's full rich content every day and throws it away.** Both daily jobs — `verify-awin.cjs:110-163` (price verifier) and `enrich-galleries.cjs:66-92` (gallery top-up) — download the merchant's live Shopify `products/<handle>.js` JSON, which contains the complete `description` (rendered body HTML: every feature block and heading on the merchant page) plus all images and variants. They consume only `variants[].price/available` and `images[]` respectively. Zero consumers of the description exist repo-wide. `merchant_url` is stored for **all 836 deals** — the enrichment source is already wired.

---

## What is NOT broken (rule these out)

- **Images.** This deal's `gallery` holds **6 full-res Shopify CDN URLs including the merchant's marketing/feature graphics** (`A323-features.webp`, `A323-sony-starvis-sensor.png`). Catalog-wide: 836/836 have galleries, avg 4.96 images. The renderer un-proxies AWIN's 200×200 `productserve` thumbnails back to full-res originals (`product-details.ts:33-43`) and `DealGallery` shows hero + thumbnails. Image *data* parity is solved; only image *presentation* (aspect-square ~448px hero, no full-bleed feature blocks) differs.
- **Repo/select layer.** `select('*')` + full `fromRow` mapping — nothing stored is withheld from the page.
- **The in-flight working-tree diff.** `page.tsx`/`DealCard.tsx` changes are analytics-only (GA4 item payloads, `data-clarity-*`→`data-analytics-*`, `TrackViewItem`) — no content impact.

## Aggravating mechanics

- **Nightly clobber cycle:** the 03:00 UTC re-ingest upsert overwrites `gallery` and `description` with raw feed values (it preserves verified *prices* only — `ingest-awin.cjs:231-239, 301-313`); `enrich-galleries` restores galleries after the ~05:00 verify. Any future content enrichment gets wiped nightly unless added to the preservation list (`ingest-awin.cjs:307-313`).
- **JSON-LD under-declares:** Product `description` is the synthetic `"${productName} — ${shopName}"`, not `deal.description` (`page.tsx:83`) — an **open FR-SEO-2 / FR-PDP-7 conformance gap** per the current spec. No `aggregateRating`, `availability` hardcoded `InStock`.
- **Feed-column selection is invisible:** the AWIN Create-a-Feed URL (with its `columns=` list) lives only in the GitHub Actions secret `AWIN_FEED_URL` (`ingest-awin.yml:44`); the script parses whatever headers arrive and silently returns `''` for missing columns (`ingest-awin.cjs:279-283`). Whether `specifications`/`product_short_description`/`ean` are even *requested* from AWIN is undeterminable from the repo.

## Prior decisions that constrain the fix (do not re-litigate)

Per `docs/ground_source_of_truth/2026-07-09_v3.1/`:

1. **Rich PDP content is IN SCOPE and tracked:** FR-PDP-7 → T-PDP-6 (M2) required rendering real gallery + description + price cardiogram. That render half **largely landed** (commits `4ba0b63`, `1bada73`); the JSON-LD description clause remains unmet (`requirements.md:62`, `tasks.md:382-388`).
2. **No fabrication.** Spec tables / fake offers / synthetic model codes were deliberately removed (`product-details.ts:1-9`, FR-PDP-6/T-PDP-5): "a single feed has one price per product and no structured specs, so inventing them would mislead." (`productSizes()` synthetic-sizes helper survives as dead code — `product-details.ts:65-83`.)
3. **Specs/comparison/FAQ blocks are planned as human-gated authored editorial** (FR-PDP-4 → T-PDP-4, M2, `deal_curation` overlay table, `legal_ok` gate) — the spec never expects them from the feed (`requirements.md:59`, `design.md:104-106,174-183`).
4. **Reviews are out of scope by omission** — zero mentions across the v3.1 suite and url-slug package.
5. **Merchant-page scraping is sanctioned only for price/stock verification** (DSN-ING-11). Harvesting *content* (description/images beyond gallery top-up/reviews) from merchant pages is **new scope requiring a decision**.
6. **No modal.** The retired `DealDetailModal` was deleted (commit `5218271`); the url-slug spec's Never-list forbids a modal-only deal view. All richness lands on the SSR PDP.

## Live-row ground truth (product_id `awin:31184682119`)

- price 129.88 / 211.25 EUR, −39%, brand BlazeVideo, category electronics, `hidden=false`, verified 2026-07-14 07:16 UTC
- description: exactly 1500 chars, plain flattened text, truncated mid-word
- gallery: 6 full-res Shopify URLs (incl. feature graphics) · image_url: 200×200 productserve proxy (all 836 rows)
- `merchant_url = https://www.blazevideos.de/products/2pcs-a323-brown` (populated for all 836 deals)
- ean/upc/mpn/model_number/shop_logo_url: NULL (0/836 table-wide)
- price_history: 8 daily rows, flat 129.88 — `historical_low_price` = current price

---

## Pass 2 — Live-page evidence (2026-07-14, Playwright + direct fetches)

Full-page screenshots in this folder: `merchant-blazevideos-a323-full.jpeg` / `dealradar-a323-pdp-full.jpeg`.

### Quantified parity gap (this exact product)

| Dimension | Merchant (blazevideos.de) | Ours (dealradar.me) |
|---|---|---|
| Page height | **10,403 px** | **1,532 px** (~7×) |
| Content headings (h1–h3) | 14 — feature sections (SENSOR FÜR SEHR SCHWACHES LICHT, BILD 64MP & VIDEO…, EINFACHE HANDHABUNG…), Beschreibung, Praktische Ratschläge, Garantie, Kundenbewertungen, related products | 2 (h1 + "Product details") |
| Description | 10,925 chars of structured HTML: tabbed (ProduktInformation / Technische Details / Spezifikationen / Ihr Paket / Garantie & Bedienungsanleitung), headings, bullet spec list | 1,500 flattened chars, one grey `<p>`, **ends mid-word live**: "…schalten Sie den St" |
| Images | 29 large images incl. full-width feature graphics | hero + 6 thumbnails (full-res — data parity OK, presentation not) |
| Video | 2 YouTube embeds | 0 |
| Reviews | **Rivyo app widget**: 9 reviews, 4.8★, photo reviews | none |
| Commerce furniture | sticky add-to-cart, cross-sell accessories, related-products carousel, trust badges, payment icons | CTA + price alert |

### Facts that changed the plan

1. **Prod is current — no deploy lag on the PDP.** dealradar.me serves the gallery (6 full-res thumbs), the description block, and all 3 JSON-LD nodes from the latest code. The live Product JSON-LD `description` is confirmed to be the synthetic name string (FR-SEO-2 gap live). P0-4 is resolved as *verified, no action*.
2. **The truncation is user-visible in production**: the description paragraph ends mid-word exactly as stored — P0-1's impact is confirmed, not theoretical.
3. **Shopify `.js` verified**: `description` is the merchant's full rendered HTML (10,925 chars for this product — 7.3× what we store) including every feature block, the spec bullet list, and the YouTube embeds; `images` has 12 entries (we cap at 6); single variant. The daily verify/enrich jobs already download this exact payload — P2-2 (⚖A) is confirmed feasible and is the highest-leverage parity move.
4. **Reviews cannot be harvested from merchant structured data**: the merchant's single JSON-LD block contains **no** `aggregateRating`/`review` — ratings live only inside the Rivyo widget DOM/API. Option (ii) of ⚖C (JSON-LD harvest) is dead for this merchant; reviews are either out of scope or a Rivyo-widget scrape (higher effort, ToS-sensitive).

### Still open

- **AWIN feed header dry-run** (needs the `AWIN_FEED_URL` GitHub secret): which ignored columns (`ean`, `product_short_description`, `specifications`, …) are requested-but-dropped vs never-requested. Sizes P2-1 (⚖B).
