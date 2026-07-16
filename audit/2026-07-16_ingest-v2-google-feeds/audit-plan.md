# Ingest-v2 (AWIN Google-format feeds) — plan (final, Pass 2-enriched)

**DECISIONS (user, 2026-07-16):** Q1 = **(a) deals-only + derived discounts** — every product of a joined advertiser is ingested (populated, `hidden` until a discount is proven via Shopify compare-at capture or price-history drops); published pages remain genuine deals. Q2 = **launch now with countried IDs** (`awin:{COUNTRY}:adv{advertiserId}:{id}`); rows ride the M2 migration like existing ones; coordinate C8 with the M2 lane.

Goal: every joined advertiser's eligible products flow into the site and its full publication surface, with a watchdog proving coverage continuously. Evidence: `findings.md` (live probes of all 10 active Google feeds, Feed-API docs, M2 spec constraints).

## The two decisions that gate everything (Pass 3)

**Q1 — Catalog scope.** All 10 active Google-format feeds carry **zero `sale_price`** (7,100/7,100 rows) — the current deal gate yields 0 products from them, permanently. Options:
- **(a) Deals-only + derived discounts** — ingest all products as rows, publish only those with a discount we can *prove*: live-shop verifier reads Shopify compare-at prices (machinery exists), and `price_history` baselines detect real price drops over time. Catalog stays curated (~1-3k pages est.); coverage = "every advertiser's genuinely discounted products". Advertisers with no real discounts show 0 — honest but ≠ literal "100% indexed".
- **(b) Tiered catalog** — deals keep full deal-PDPs; every other product of a joined advertiser gets an indexable product page (price-watch framing, no fake discount). 100% populated AND indexed; DE-language actives ≈ +12k pages now (ROCKBROS 5.1k, Hollyland 455, others ~1.4k, Imou 555…), EN/NL feeds (logo-matten 71.5k, Babubas 17k) deferred behind a market/language decision. Requires capacity work (P1) and thin-content guardrails.
- **(c) All-products, one page type** — maximal literal coverage incl. 71.5k English rows on a German site; worst SEO-quality/capacity profile. Not recommended.

**Q2 — Sequencing vs the M2 URL migration** (M2 approved, zero implementation yet). Ingest-v2's identity MUST be countried from day one (`awin:{COUNTRY}:adv{advertiserId}:{merchantProductId}` — locked D3). Options: launch **after M2 Phase D** (cleanest — ingest never composes slugs), or launch **now** with the final namespace (rows carry legacy 308-slugs through the migration like all existing rows — cosmetic, bounded). Either way, coordinate with M2 task C8 (countried ids in ingest-awin.cjs).

## P0 — pipeline (scope-independent core)

| # | What | Key facts baked in | Effort |
|---|---|---|---|
| 1 | **Feed-list-driven acquisition**: pull feed list (existing key) → filter `active` → download every feed URL (both formats, CSV) → dispatch per `Datafeed Format` flag. Retire the single Create-a-Feed URL (or keep as fallback) | Empirically verified: Google feeds are plain CSV via feed-list URLs, same key; 62-col schema byte-stable across all 10; BOM must be stripped; staleness field available (`Last Imported`) | M |
| 2 | **Google-format normalizer** (`scripts/lib/enhanced-feed.cjs`): `"26.99 EUR"` price parse; `availability` enums; `image_link` (galleries via existing enrich job — `additional_image_link` is empty in practice); `gtin`/`mpn`/`brand`/`condition`/`item_group_id`; `google_product_category` TEXT-path → category map; `aw_deep_link` as shopUrl; drop rows without it | Sample-verified against real feeds; sale_price absent — discount fields come from Q1 machinery, not the feed | M |
| 3 | **Identity**: `awin:{COUNTRY}:adv{advertiser_id}:{id}` for enhanced rows (permanent; never re-key). Country from feed currency+advertiser region policy: EUR/DE feeds now; GBP/USD feeds gated on market policy | M2-D3-compliant; distinguishable tail avoids classic-id collisions; coordinate with C8 | S |
| 4 | **Writer contract compliance** (new for both ingests): always fresh `last_updated`; never lifecycle columns; run-id watermark + skip-if-last-failed + >10% expiry tripwire + failure alerting | Required by M2 spec.md:113-124 regardless of launch timing | S-M |
| 5 | **Coverage watchdog**: nightly reconciliation of feed-list actives × per-feed download success × per-advertiser DB counts × staleness (`Last Imported`), joined into the programmes-sync digest; alert on any joined advertiser at 0 products, any feed >14 days stale (ROCKBROS legacy is 2 months stale TODAY), any download failure | The "ensure 100%" invariant; also catches the soft-membership merchants absent from the feed list | M |
| 6 | **Category mapping v2**: Google taxonomy text-path → CategorySlug (map the ~20 paths actually present in active feeds first, log-and-default unknowns with a weekly digest of unmapped paths) | Text paths, not IDs (verified); wrong mapping breaks categories/menus/breadcrumbs/internal links | S-M |

