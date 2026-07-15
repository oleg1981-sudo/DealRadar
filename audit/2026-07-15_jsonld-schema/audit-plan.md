# JSON-LD schema audit — plan (final, Pass 2-enriched)

Goal: close every Google flag that can be closed **honestly**, align the markup with the experience this page is actually eligible for (product snippets — Google's own "shopping aggregator" case), and fix the two page-level issues the same test run surfaced. No fabricated data, ever. Evidence sources: `findings.md` §Pass 2.

## P0 — flagged by Google, confirmed limits, trivial and safe

| # | What | Why | Where | Effort |
|---|---|---|---|---|
| 1 | Cap JSON-LD `name` at ≤150 chars (word-boundary truncate; `<h1>`/`<title>` keep the full name) | Clears "Invalid string length in field 'name'" (157 live vs the Merchant-Center 1–150 rule the validator mirrors); same 150 limit as OpenAI's feed spec. Truncation ≠ parity violation (sd-policies targets invisible/misleading content). | `src/app/[locale]/deal/[slug]/page.tsx:84` | XS |
| 2 | Cap JSON-LD `description` at ≤5,000 chars (word-boundary truncate, reuse the `feedDescription`-style cut) | Clears "Invalid string length in field 'description'" (5,572 live vs 1–5,000); −5 KB HTML; MC best practice front-loads the first 160–500 chars, which the feed text already does. Competitors ship far less (127 chars / empty). | `page.tsx:89` + shared truncation helper with unit tests | XS |

## P1 — honest completeness/quality levers

| # | What | Why | Where | Effort |
|---|---|---|---|---|
| 3 | Localized `aria-label` on the LocationPicker header button | Fixes the failed A11y audit AND the failed Agentic-Browsing audit (button's only always-visible content is an `aria-hidden` icon on mobile). Agent navigability is a stated GEO goal; visible/accessible HTML is the extraction surface chat engines actually read. | `src/components/layout/LocationPicker.tsx:35-44` | XS |
| 4 | Identifier coverage: gtin (from `ean`, numeric form) / `mpn` / `sku` (`merchant_product_id`) — **blocked on regenerating the AWIN Create-a-Feed URL** (user-side dashboard action, already tracked as parity-audit P2-1 ⚖B) | Clears the "No global identifier" warning class; identifiers gate Shopping-Graph/knowledge-panel seller-list matching — the aggregator placement we want. Emission code for gtin/mpn already exists (`page.tsx:91-92`); columns are 0/836 populated. | AWIN dashboard → verify fill-rate post-ingest → add `sku` emission | S (repo) + user action |

## P2 — quality/consistency improvements

| # | What | Why | Where | Effort |
|---|---|---|---|---|
| 5 | Contrast pass: accent-on-white merchant label, `zinc-400` was-price, affiliate badge, CTA text | 4 AA contrast failures; legibility of price/CTA column = CTR; visible text is what AI engines extract | `page.tsx:196,203`, badge component, `tailwind.config.ts` | S |
| 6 | Conservative trailing-model-code extraction (strict `\| CODE$` pattern) → `model` when `mpn`/`model_number` empty | Recovers an identifier for feeds like BlazeVideo ("… IP66 \| A323") without fabrication; also useful once feed regen lands | ingest or `page.tsx` | S |
| 7 | Point the subcategory breadcrumb `item` at an indexable URL (or emit only 2 crumbs in JSON-LD) | Last BreadcrumbList node resolves to noindexed `/search` | `page.tsx:133,142` | XS |
| 8 | Enrich the site-wide `Organization` node: `sameAs` (when social/profile URLs exist), `description` | "Entity layer" repeatedly cited as the highest-leverage schema for AI-Mode citation (practitioner evidence); cheap | `src/app/[locale]/layout.tsx:43-49` | XS — gated on profiles existing |
| 9 | Drop the `priceSpecification` sub-node (`valueAddedTaxIncluded`) | Removed from Google's docs entirely (zero references in current merchant-listing/product-snippet pages); duplicates `price`; dead weight — keep only if we value the schema.org-level VAT declaration for EU users | `page.tsx:101-106` | XS |
| 10 | Perf trims: render-blocking CSS (420 ms), Baseline-feature polyfills via `browserslist` (11 KB) | Perf already 99 — opportunistic only | `next.config.mjs`, `package.json` | S |

## Will not do (decision records — the answer to 2 of the 4 GSC flags)

| Item | Why not |
|---|---|
| `shippingDetails` | Merchant-listing-only field; affiliate pages are **explicitly ineligible** ("Only pages where a shopper can purchase a product are eligible… not pages with links to other sites"). Emitting merchant shipping terms we don't control/display violates the visible-content parity policy. 0/5 competitors emit it. *Visible* delivery info on the PDP remains valuable (ChatGPT-shopping rank lever) — that's parity-audit P1-2, fed by `delivery_cost` columns after feed regen. |
| `hasMerchantReturnPolicy` | Same eligibility + parity reasoning; no return-policy data exists anywhere in the pipeline; would fabricate a legal commitment. |
| `priceValidUntil` | **Reversed from Pass 1**: a past date actively suppresses the product snippet (documented) — a verifier outage would convert a freshness signal into a kill switch. Omission is documented-safe; 0/5 competitors emit it. Freshness is already signaled via honest sitemap lastmod + IndexNow-on-price-change (Bing-endorsed) + visible verified-at text. |
| `aggregateRating` / `review` | No review data exists; fabrication violates Google policy and FR-PDP-6; chat engines don't read JSON-LD live, so there's no gray-area upside either. |
| `AggregateOffer` conversion | Google's aggregator template uses it for **multi-seller** lists; our deals are single-merchant offers — plain `Offer` is correct (and `offerCount: 1` triggers warnings; see code comment `page.tsx:77-79`). Revisit only if multi-shop price comparison per product ships. |
| `FAQPage` / `positiveNotes`/`negativeNotes` | No editorial/Q&A content source; FAQ rich results are restricted anyway. Revisit if deal write-ups become a feature. |
| Locale-translated product content | Feed reality; belongs to URL/slug spec v2 (M2). Chat engines favor the dominant-language URL regardless (GSQI study). |

## Validated as already-correct (no action)

Server-rendered JSON-LD in initial HTML (Google warns against JS-generated Product markup); XSS escaping; single `Offer` for single-seller deals; robots access for OAI-SearchBot/PerplexityBot/etc.; IndexNow on price updates; visible verified-at timestamp; honest-lastmod sitemaps; refusal to fabricate ratings.

## Changes from pass 1

1. **`shippingDetails` demoted P1→will-not-do**: was "investigate-then-implement"; Google docs + parity policy + 0/5 competitor adoption settle it. The underlying feed columns still matter, but for *visible* PDP content (parity audit P1-2), not markup.
2. **`priceValidUntil` reversed P1→will-not-do**: the past-date suppression rule makes it asymmetric-downside for volatile affiliate prices.
3. **`hasMerchantReturnPolicy` confirmed N/A** (was provisional P2 "document-as-N/A").
4. **Identifiers merged into one item (P1 #4)** and re-anchored on the AWIN feed-URL regeneration dependency discovered in the sibling parity audit (0/836 fill rate — emission code already exists).
5. **New P2s from research**: Organization `sameAs` entity enrichment (#8); drop the doc-orphaned `priceSpecification`/`valueAddedTaxIncluded` (#9).
6. **P0s unchanged but now doc-confirmed** (150/5,000 from the MC spec; identical OpenAI feed limits), and the "aggregator page" framing confirms the overall markup shape is right.
7. Added "Validated as already-correct" section — the E2E/deploy work of the last week aligns with the strongest-evidence AEO levers (freshness, crawler access, visible facts).
