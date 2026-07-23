# Spec: Multi-Market Activation

**Status:** DRAFT v1.2 — pending your review/approval (brainstorming-skill flow: this doc is the review artifact; on approval this becomes a Phase-2 implementation plan).
**Date:** 2026-07-23. **Trigger:** the 64-joined-vs-16-producing coverage audit (`audit/2026-07-16_pdp-richness-root-cause` lineage) found 29 joined AWIN programmes excluded by a German-only ingest policy, while the frontend (13 locales, a 16-country selector, per-country currency formatting, countried product-ID namespace) is already built for most of those markets.
**Revision notes:**
- **v1.1 → v1.2:** expanded scope per owner instruction — this must behave as a genuine multi-regional, multilingual ecommerce platform (filter/search/rendering fully wired per market, automatically, on ingest), not just a data pipeline. Added §4.7 (verified: search/filters already correctly country-scoped, zero new code needed per market) with two concrete gaps found (sitemap hardcoded to `country: 'DE'`; subcategory matching German-only) and one open architecture decision flagged, not resolved unilaterally (§9 Q9 — country in the URL, given it touches the locked M2 URL/slug spec and live SEO equity).
- **v1 → v1.1:** owner decision to add US as an in-scope market (resolving §9 Q1), given its own Wave 3 rather than folded into "non-EUR" — see §1, §3, §5, §6 for what that decision entails technically and legally.
- **v1:** the design presented in chat keyed "market" off the feed's `Language` field. Verifying against AWIN's own `affiliate_programmes.country_code`/`primaryRegion` (a more authoritative signal) found that framing wrong in a way that changed scope — see §3.

## 1. Objective

Every joined AWIN programme whose market (`country_code`) matches one of the 17 countries in scope (the 16 already live in `src/lib/geo/countries.ts` + US, added by owner decision below) should be ingested, verified, and rendered exactly as smoothly as the German catalog is today — same pipeline shape, same watchdog coverage, same budget discipline — with no jurisdiction going user-visible ahead of its legal clearance.

**This is a multi-regional, multilingual ecommerce platform requirement, not just a data-pipeline one:** once a market's products are ingested, changing the country filter must render that market's merchants' products, and search/category/brand filtration must fully comply per market — automatically, with zero incremental per-market UI code. §4.7 verifies this is already true architecturally for whatever markets have data (search/filters already read `country` correctly), identifies two concrete gaps that would otherwise silently break it (sitemap hardcoded to DE; subcategory matching German-only), and frames the one real open architecture decision — whether market should live in the URL, not just a cookie — as a choice for you, not a default I pick silently (§9 Q9).

**User decisions on record:**
- Full go-live target — all markets, not a narrow pilot (2026-07-23). This doc's rollout waves (§5) are a risk-sequencing mechanism *within* that target, not a scope reduction.
- **US added to the market list (2026-07-23), resolving §9 Q1.** US is legally and technically distinct in kind from the 16 EU/EEA-ish markets (no VAT/Impressum equivalent, tax-exclusive pricing convention, no shared verifier detection strategy) — it gets its own Wave 3 (§5) rather than folding into the "non-EUR" bucket, so those differences stay visible rather than getting averaged away.

## 2. Current state (verified, no work needed)