## P1 — publication + scale (sized by Q1)

| # | What | Why |
|---|---|---|
| 7 | Derived-discount machinery (if Q1=a or b): verifier captures Shopify compare-at as `original_price` evidence; price_history drop-detection (e.g. price < 30-day median − x%) promotes to deal; demotion symmetric | The only honest discount source for these advertisers |
| 8 | Verifier/enrich at scale: rotating sample + priority tiers (new rows, deals, top-traffic first); per-host budgets | Linear daily verification breaks past ~10k rows |
| 9 | Out-of-stock policy: keep as unavailable pages (Hollyland: 67% OOS) vs drop — align with existing hidden/OutOfStock machinery (T-ING-11) | Google feeds mark OOS explicitly; v1 drops at ingest |
| 10 | price_history retention/sampling for non-deal rows; Supabase capacity check | 12k-200k rows/day depending on Q1 |
| 11 | Netlify: ISR for PDPs/lists + sitemap response caching (queued since the usage_exceeded outage); M2 Phase-E crawl-budget re-measurement before large inventory lands | Crawl-heavy GEO strategy × per-request functions |
| 12 | Variant policy: `item_group_id` empty in practice today — treat ids as products; revisit if feeds start filling it | Evidence-based deferral |

## P2 — surface enrichment

| # | What |
|---|---|
| 13 | Internal linking: brand-filter links on PDPs, related-products (category+brand), `product_type`/taxonomy-derived tag pages (only when data non-empty) |
| 14 | ItemList JSON-LD on category/listing pages |
| 15 | EU display data when present: `energy_efficiency_class`/`certification` columns exist in schema; visible delivery info stays gated on legacy-feed delivery columns (enhanced `shipping` cells are empty in practice) |
| 16 | Optional: api.awin.com JSONL endpoint as acquisition redundancy (existing `AWIN_API_TOKEN`; ≤5 req/min) |

## Will not do

- Un-countried identity, or launching then re-keying (M2 non-negotiable).
- Fabricated discounts: no "was-price" without feed signal, Shopify compare-at evidence, or recorded history.
- Literal indexing of EN/NL feeds into the DE site without an explicit market/language decision (ties to M2 D3 and locale strategy).
- Slug composition inside ingest-v2 (slug authority is the DB trigger per M2 D2).

## Changes from pass 1

1. **Deal-gate finding upgraded to decisive**: not "unknown discount availability" but empirically **zero** across all 10 feeds → Q1 restructured around derived discounts vs tiered catalog; naive "parser-only" v2 would ship nothing.
2. **Identity corrected**: Pass-1's `awin:{advertiser_id}:{id}` violated locked M2-D3; now `awin:{COUNTRY}:adv{advertiserId}:{id}` + permanent-namespace warning + C8 coordination.
3. **M2 became the critical path**: launch-after-Phase-D (clean) vs launch-now-countried (bounded legacy-slug noise) — new Q2.
4. **Acquisition de-risked**: feed-list URLs serve Google feeds as CSV with the existing key (empirical) — no OAuth/JSONL dependency; api.awin.com demoted to optional P2.
5. **New writer-contract work item (P0-4)** from the M2 spec; applies to ingest-v1 too.
6. **Watchdog widened**: staleness alerts (ROCKBROS legacy 2 months stale; Renogy-GB 6 weeks) + three-set reconciliation (feed-list actives ≠ nightly-feed merchants ≠ DB).
7. Variant handling demoted (item_group_id empty in practice); out-of-stock policy added (Hollyland 67% OOS).
8. Fresh numbers: 13 active advertisers, 8 Google-only, 1,991 invisible products (was 4 / 1,118 on 07-15).

## Close-out (2026-07-16, same day)

Phase A shipped (d7c90aa) + verifier timeout fix (63b77bb). First full sweep results:
**860 of 5,141 enhanced products promoted to live deals with verifier-proven Shopify compare-at discounts** — ROCKBROS 370 (avg −27%, max −62%), Renogy 249 (−34%/−63%), Welax 113, AOSU 86, Omidi 36, ANTHBOT 6. Every live row has discount > 0 (no fabrication, verified in DB). Visible catalog: 811 → 1,671; sitemap auto-grew to 4 chunks; IndexNow submitted 5,930 URLs; verify-deploy fully green. Remaining plan items: coverage watchdog (P0-5), writer-contract watermark (P0-4), verifier rotation at further scale (P1-8), Netlify ISR (P1-11), EN/NL market decision.