- **Rendering is market-ready today for 16 of the 17.** 13 `next-intl` locales; `COUNTRIES` array (`src/lib/geo/countries.ts`) already lists DE, AT, FR, ES, IT, PL, NL, PT, SE, RO, GB, BE, DK, FI, NO, CH with correct default locale + ISO currency per country; IP/geo auto-detect (`/api/geo`) already resolves a visitor to one of these; `deals.country` + `.eq('country', …)` filtering is already wired everywhere a listing renders. **US is NOT yet in `COUNTRIES`** — unlike the other 16, it needs one new array entry (`{ code: 'US', name: 'United States', locale: 'en', currency: 'USD' }`) as part of this spec's implementation, not just an ingest change. `formatPrice` already takes currency from the deal row (not from the UI locale), so `en` + `USD` formats correctly with zero new i18n work — verified: `Intl.NumberFormat('en', { style: 'currency', currency: 'USD' })` is a valid, already-exercised code path.
- **Identity is market-ready today.** Product IDs are already countried: `awin:{COUNTRY}:adv{advertiserId}:{id}` (M2 URL-spec D3, locked). No re-keying needed to add a market.
- **Categorization is market-ready today (with one caveat).** `CATEGORY_RULES`/`mapGoogleCategory` match AWIN's/Google's own English-language taxonomy strings, not the product's content language — categorization works in any market out of the box.
- **Acquisition is the only thing that's DE-only**, and only via one config file + one hardcoded default: `scripts/lib/feed-policy.json` (`language: "German"`, `currencies: ["EUR"]`) and `ingest-awin.cjs`'s `--country DE` default. The scheduled workflow only ever invokes ingest once, with those defaults.

## 3. Correction: market identity is `country_code`, not feed `Language`

AWIN's `affiliate_programmes.raw.primaryRegion.countryCode` (captured by `awin-programmes-sync.cjs` on every joined programme) is the advertiser's actual market. The feed's `Language` field is just how AWIN happens to publish that feed — the two can diverge. Verified against all 64 joined programmes:

| True market (`country_code`) | In scope? | Count of the 29 language-excluded |
|---|---|--:|
| GB | Yes | 10 |
| **DE** | Already our market | **6** |
| NL | Yes | 3 |
| FR | Yes | 2 |
| ES | Yes | 1 |
| PL | Yes | 1 |
| **US** | **Yes — added by owner decision (2026-07-23); see Wave 3, §5** | **6** |

**Consequence for design:** `feed-policy.json` v2 (§5.1) keys markets by `country_code`, and per-market feed selection accepts **any** `Language` value for that market rather than assuming one canonical language per country — the DE-market finding below proves a single country can legitimately publish feeds in more than one language.

**Two findings that change scope, not just data:**

- **Quick, independent fix (no multi-market risk):** 6 programmes — Autofull EU, Hollyland DE, Matten Welt DE, logo-matten DE, MagazinMomente DE, Liki24 DE — are `country_code=DE`, `currency=EUR`, i.e. already inside today's approved German/EUR policy, but excluded solely because their feed's `Language` string isn't `"German"`. Relaxing the language check for `country_code=DE` specifically is a same-market change (zero new currency, zero new legal jurisdiction, zero new watchdog/budget surface) and can ship **before and independently of** the wider rollout in §5.
- **US added by owner decision (§9 Q1, resolved 2026-07-23):** 6 programmes (The Aeternum Company, Buture, Ouros Jewels, MISSHA US, Telusion Inc, APE BORN Fitness) are `country_code=US`. Unlike a language fix, this is a genuinely new market — new currency (USD), a legal regime categorically different from the EU/EEA G2 gate (no VAT, no Impressum-equivalent, FTC affiliate-disclosure rules instead of EU consumer-protection copy, tax-exclusive pricing convention vs the site's current tax-inclusive assumption), and a verifier price-detection strategy that doesn't yet exist (see §4.3). Given its own Wave 3 (§5) rather than folded into "non-EUR" so these differences stay visible.

Also surfaced, smaller: **Ireland (IE)** has one joined programme (Hoppa IE) but IE isn't in `COUNTRIES` either — same class of question as US, much smaller (1 programme, EUR currency so no currency-guard work, but still a legal/Impressum jurisdiction if added). Flagged in §9, not decided here.

## 4. Architecture

### 4.1 `feed-policy.json` v2 — market-keyed schema

```json
{
  "_doc": "FR-2.3 v2 — one entry per site market. 'languages' is the set of feed Language values ACCEPTED for that country (a country may legitimately publish in more than one — see the DE/English finding). Every joined programme's country_code must resolve to exactly one entry here or to the 'out_of_scope' list, checked by the SAME totality guarantee coverage.cjs already enforces for programme classification (2026-07-23 fix) — a country/currency combination with no entry is a watchdog red, not a silent drop.",
  "markets": [
    { "country": "DE", "languages": ["German", "English"], "currencies": ["EUR"], "wave": 0, "legal_cleared": true },
    { "country": "AT", "languages": ["German"], "currencies": ["EUR"], "wave": 1, "legal_cleared": false },
    { "country": "FR", "languages": ["French"], "currencies": ["EUR"], "wave": 1, "legal_cleared": false },
    { "country": "ES", "languages": ["Spanish"], "currencies": ["EUR"], "wave": 1, "legal_cleared": false },
    { "country": "IT", "languages": ["Italian"], "currencies": ["EUR"], "wave": 1, "legal_cleared": false },
    { "country": "NL", "languages": ["Dutch"], "currencies": ["EUR"], "wave": 1, "legal_cleared": false },
    { "country": "PT", "languages": ["Portuguese"], "currencies": ["EUR"], "wave": 1, "legal_cleared": false },
    { "country": "BE", "languages": ["Dutch", "French"], "currencies": ["EUR"], "wave": 1, "legal_cleared": false },
    { "country": "PL", "languages": ["Polish"], "currencies": ["PLN"], "wave": 2, "legal_cleared": false },
    { "country": "SE", "languages": ["Swedish"], "currencies": ["SEK"], "wave": 2, "legal_cleared": false },
    { "country": "GB", "languages": ["English"], "currencies": ["GBP"], "wave": 2, "legal_cleared": false },
    { "country": "RO", "languages": ["Romanian"], "currencies": ["RON"], "wave": 2, "legal_cleared": false },
    { "country": "DK", "languages": ["Danish"], "currencies": ["DKK"], "wave": 2, "legal_cleared": false },
    { "country": "NO", "languages": ["Norwegian"], "currencies": ["NOK"], "wave": 2, "legal_cleared": false },
    { "country": "FI", "languages": ["Finnish"], "currencies": ["EUR"], "wave": 2, "legal_cleared": false },
    { "country": "CH", "languages": ["German"], "currencies": ["CHF"], "wave": 2, "legal_cleared": false },
    { "country": "US", "languages": ["English"], "currencies": ["USD"], "wave": 3, "legal_cleared": false }
  ],
  "out_of_scope": []
}
```

`legal_cleared` starts `false` for every market except DE (already live); flipping to `true` is the ONLY thing that makes a market's data user-visible (§7) — it is deliberately not an engineering decision.

### 4.2 Ingest changes

- `ingest-awin.cjs` / `enhanced-feed.cjs`: no core rewrite. Both already accept `--country`/`--currency`/`--enhanced-language`. The per-fid/feed-list language filter (`activeLang = feeds.filter(f => f['Language'] === ENHANCED_LANGUAGE)`) generalizes from a single string to "any language in this market's `languages` array" — this single change is also what unblocks the 6-programme DE quick-win in §3.
- Programme→market resolution uses `affiliate_programmes.country_code` (already captured), not the feed's `Language`, as the authoritative key for which `feed-policy.json` market entry applies.

### 4.3 Verifier currency-guard generalization (accuracy-critical)

`verify-awin.cjs`'s `germanDomain = host.endsWith('.de') || host.startsWith('de.')` decides which merchant-page path is safe to trust for price/currency. This must generalize to `marketDomain` — keyed off the deal's `country`/expected currency, not a hardcoded `.de` check — or non-EUR markets (PLN/SEK/GBP/RON/DKK/NOK/CHF/**USD**) risk the verifier reading a wrong-currency storefront path and silently storing a wrong-currency price. This is the single highest-risk line item in the whole spec and gates Wave 2 (§5).

**US needs a third detection strategy, not just a new entry in the ccTLD table (§9 Q7).** The `.de`/`de.` heuristic assumes country-signaled domains/paths — true for the EU markets' typical Shopify multi-market setups (`/fr/`, `/es/` paths or ccTLD subdomains alongside a German fallback). Many US-market Shopify stores serve US content at the bare root domain with **no** country prefix at all, because US is often the merchant's default/primary market. No US programme rows exist yet to validate against, so this strategy is deliberately left undesigned here rather than guessed at — it's Wave 3 groundwork, not a Wave 3 blocker for the other waves.

### 4.4 Per-market budgets & watchdog

- `check-budgets.mjs` (`DB_ROW_LIMIT`, `AWIN_EGRESS_LIMIT_BYTES`, `GH_ACTIONS_MINUTES_LIMIT`) currently assumes one market's traffic. Multiply by active-market count for projections; report per-market egress so one market's feed bloat doesn't mask headroom loss for the rest.
- `coverage.cjs` reconciliation scopes per market (feed-list × joined × ingested, per `country_code`), reusing the totality guarantee already shipped (2026-07-23, `fix/statement-timeout-hardening`) so a programme can never again silently fail to classify.
- Coverage alert issue gains a market column so reds are traceable to a specific country's pipeline, not a flat merged list.

### 4.5 Fan-out: GitHub Actions matrix (your choice)

One workflow, `strategy.matrix` over `feed-policy.json`'s `markets` array (only entries with `wave <= currently-active-wave`, filterable). Each cell: ingest → verify → enrich → snapshot → promote → IndexNow, scoped to its country. Isolation: one market's feed failure/timeout doesn't block another's job. Concurrency: each cell needs its own `awin-data-plane-{country}` group (not the shared one added in the statement-timeout fix) — that group exists because DE ingest/verify collided on the *same rows*; markets never share rows, so a shared group across markets would only add unnecessary queuing.

### 4.6 Known limitation, not a blocker: `NAME_CATEGORY_OVERRIDES`

These regexes (`balkonkraftwerk`, `katzenfutter`, …) are German-keyword product-line refinements layered on top of the English-taxonomy base rules. In non-German markets they simply won't match — those specific product lines fall back to the still-correct English-taxonomy category, not to "electronics" or an error. Categorization degrades in specificity, never breaks. Per-language override sets are a follow-up refinement (tracked, not scoped into this spec).

## 4.7 Multi-regional browsing, search & filtration (verified, not assumed)

The user's requirement is explicit: changing the country filter must render that market's merchants' products, and search/filters must fully comply per country/language — i.e. this should behave like a genuine multi-regional, multilingual ecommerce platform, not a single-market site with a country label bolted on.

**Already correct today (verified by reading the actual query code, not inferred):**
- `queryDeals(filters)` (`src/lib/db/deals.repo.ts:130`) filters on `country` server-side for every listing (`home`, `category`, `search`).
- `distinct_brands(p_country, p_category)` (Postgres RPC, `schema.sql`) returns brand-filter options **scoped to the selected country and category** — a market with different merchants automatically gets a different brand-filter list, no code change.
- `/api/search` (`src/app/api/search/route.ts`) requires and validates `country` (`isSupportedCountry`) on every request and scopes both product results and brand suggestions to it.
- `CATEGORIES` (`src/lib/categories.ts`) is a static, language-agnostic slug taxonomy (`electronics`, `fashion`, …) shared across every market — the same category structure works for every country; only the *deals within* a category differ per market (already handled by the point above).

**Consequence:** the requirement "filter change renders that market's products, search/filters comply" is **already satisfied architecturally for any country that has ingested data**. Once a market's rows exist (§4.1–§4.6, §5), they appear in its homepage, category pages, search, and brand filters automatically — zero incremental UI/filter code per market. This is the "auto-render on ingest" principle the user asked for, and it's a property of the existing design, not new work — worth stating explicitly as a success criterion (§8) so it's verified, not just assumed to still hold as markets are added.

**Two concrete gaps found, both need fixing — neither is architectural, both are scoped bugs:**

1. **`getAllDealSlugs()` is hardcoded to `country: 'DE'`** (`src/lib/db/deals.repo.ts:404` — `fetchDealsAcrossProviders({ country: 'DE', limit: 200 })`). This function feeds the sitemap. As written, **every non-DE market's deal pages would be entirely absent from the sitemap** regardless of how well they're ingested — invisible to search engines, not just slow to be discovered. Fix: parameterize across all `wave <= active` markets from `feed-policy.json`, not a single hardcoded country. This is cross-cutting (blocks discoverability for every wave), cheap, and low-risk — recommend shipping it standalone, ahead of or alongside Wave 1, rather than folding it into any one market's rollout.
2. **Subcategory keyword-matching (`matchSubCategory`, `src/lib/categories.ts`) is German-only today** — its own code comment confirms this ("Pharmacy catalogue (Aliva) is German — leaf terms are the German words…"). Same failure class as `NAME_CATEGORY_OVERRIDES` (§4.6): a non-German product simply gets no subcategory match (graceful — the breadcrumb/leaf-link section just doesn't render, per the existing "skipped when nothing matches" behavior) rather than a wrong or broken one. Per-language leaf-term sets are follow-up refinement, not a launch blocker, same as §4.6.

**Open architecture decision — country in the URL (not resolved here, see §9 Q9):** listing-page market resolution being cookie-based is fine for the interactive experience (fast, no navigation, already correct per-request) but means there is no independently crawlable/shareable/bookmarkable URL for a market's homepage or category listing — a real gap against "think like a multi-regional ecommerce platform" (industry pattern: a URL segment identifying the market, e.g. `/en-gb/`, `/en-us/`, `/fr-fr/`, alongside or replacing the current UI-language-only locale segment). This is **not decided in this spec** because it interacts directly with your locked M2 URL/slug spec and the live, already-indexed DE catalog's SEO equity — changing top-level URL structure is exactly the kind of hard-to-reverse, large-blast-radius action that needs your explicit sign-off, not a default I pick. §9 Q9 frames the safe (additive, non-breaking) option alongside the fuller (riskier, higher-payoff) one.

## 5. Rollout waves (risk sequencing within the all-17 target)

- **Cross-cutting prerequisite (ships before/alongside Wave 1, blocks nothing else):** fix `getAllDealSlugs()`'s hardcoded `country: 'DE'` (§4.7 finding 1) so the sitemap covers every active market. Cheap, low-risk, zero legal/currency surface — but every wave's discoverability depends on it, so it should not wait behind any single market's rollout.
- **Wave 0 (done):** DE. Also absorbs the §3 quick-win (6 DE-market English-feed programmes) as soon as §4.2's language-set generalization ships — this can land ahead of everything else below with no new legal/currency surface.
- **Wave 1 — EUR markets:** AT, FR, ES, IT, NL, PT, BE. Currency arithmetic is already proven (EUR); validates the matrix, market-keyed policy, and per-market watchdog end-to-end before touching currency risk.
- **Wave 2 — non-EUR EU/EEA markets:** PL (PLN), SE (SEK), GB (GBP), RO (RON), DK (DKK), NO (NOK), CH (CHF). Gated on §4.3 (verifier currency-guard generalization) landing and being verified — this is where a currency bug would actually cost money, so it goes last among the EU/EEA waves and gets the most scrutiny.
- **Wave 3 — US.** Deliberately separated from Wave 2, not bundled as "just another non-EUR market" — the legal regime is different in *kind*, not degree: no VAT/Impressum equivalent (state sales tax + FTC affiliate-disclosure rules instead, §6), tax-exclusive pricing convention (vs. the site's current tax-inclusive assumption baked into the price display), and its own verifier market-detection strategy still to be designed (§4.3). Gated on all of §4.3's Wave-2 currency-guard work **plus** the US-specific domain-detection strategy **plus** its own legal review track (§6) — expect Wave 3 to land after Wave 2, not alongside it, even though both were approved in the same "full go-live" decision.

Each wave is a mergeable, independently-reviewable PR — not a single 17-market cutover.

## 6. Legal/compliance workstream (parallel, not silently skipped)

Your v3.1 ground truth already locks **G2** as a permanent human gate: "legal copy sign-off / real Impressum identity — blocks EU prod launch," and today's imprint carries placeholder identity (`VAT BE 0123.456.789`, `contact@dealradar.eu`). Serving deals to real users in a new jurisdiction is a legal act (VAT display rules, Impressum, consumer-protection copy), not a deploy.

**Mechanism:** each market's `legal_cleared` flag in `feed-policy.json` (§4.1) is the single switch between "data is correct and verifiable in the DB" and "data is shown to users." A market can sit fully ingested/verified/watchdog-green with `legal_cleared: false` indefinitely — engineering is never blocked waiting on legal, and no jurisdiction goes live silently. The build reports, loudly (watchdog digest + a dedicated status line), every market that is code-ready but `legal_cleared: false`, so the legal backlog is always visible, never buried.

This spec does not include the legal copy itself (G2 sign-off is explicitly owned outside engineering per v3.1) — it includes the flag and gate that makes engineering readiness independent of, and never a substitute for, that sign-off.

**US is a separate legal track, not "G2 in English."** The v3.1 G2 gate was scoped around EU Impressum/VAT — the US has neither. Distinct items, each needing its own confirmation before `legal_cleared` can flip for `country=US` (listed so nothing here gets silently assumed-covered by the existing EU work):

- **Affiliate disclosure:** FTC 16 CFR Part 255 (Endorsement Guides) governs how affiliate relationships must be disclosed to US consumers — the existing EU-oriented disclosure copy needs review against this specifically, not assumed equivalent.
- **Sales tax:** no VAT; US sales tax is state-by-state with nexus rules that vary by state. Since DealRadar links out rather than transacting directly, this is less "do we collect tax" and more "is the displayed price presented in a way that doesn't misrepresent the final price" (see the tax-inclusive-vs-exclusive point in §3/§5) — needs its own review.
- **Privacy:** no single federal law equivalent to GDPR; state-level laws (e.g. CCPA) apply based on visitor/business criteria that need their own assessment, separate from whatever GDPR-consent flow the site already has for EU visitors.
- **Business registration/identity:** whether US operation requires anything beyond what the Impressum-equivalent work already produces is a question for counsel, not assumed here either way.

## 7. Testing & verification

- Unit: `feed-policy.json` v2 schema validation; the generalized language-set matcher (fixture: the 6 DE/English programmes must now resolve); the market-domain currency guard (fixture per currency — EUR, PLN, SEK, GBP, RON, DKK, NOK, CHF, USD — incl. a deliberately-wrong-market response that must be rejected).
- Integration: one live dry-run ingest per Wave-1 market before `--upsert`, comparing row counts against the coverage watchdog's independent feed-list count (the same reconciliation that already catches drift for DE).
- **Multi-region rendering (§4.7):** after the first non-DE market lands (Wave 1), verify — not assume — that its country's homepage, category pages, search, and brand filters return only that market's deals with zero new code deployed for it (the "auto-render on ingest" property); verify the sitemap (post cross-cutting-prerequisite fix) includes that market's deal URLs.
- The acceptance harness (`scripts/verify-spec-pdp-content.mjs`) TH-1/TH-2/TH-3 invariants apply identically per market — a French deal with no image is exactly as much a defect as a German one.

## 8. Success criteria

- Every joined programme whose `country_code` is one of the 17 site countries is ingested and watchdog-classified (green/red/yellow, never unclassified).
- The 6 DE/English quick-win programmes are producing rows.
- Each Wave-1/2 market, once its ingest lands, shows non-zero visible deals when selected in the country selector, with correct currency formatting and no cross-currency price errors (verified by the §4.3 guard's test fixtures).
- No market's data is user-visible with `legal_cleared: false`.
- `check-budgets.mjs` reports per-market egress/row projections that stay under a to-be-confirmed multi-market ceiling (§9, Q3).
- **Zero incremental UI/filter/search code per market** (§4.7): a newly-active market's products, brand filters, and search results appear correctly the moment its data lands — verified per Wave-1 market, not just assumed to hold from the DE case.
- The sitemap includes every active market's deal URLs (§4.7 finding 1 fixed) — not just DE's.

## 9. Open questions (must resolve before/alongside implementation)

- **Q1 — RESOLVED (2026-07-23):** the 6 US programmes are in scope; US added as Wave 3. See §5, §6.
- **Q2 — Ireland (Hoppa IE):** add IE as an 18th market (EUR, no currency risk, still its own legal jurisdiction) or leave out-of-scope? Still open.
- **Q3 — budget ceilings:** `DB_ROW_LIMIT`/`AWIN_EGRESS_LIMIT_BYTES`/`GH_ACTIONS_MINUTES_LIMIT` were sized for one market. What's the intended multi-market ceiling — linear scale-up (×17), or a lower shared cap that forces prioritization? Still open.
- **Q4 — dual-language markets:** BE (Dutch+French) and CH (German, but French/Italian-speaking regions exist) — is single-language-per-market sufficient for now, or does day-one need multi-language-per-country from the start? Still open.
- **Q5 — wave pacing:** ship Wave 1 and Wave 2 as they clear code-readiness, or hold all launches until every market in a wave has `legal_cleared: true` together? Still open.
- **Q6 — US pricing display:** should US deals show a "prices may not include tax" style disclaimer, given the site's current price display implicitly assumes VAT-inclusive (EU) pricing (§3, §6)? Needs a copy/UX decision, not just a legal one.
- **Q7 — US verifier market-detection strategy:** no design proposed yet (§4.3) — needs real US programme data to validate against once Wave 1/2 groundwork exists. Blocks Wave 3 specifically, not the other waves.
- **Q8 — US legal review track:** who owns FTC-disclosure/sales-tax/CCPA review (§6) — same counsel as the EU G2 work, or does it need separate US counsel? Needed before Wave 3's `legal_cleared` can flip.
- **Q9 — country in the URL (§4.7), NOT resolved here — needs your explicit sign-off given the stakes:**
  - **Option A (safe, additive, recommended default if no decision is made):** keep the current cookie-based interactive UX as-is; add a separate, purely-additive crawlable entry point per market (e.g. `/[locale]/country/[country]` rendering the same homepage/category components with an explicit canonical URL + hreflang) so search engines have *something* indexable per market, without touching the existing locale-only URL scheme, the locked M2 PDP slug format, or any already-indexed DE URL.
  - **Option B (fuller, standard multi-region ecommerce pattern, higher payoff, real risk):** fold country into the primary URL segment (e.g. `/en-gb/`, `/en-us/`, `/fr-fr/` replacing today's `/en/`, `/fr/`) so every listing page is natively market-specific and crawlable — matches how large multi-region ecommerce sites are typically structured, but is a top-level routing change requiring redirects for every existing indexed URL, interacts with the locked M2 URL/slug spec, and risks temporary ranking impact on the live DE catalog if done carelessly. Would need its own dedicated design pass (redirect strategy, hreflang audit, M2-spec amendment) before implementation — not decided or scoped here.
  - This question does not block Wave 1 (Option A can ship after the cross-cutting sitemap fix, independent of legal/currency work) but should be answered before Wave 2/3, since retrofitting a URL-architecture decision across more markets is more expensive the longer it's deferred.
