# DealRadar Remediation — Requirements (EARS) + Coverage Matrix
> Generated from `plan.json` (Tier-A validated by `validate_plan.mjs`). Do not hand-edit; edit plan.json and re-render.

**Counts (machine-checked):** 56 requirements · 51 baseline items (51/51 MAPPED) · provenance: 43 stated / 13 inferred · priority: P0=6 P1=23 P2=13 REGRESSION=14.

**EARS legend:** ubiquitous (`The system SHALL`) · event (`WHEN…THEN…SHALL`) · state (`WHILE…SHALL`) · unwanted (`IF…THEN…SHALL`) · optional (`WHERE…SHALL`). REGRESSION = already implemented in code (audit-verified); locked as a regression gate, not new build.


## R-ING — Ingestion & Data Pipeline

### R-ING-1 · [P1] · event · _stated_
**Story:** As the platform, I ingest live deals from Strackr so multi-network coverage is real.

**Requirement:** WHEN /api/refresh runs with STRACKR_API_KEY present THEN the system SHALL fetch from the Strackr publisher endpoint and map each result into NormalizedDeal.

**Acceptance:**
- src/lib/providers/strackr.ts exports a StrackrProvider implementing PriceProvider
- with STRACKR_API_KEY unset init() returns {ok:true,isMock:true} and fetchDeals returns generateMockDeals (0 network calls)
- StrackrProvider is present in ALL_PROVIDERS (registry.ts) and tsc --noEmit exit 0
- discountPercent is derived via the shared computeDiscountPercent guard, not an unguarded inline formula

**Trace:** baseline B-ING-1, B-ING-2 · original FR-ING-1, FR-ING-2, Task-4.1, Task-4.2 · findings S4-strackr-provider · tasks T4.1 · components C-strackr, C-registry

### R-ING-2 · [P1] · state · _inferred_
**Story:** As the dedup engine, I receive eanCode so cross-merchant matching works.

**Requirement:** WHILE normalizing a provider/feed record that exposes a GTIN/EAN field the system SHALL populate NormalizedDeal.eanCode (else null).

**Acceptance:**
- grep shows >=2 providers and scripts/ingest-awin.cjs assign eanCode/ean_code from the source GTIN field
- a unit test asserts two records with equal EAN from different merchants dedupe to 1 survivor

**Trace:** baseline B-ING-2, B-ING-3 · original FR-ING-2, FR-ING-4 · findings S3-ean-branch-dead · tasks T4.2 · components C-providers

### R-ING-3 · [P1] · unwanted · _stated_
**Story:** As the dedup engine, I keep the best single offer per product deterministically.

**Requirement:** IF two deals share an EAN (or slugified name+merchant when EAN is null) THEN the system SHALL keep the lower salePrice, breaking exact-price ties by lower provider priority.

**Acceptance:**
- registry dedup contains an explicit equal-price tie-break on provider priority (not iteration order)
- 3 unit tests pass: EAN-survivor, name+merchant fallback, price-tie -> priority

**Trace:** baseline B-ING-3 · original FR-ING-4, Task-3.4 · findings S3-ean-branch-dead, V-1 · tasks T4.2 · components C-registry

### R-ING-4 · [P0] · event · _inferred_
**Story:** As a buyer, every live deal has a routable slug so its page opens.

**Requirement:** WHEN scripts/ingest-awin.cjs upserts a deal THEN the system SHALL write a non-null slug using the canonical generation rule slugify(name)+'-'+sanitized(productId).

**Acceptance:**
- normalizeRow output object contains a non-empty slug key
- after a dry-run, 0 rows have slug=null
- the written slug equals deals.repo.ts toRow() generation for the same input
- discount_percent is derived via the shared computeDiscountPercent guard (or a documented equivalent), not an unguarded inline formula (closes GAP-4)

**Trace:** baseline B-SSR-1, B-ING-2 · original Task-1.1, FR-RTE-2 · findings GAP-1-slug-null-ingest, GAP-4-fring3-ingest-bypasses-guard · tasks T0.2, T0.5 · components C-ingest

### R-ING-5 · [P2] · event · _stated_
**Story:** As the analyst, daily price snapshots exist even when price is unchanged.

**Requirement:** WHEN a deal row is inserted or its sale_price updated THEN the system SHALL record a price_history row if the price changed (NULL-safe) OR no snapshot exists for that product on the current date.

**Acceptance:**
- record_price_history() includes a 'no row today' branch and uses IS DISTINCT FROM
- after two same-day same-price upserts exactly 1 snapshot exists; after a next-day upsert a 2nd snapshot exists

**Trace:** baseline B-ING-4 · original FR-ING-6, Task-1.1 · findings S1-trigger-fn · tasks T4.3 · components C-schema

### R-ING-6 · [REGRESSION] · state · _stated_
**Story:** As the UI, the 90-day low is cached on each deal.

**Requirement:** WHILE executing the scheduled refresh the system SHALL recompute deals.historical_low_price from price_history over a 90-day window.

**Acceptance:**
- refresh path awaits update_historical_lows_batch RPC
- after refresh, historical_low_price = MIN(sale_price) over recorded_at>=now()-90d

**Trace:** baseline B-ING-4 · original FR-ING-7, Task-3.3 · findings — · tasks T4.4 · components C-dealsrepo, C-refresh

### R-ING-7 · [REGRESSION] · unwanted · _stated_
**Story:** As a dev, the app runs with an empty .env on mock data.

**Requirement:** IF provider credentials and Supabase are absent THEN the system SHALL serve mock deals on every page without throwing.

**Acceptance:**
- next build with empty env exits 0
- each provider init() logs a mock warning and returns isMock:true
- no unhandled exception on home/category/search/deal navigation

**Trace:** baseline B-ING-5, B-OPS-2 · original NFR-TECH-7, Task-7.4 · findings — · tasks T5.7 · components C-build

### R-ING-8 · [P2] · state · _inferred_
**Story:** As ops, the refresh completes within its serverless budget under live latency.

**Requirement:** WHILE refreshing all country x category combinations the system SHALL bound wall-clock within maxDuration=300s using bounded concurrency.

**Acceptance:**
- refresh fans out with a concurrency limit (>1, configurable) rather than 160 strictly-serial awaits
- maxDuration=300 retained
- a smoke run over mock data completes < 60s

**Trace:** baseline B-ING-6, B-PERF-3 · original NFR-PERF-3 · findings S11-refresh-serial-fanout · tasks T4.4 · components C-refresh

## R-MON — Monetization & Tracking

### R-MON-1 · [REGRESSION] · ubiquitous · _stated_
**Story:** As finance, outbound links carry a unified subID per network.

**Requirement:** The system SHALL decorate outbound affiliate URLs with subID dealradar_{country}_{category}_{productId} mapped to kelkoo=custom1, awin=clickref, tradedoubler=epi.

**Acceptance:**
- decorateAffiliateUrl output URL contains the network-correct param with the subID
- the param value round-trips to the original productId via the postback parser (R-MON-3)

**Trace:** baseline B-MON-1 · original FR-TRK-1, Task-2.3 · findings — · tasks T3.4 · components C-affiliate

### R-MON-2 · [P1] · event · _stated_
**Story:** As finance, conversion postbacks are authenticated and persisted.

**Requirement:** WHEN /api/postbacks receives a POST THEN the system SHALL require secret==WEBHOOK_SECRET via a timing-safe comparison and persist a transactions row, returning 200/401/400.

**Acceptance:**
- comparison uses crypto.timingSafeEqual over length-guarded buffers
- WEBHOOK_SECRET unset -> 401 (no CRON_SECRET fallback that grants access)
- valid secret + body -> 200 and 1 transactions row

**Trace:** baseline B-MON-2, B-SEC-1, B-SEC-5 · original FR-TRK-2, Task-5.2, NFR-SEC-1 · findings S5.2-secret-auth · tasks T3.2 · components C-postbacks

### R-MON-3 · [P1] · unwanted · _stated_
**Story:** As finance, every network's postback attributes to the right product.

**Requirement:** IF a postback carries a subID for any supported network THEN the system SHALL extract productId network-aware and reject invalid status/commission.

**Acceptance:**
- parser reads the network-correct field (subid3/custom1/clickref/epi) case-insensitively
- status not in {pending,approved,declined,paid} -> 400; commission not finite or <0 -> 400
- reconstructed productId equals the original for ids containing ':' and '-'

**Trace:** baseline B-MON-3 · original FR-TRK-2 · findings S5.2-subid3-attribution, S5.2-input-validation · tasks T3.2, T3.4 · components C-postbacks, C-affiliate

### R-MON-4 · [P2] · ubiquitous · _stated_
**Story:** As finance, the transactions table has integrity constraints + audit fields.

**Requirement:** The system SHALL define transactions with a product_id FK (ON DELETE SET NULL), subid3, raw_payload jsonb, received_at, and CHECK constraints on commission_earned>=0 and status enum.

**Acceptance:**
- schema.sql transactions has the FK, subid3, raw_payload, received_at, and both CHECKs
- an INSERT with status='garbage' or commission=-1 is rejected by the DB

**Trace:** baseline B-MON-2, B-SEC-3 · original Task-1.1, M-2 · findings S1-transactions-table · tasks T4.3 · components C-schema

## R-RTE — Routing & SSR

### R-RTE-1 · [REGRESSION] · event · _stated_
**Story:** As a buyer, an invalid deal URL shows a 404.

**Requirement:** WHEN a deal page is requested with an unknown slug THEN the system SHALL call notFound() and render the standard 404.

**Acceptance:**
- getDealBySlug returns null for unknown slug
- /<locale>/deal/<bogus> returns HTTP 404

**Trace:** baseline B-SSR-2 · original FR-RTE-1, M-8 · findings — · tasks T0.5 · components C-dealsrepo, C-dealpage

### R-RTE-2 · [P0] · ubiquitous · _stated_
**Story:** As a buyer, the slug a link points to is the slug the page resolves.

**Requirement:** The system SHALL guarantee a non-null slug on every persisted deal and resolve it via getDealBySlug for all write paths (ingest + refresh upsert).

**Acceptance:**
- schema enforces slug NOT NULL (constraint or BEFORE-INSERT default)
- a backfill UPDATE sets slug for all pre-existing rows
- for a live-ingested deal, the DealCard href slug returns HTTP 200

**Trace:** baseline B-SSR-1 · original Task-3.2, Task-1.2 · findings GAP-1-slug-null-ingest · tasks T0.1, T0.5 · components C-schema, C-dealsrepo

### R-RTE-3 · [P2] · ubiquitous · _stated_
**Story:** As a maintainer, dead modal code is removed after SSR migration.

**Requirement:** The system SHALL route deal navigation through the SSR page and contain no import of the removed DealDetailModal.

**Acceptance:**
- grep for DealDetailModal returns 0 matches
- DealCard navigates via next/link to /<locale>/deal/<slug>

**Trace:** baseline B-SSR-3 · original Task-6.2, N-7 · findings — · tasks T2.4 · components C-dealcard

## R-GEO — SEO / AEO / Structured Data

### R-GEO-1 · [P1] · ubiquitous · _stated_
**Story:** As an answer engine, deal pages expose valid AggregateOffer markup.

**Requirement:** The system SHALL emit JSON-LD Product + AggregateOffer including priceCurrency, lowPrice, highPrice, offerCount, availability=InStock, and per-offer itemCondition=NewCondition.

**Acceptance:**
- JSON-LD contains @type AggregateOffer with lowPrice/highPrice/offerCount
- JSON-LD contains itemCondition https://schema.org/NewCondition
- Google Rich Results Test reports 0 errors for a sample deal page

**Trace:** baseline B-GEO-1 · original FR-GEO-1, Task-6.1, S-1 · findings S6-jsonld · tasks T2.1 · components C-dealpage

### R-GEO-2 · [P1] · ubiquitous · _stated_
**Story:** As an answer engine, deal pages carry extractable price-proof text.

**Requirement:** The system SHALL render visible (non-CSS-hidden) proof text on each deal page: a 90-day-low statement and a 'Verified at <time> CET' timestamp.

**Acceptance:**
- page HTML contains a localized 90-day-low line driven by historicalLowPrice
- page HTML contains a verification timestamp from lastUpdated
- neither element uses display:none / sr-only
- historical_low_price is read with a != null check (deals.repo fromRow) so a genuine 0 low is shown, not collapsed to null (closes the historicalLowPrice===0 finding)

**Trace:** baseline B-GEO-4 · original FR-GEO-2, Task-6.1, P-5 · findings S6-proof-fields, S13-deal-proof-fields, S-histlow-zero-guard · tasks T2.2 · components C-dealpage

### R-GEO-3 · [P1] · ubiquitous · _stated_
**Story:** As an AI crawler, robots.txt explicitly invites me.

**Requirement:** The system SHALL serve robots.txt with explicit Allow groups for OAI-SearchBot, PerplexityBot, Google-Extended, a global Disallow: /api/, and a Sitemap directive.

**Acceptance:**
- robots.txt contains the 3 named user-agent groups each with Allow: /
- contains Disallow: /api/ and Sitemap: <abs-url>

**Trace:** baseline B-GEO-3 · original FR-GEO-3 · findings S7-robots-ai-bots · tasks T2.6 · components C-robots

### R-GEO-4 · [P1] · ubiquitous · _stated_
**Story:** As search, the sitemap lists valid, resolvable, cross-linked URLs.

**Requirement:** The system SHALL generate sitemap.xml using the canonical LOCALES set, Supabase-sourced deal slugs across all supported countries, and per-URL hreflang alternates.

**Acceptance:**
- locale list is imported from i18n/routing (no 'se'; includes 'sv')
- deal entries use the persisted Supabase slug (resolve to 200, not 404)
- each logical page emits alternates.languages with an x-default

**Trace:** baseline B-GEO-2 · original FR-GEO-4, Task-6.3 · findings S7-sitemap-locale-se, S7-sitemap-slug, S7-sitemap-hreflang, S7-sitemap-source, S7-sitemap-de-only · tasks T2.5 · components C-sitemap

### R-GEO-5 · [P1] · ubiquitous · _inferred_
**Story:** As search, each deal page declares its canonical + locale alternates.

**Requirement:** The system SHALL set generateMetadata canonical plus alternates.languages for all 13 locales on the deal page.

**Acceptance:**
- metadata.alternates.languages has 13 entries + x-default
- canonical host matches the deployed host

**Trace:** baseline B-GEO-5 · original FR-RTE-2 · findings S6-meta-hreflang · tasks T2.3 · components C-dealpage

### R-GEO-6 · [P1] · ubiquitous · _stated_
**Story:** As SEO, monetized links don't leak link equity.

**Requirement:** The system SHALL set rel to include 'nofollow sponsored' on every outbound affiliate link, including the SSR deal page CTA.

**Acceptance:**
- deal/[slug]/page.tsx CTA rel contains 'nofollow sponsored'
- grep finds no outbound affiliate <a> lacking nofollow+sponsored

**Trace:** baseline B-GEO-6 · original FR-COMP-2 · findings EXTRA-dealpage-rel · tasks T2.3 · components C-dealpage

## R-I18N — Internationalization

### R-I18N-1 · [P1] · ubiquitous · _inferred_
**Story:** As an EU user, every UI string appears in my locale.

**Requirement:** The system SHALL provide message keys for every user-facing feature in all 13 locale files with no missing keys.

**Acceptance:**
- a key-parity check reports 0 keys present in en.json but missing in any of the other 12 locales
- 0 empty-string values for required keys

**Trace:** baseline B-I18N-1 · original NFR-TECH-3 · findings S13-footer-links, S13-affiliate-badge · tasks T1.1, T1.2, T5.4 · components C-messages

### R-I18N-2 · [P0] · ubiquitous · _stated_
**Story:** As an EU user, legal pages render in my language.

**Requirement:** The system SHALL render imprint/privacy/terms via getTranslations from legal.* namespaces, with no hardcoded English literals.

**Acceptance:**
- the 3 legal pages import and call next-intl translation APIs
- legal.imprint/privacy/terms namespaces exist in all 13 locale files
- grep finds 0 hardcoded English <h2>/<p> literals in the 3 page components

**Trace:** baseline B-I18N-3, B-LEGAL-1, B-LEGAL-2, B-LEGAL-3 · original FR-COMP-1, Task-6.4 · findings S13-legal-pages, S8-localized-content · tasks T1.1, T1.3 · components C-legal, C-messages

### R-I18N-3 · [P1] · ubiquitous · _stated_
**Story:** As an EU user, the deal page chrome is localized.

**Requirement:** The system SHALL localize all deal-page chrome and metadata via getTranslations('deal') with no hardcoded English strings.

**Acceptance:**
- deal page uses translated keys for back-link, price-history caption, CTA, disclosure
- grep finds 0 hardcoded English UI strings in deal/[slug]/page.tsx

**Trace:** baseline B-I18N-1 · original FR-COMP-1 · findings S13-deal-page-chrome · tasks T2.3 · components C-dealpage

### R-I18N-4 · [P1] · ubiquitous · _stated_
**Story:** As an EU user, footer links and cookie-settings are localized.

**Requirement:** The system SHALL render footer legal link labels and a Cookie Settings control from localized keys in all 13 locales.

**Acceptance:**
- footer.imprint/privacy/terms/cookieSettings keys exist in all 13 files
- Footer renders 4 links via t()

**Trace:** baseline B-I18N-1, B-LEGAL-4 · original FR-COMP-1, Task-6.7 · findings S13-footer-links, S8-footer-labels-localized · tasks T1.5 · components C-footer, C-messages

### R-I18N-5 · [P2] · ubiquitous · _inferred_
**Story:** As a subscriber, the unsubscribe pages render in my language.

**Requirement:** The system SHALL render unsubscribe confirmation/error pages from localized keys using a locale carried in the unsubscribe URL.

**Acceptance:**
- the alert email unsubscribe URL includes &locale=<xx>
- the route resolves strings via getTranslations for the parsed locale
- unsubscribe namespace exists in all 13 locale files

**Trace:** baseline B-I18N-1 · original Task-6.5 · findings S9-localized-confirmation, S13-unsubscribe-page · tasks T4.5 · components C-alertsrepo, C-unsub, C-messages

## R-LOC — Geolocation & Locale

### R-LOC-1 · [REGRESSION] · unwanted · _stated_
**Story:** As a visitor, my country is resolved at the edge with a safe default.

**Requirement:** IF a request lacks the dr_location cookie and its geo header country is unsupported THEN the system SHALL set dr_location to DE.

**Acceptance:**
- middleware reads X-NF-Country/x-vercel-ip-country and validates against supported set
- unsupported -> cookie dr_location=DE|
- resolve.ts client fallback chain remains

**Trace:** baseline B-GEOIP-1, B-GEOIP-2 · original FR-LOC-1, FR-LOC-2, Task-5.1 · findings — · tasks T5.7 · components C-middleware

### R-LOC-2 · [REGRESSION] · ubiquitous · _stated_
**Story:** As an EU user, pages are served under my locale prefix with auto-detection.

**Requirement:** The system SHALL route all pages under /<locale>/ for the 13 configured locales and auto-detect locale from Accept-Language for unprefixed requests.

**Acceptance:**
- routing.ts defines 13 locales with localePrefix 'always'
- an unprefixed request redirects to a detected locale prefix (HTTP 307/308)
- an unknown locale segment -> notFound()

**Trace:** baseline B-I18N-2 · original NFR-TECH-3 · findings — · tasks T5.7 · components C-middleware

## R-COMP — Legal & Compliance

### R-COMP-1 · [P0] · ubiquitous · _stated_
**Story:** As compliance, privacy policy covers all six required sections.

**Requirement:** The system SHALL present privacy content with 6 sections: controller, data categories, third-party processors, cookies, data-subject rights, automated unsubscribe.

**Acceptance:**
- privacy namespace defines all 6 section keys
- the rendered page shows 6 sections including a named processor list (hosting, Supabase, email, networks)

**Trace:** baseline B-LEGAL-2 · original FR-COMP-1, Task-6.4 · findings S8-privacy-sections · tasks T1.1, T1.3 · components C-legal, C-messages

### R-COMP-2 · [P1] · ubiquitous · _stated_
**Story:** As a user, I see an affiliate disclosure next to every outbound CTA.

**Requirement:** The system SHALL display a visible localized affiliate-disclosure badge adjacent to every outbound affiliate CTA on deal cards and the deal page.

**Acceptance:**
- a localized SponsoredBadge renders adjacent to the CTA on every DealCard and on the deal page
- badge text resolves from the 'deal' namespace (no hardcoded English)
- badge is not sr-only

**Trace:** baseline B-LEGAL-5 · original FR-COMP-2, Task-6.2 · findings S6-card-affiliate-badge, N-3-affiliate-badge, S13-affiliate-badge · tasks T2.4 · components C-dealpage, C-dealcard, C-badge

### R-COMP-3 · [P1] · ubiquitous · _stated_
**Story:** As a user, I get a compliant FOSS cookie banner.

**Requirement:** The system SHALL integrate vanilla-cookieconsent@3.x with categories necessary (read-only on) and analytics (default off) initialized client-side in the root layout.

**Acceptance:**
- package.json depends on vanilla-cookieconsent ^3
- src/components/consent/CookieConsent.tsx initializes categories {necessary:readOnly, analytics:off}
- next build exit 0 with the dependency

**Trace:** baseline B-LEGAL-4 · original FR-COMP-6, Task-6.8, N-4 · findings S10-foss-lib · tasks T1.4 · components C-consent

### R-COMP-4 · [P1] · event · _stated_
**Story:** As a user, I can re-open and change my consent any time.

**Requirement:** WHEN the user activates the footer Cookie Settings control THEN the system SHALL re-open the consent preferences UI.

**Acceptance:**
- footer Cookie Settings calls the consent showPreferences API
- changing analytics from on->off updates the stored preference

**Trace:** baseline B-LEGAL-4 · original FR-COMP-1, Task-6.7 · findings S8-cookie-settings-reopen, S10-reopen-footer · tasks T1.5 · components C-consent, C-footer

### R-COMP-5 · [P1] · unwanted · _stated_
**Story:** As a user, reject is as easy as accept and nothing tracks me first.

**Requirement:** IF the user has not granted analytics consent THEN the system SHALL set no non-essential cookies, and SHALL present Accept and Reject as equal-weight controls.

**Acceptance:**
- no analytics/non-essential cookie is set before an explicit Accept
- Accept and Reject buttons share identical visual weight (same variant/size)

**Trace:** baseline B-LEGAL-4 · original FR-COMP-6 · findings S10-equal-weight · tasks T1.4 · components C-consent

### R-COMP-6 · [P1] · ubiquitous · _stated_
**Story:** As a user, the footer links to all legal pages + cookie settings.

**Requirement:** The system SHALL render exactly four localized footer controls: Imprint, Privacy, Terms, Cookie Settings.

**Acceptance:**
- Footer renders 4 controls with locale-aware hrefs/handlers

**Trace:** baseline B-LEGAL-1, B-LEGAL-4 · original FR-COMP-1, Task-6.7 · findings S8-footer-cookie-settings-missing · tasks T1.5 · components C-footer

## R-MAIL — Email & Alerts

### R-MAIL-1 · [P0] · event · _stated_
**Story:** As a subscriber, I get an email when a watched deal drops, on the live path.

**Requirement:** WHEN the live ingestion writes a deal whose sale_price is below a subscriber's target_price THEN the system SHALL dispatch a price-drop email and set notified=true.

**Acceptance:**
- the AWIN/live ingest pipeline invokes the notify pass over the upserted product_ids
- a simulated drop dispatches 1 email and flips notified
- notifyPriceDrops has >=1 caller reachable from the live ingest path

**Trace:** baseline B-MAIL-1 · original FR-ING-8 · findings GAP-2-alerts-bypass-feed · tasks T0.3, T0.5 · components C-ingest, C-alertsrepo

### R-MAIL-2 · [REGRESSION] · event · _stated_
**Story:** As a subscriber, every email has a working unsubscribe link + header.

**Requirement:** WHEN a price-drop email is sent THEN the system SHALL include a visible HMAC unsubscribe link and List-Unsubscribe + List-Unsubscribe-Post headers.

**Acceptance:**
- email HTML contains an <a> to /api/alerts/unsubscribe with email/productId/token
- send request includes List-Unsubscribe and List-Unsubscribe-Post headers

**Trace:** baseline B-MAIL-2 · original FR-COMP-3, N-1, Task-6.6 · findings — · tasks T0.3 · components C-alertsrepo

### R-MAIL-3 · [P0] · event · _stated_
**Story:** As a mail client, one-click unsubscribe POST works.

**Requirement:** WHEN a one-click unsubscribe POST hits /api/alerts/unsubscribe THEN the system SHALL verify the token, delete the subscription, and return 200 with no redirect.

**Acceptance:**
- route exports POST
- POST with a valid token -> 200 and row deleted
- POST shares the verify+delete logic with GET

**Trace:** baseline B-MAIL-3 · original FR-COMP-3 · findings S9-oneclick-post, N-1-unsubscribe · tasks T0.4, T0.5 · components C-unsub

### R-MAIL-4 · [REGRESSION] · event · _stated_
**Story:** As a subscriber, unsubscribe is HMAC-verified and idempotent.

**Requirement:** WHEN /api/alerts/unsubscribe receives a valid HMAC token THEN the system SHALL delete the matching price_alerts row and render success even if already deleted.

**Acceptance:**
- invalid token -> error page, 0 deletions
- valid token -> deletion + success
- second valid GET -> success, no error

**Trace:** baseline B-MAIL-4 · original FR-COMP-4, Task-6.5 · findings — · tasks T0.4 · components C-unsub

### R-MAIL-5 · [P2] · event · _inferred_
**Story:** As compliance, stale subscriptions are auto-deleted.

**Requirement:** WHEN the scheduled retention job runs THEN the system SHALL delete price_alerts older than the configured retention window and notified rows past a configured age.

**Acceptance:**
- a scheduled job (pg_cron or CI) issues the retention DELETE
- retention window is a named constant/config value
- privacy policy states the retention period

**Trace:** baseline B-MAIL-5, B-SEC-6 · original NFR-PRIV-1 · findings GAP-3-priv1-no-auto-deletion · tasks T4.5 · components C-retention

### R-MAIL-6 · [P2] · ubiquitous · _inferred_
**Story:** As finance, email clicks are attributed.

**Requirement:** The system SHALL use the decorated affiliate URL (not the raw shopUrl) for the price-drop email CTA.

**Acceptance:**
- priceDropEmail CTA href = decorateAffiliateUrl(...)
- the email link contains the network subID param

**Trace:** baseline B-MON-1 · original FR-TRK-1 · findings S5-email-cta-raw-url · tasks T4.5 · components C-alertsrepo

### R-MAIL-7 · [P1] · unwanted · _stated_
**Story:** As the platform, signup is rate-limited per real client.

**Requirement:** IF more than 5 alert signups in 1 hour originate from one trusted client IP THEN the system SHALL return HTTP 429.

**Acceptance:**
- limiter keys on a trusted edge IP (not raw leftmost XFF)
- counter uses atomic INCR + EXPIRE (window does not reset each write)
- 6th request within the hour -> 429; without Redis a warning is logged and requests pass

**Trace:** baseline B-MAIL-6, B-SEC-4 · original FR-COMP-5, Task-5.3 · findings S5.3-ip-spoof, S5.3-nonatomic-incr · tasks T3.3 · components C-alertsapi, C-redis

## R-SEC — Security & Privacy

### R-SEC-1 · [P1] · unwanted · _stated_
**Story:** As security, signing keys are never a known default.

**Requirement:** IF CRON_SECRET is absent at request time in production THEN the system SHALL refuse to sign or verify tokens rather than fall back to a hardcoded secret.

**Acceptance:**
- no hardcoded production secret fallback literal remains (grep)
- in production with CRON_SECRET unset a sign/verify call fails at request time (throws or returns invalid)
- next build on an empty .env still exits 0 — no throw at module-load/build phase (reconciles with R-ING-7 / SC1)

**Trace:** baseline B-SEC-2 · original NFR-SEC-1 · findings T2.2-default-secret · tasks T3.1 · components C-crypto

### R-SEC-2 · [REGRESSION] · event · _stated_
**Story:** As security, the refresh endpoint requires the cron bearer.

**Requirement:** WHEN /api/refresh is called without Authorization: Bearer CRON_SECRET THEN the system SHALL return 401.

**Acceptance:**
- missing/expired bearer -> 401
- secret unset -> 401 (fail-closed)

**Trace:** baseline B-SEC-1 · original NFR-SEC-1 · findings GAP-6-nfr-sec-123 · tasks T4.4 · components C-refresh

### R-SEC-3 · [REGRESSION] · ubiquitous · _stated_
**Story:** As security, the DB is locked down to the service role.

**Requirement:** The system SHALL enable RLS on all four tables and use the service-role key only in server-only modules.

**Acceptance:**
- RLS enabled on deals/price_alerts/price_history/transactions
- supabase client module imports 'server-only'; key never NEXT_PUBLIC

**Trace:** baseline B-SEC-3 · original NFR-SEC-2 · findings GAP-6-nfr-sec-123 · tasks T0.1 · components C-schema

### R-SEC-4 · [P1] · unwanted · _stated_
**Story:** As security, user input cannot alter DB filters.

**Requirement:** IF a user-controlled value (e.g. city from cookie) is used in a PostgREST filter THEN the system SHALL sanitize/encode it so it cannot change the filter structure.

**Acceptance:**
- city is sanitized to a safe charset (matching the search-token rule) before .or() interpolation, or passed via a parameterized filter
- a crafted city value cannot inject an extra filter clause (unit/integration test)

**Trace:** baseline B-SEC-4 · original NFR-SEC-2 · findings S-CITY-INJECTION · tasks T3.5 · components C-dealsrepo

### R-SEC-5 · [P1] · ubiquitous · _stated_
**Story:** As security, secret/token comparisons are timing-safe.

**Requirement:** The system SHALL compare all shared secrets and tokens using a constant-time comparison.

**Acceptance:**
- unsubscribe token verify uses timingSafeEqual (already)
- postback and refresh secret checks use timingSafeEqual over length-guarded buffers

**Trace:** baseline B-SEC-5 · original NFR-SEC-1 · findings S5.2-secret-auth · tasks T3.1 · components C-crypto

### R-SEC-6 · [REGRESSION] · ubiquitous · _stated_
**Story:** As compliance, we store no avoidable PII and no geo coordinates.

**Requirement:** The system SHALL store no PII in transactions and SHALL not persist geo coordinates.

**Acceptance:**
- transactions columns contain no email/name/IP
- no code writes lat/long to any table

**Trace:** baseline B-SEC-6 · original NFR-PRIV-1, NFR-SEC-3 · findings GAP-6-nfr-sec-123 · tasks T4.3 · components C-schema, C-postbacks

## R-PERF — Performance

### R-PERF-1 · [REGRESSION] · ubiquitous · _stated_
**Story:** As a visitor, hot deal queries are cached.

**Requirement:** The system SHALL cache /api/deals responses in Redis with a 1800s (30-min) TTL and serve a cache hit when present.

**Acceptance:**
- cacheKey/cacheGet/cacheSet used in /api/deals
- CACHE_TTL_SECONDS resolves to 1800 (e.g. 30 * 60)
- a second identical request returns cached:true when Redis configured

**Trace:** baseline B-PERF-1 · original NFR-PERF-1 · findings — · tasks T3.3 · components C-redis

### R-PERF-2 · [REGRESSION] · ubiquitous · _stated_
**Story:** As a visitor, list queries hit indexes.

**Requirement:** The system SHALL index the hot query paths (country+discount, country+category, slug, ean_code, price_history(product_id,recorded_at), transactions(product_id)).

**Acceptance:**
- schema defines all listed indexes
- no hot read uses a full-table scan (EXPLAIN spot-check)

**Trace:** baseline B-PERF-2 · original NFR-PERF-2 · findings — · tasks T0.1 · components C-schema

## R-OPS — Operations & Observability

### R-OPS-1 · [P2] · event · _inferred_
**Story:** As ops, the schema is reproducibly applied to any environment.

**Requirement:** WHEN the migration runner/CI step executes THEN the system SHALL apply the schema (tables, indexes, trigger, RPC) idempotently.

**Acceptance:**
- a package script or CI job applies supabase/schema.sql (or versioned migrations)
- re-running is idempotent (IF NOT EXISTS / OR REPLACE)
- post-apply checks confirm the trigger and the 90-day RPC exist

**Trace:** baseline B-OPS-1, B-OPS-3 · original Task-1.2, V-2 · findings GAP-7-task1.2-migration-execution · tasks T5.1 · components C-migrate

### R-OPS-2 · [P2] · event · _inferred_
**Story:** As ops, degradation is visible in logs.

**Requirement:** WHEN a provider, Supabase, Redis, or email integration is unconfigured THEN the system SHALL log a structured warning naming the missing capability.

**Acceptance:**
- providers, Supabase, and email log a named warning when their env is absent (regression-verified in build log)
- the rate limiter additionally logs a named warning when Redis is unconfigured (new — currently silent)

**Trace:** baseline B-OPS-2 · original NFR-TECH-7 · findings S5.3-nonatomic-incr · tasks T3.3 · components C-redis

## R-TEST — Testing & Release

### R-TEST-1 · [P2] · ubiquitous · _stated_
**Story:** As a maintainer, core pure logic is unit-tested.

**Requirement:** The system SHALL provide passing unit tests for slugify, HMAC token gen/verify, affiliate decoration, and hybrid dedup.

**Acceptance:**
- a test runner (vitest) is configured with a package script
- tests cover the 3 dedup cases + slug edge cases + token round-trip + subID round-trip
- the suite exits 0

**Trace:** baseline B-TEST-1 · original Task-3.4 · findings R-need-tests · tasks T5.3 · components C-tests

### R-TEST-2 · [REGRESSION] · ubiquitous · _stated_
**Story:** As a maintainer, the build is type-clean and warning-free.

**Requirement:** The system SHALL build with tsc --noEmit and next build both exiting 0 with no new warnings.

**Acceptance:**
- tsc --noEmit exit 0
- next build exit 0
- no new build warnings vs baseline

**Trace:** baseline B-TEST-2 · original Task-7.3, NFR-TECH · findings — · tasks T5.7 · components C-build

### R-TEST-3 · [P2] · ubiquitous · _inferred_
**Story:** As a maintainer, lint is configured and enforced.

**Requirement:** The system SHALL provide a committed ESLint config (next/core-web-vitals) so next lint runs non-interactively and exits 0.

**Acceptance:**
- .eslintrc present and committed
- next lint runs without the interactive setup prompt and exits 0

**Trace:** baseline B-TEST-3 · original NFR-TECH-1 · findings R-lint-unconfigured · tasks T5.2 · components C-lint

## R-UX — UX & Accessibility

### R-UX-1 · [P2] · state · _inferred_
**Story:** As a visitor, data views show empty/loading/error states.

**Requirement:** WHILE a data view has no results, is loading, or has errored the system SHALL render an explicit empty, loading, or error state.

**Acceptance:**
- search/category render a non-blank empty state for 0 results
- an API error path renders a user-visible error (not a blank page)

**Trace:** baseline B-UX-1 · original — · findings R-ux-states · tasks T5.5 · components C-uxstates

### R-UX-2 · [P2] · ubiquitous · _inferred_
**Story:** As an assistive-tech user, the UI meets WCAG 2.1 AA basics.

**Requirement:** The system SHALL meet WCAG 2.1 AA basics: labeled controls, alt text, focus-visible, and AA contrast on primary text/CTAs.

**Acceptance:**
- interactive controls have accessible names (axe scan: 0 critical violations on home + deal page)
- images have alt; CTA contrast ratio >= 4.5:1

**Trace:** baseline B-UX-2 · original — · findings R-a11y · tasks T5.6 · components C-a11y

---

## Coverage matrix (baseline → requirements) — 51/51 MAPPED

| Baseline | Block | Authority | Requirement(s) | Status |
|---|---|---|---|---|
| B-ING-1 | Ingestion | first-principles | R-ING-1 | MAPPED |
| B-ING-2 | Ingestion | first-principles | R-ING-1, R-ING-2, R-ING-4 | MAPPED |
| B-ING-3 | Ingestion | domain (price-comparison) | R-ING-2, R-ING-3 | MAPPED |
| B-ING-4 | Ingestion | domain | R-ING-5, R-ING-6 | MAPPED |
| B-ING-5 | Ingestion | first-principles (resilience) | R-ING-7 | MAPPED |
| B-ING-6 | Ingestion | first-principles | R-ING-8 | MAPPED |
| B-MON-1 | Monetization | domain | R-MON-1, R-MAIL-6 | MAPPED |
| B-MON-2 | Monetization | domain | R-MON-2, R-MON-4 | MAPPED |
| B-MON-3 | Monetization | domain | R-MON-3 | MAPPED |
| B-SSR-1 | Pages | first-principles | R-ING-4, R-RTE-2 | MAPPED |
| B-SSR-2 | Pages | first-principles | R-RTE-1 | MAPPED |
| B-SSR-3 | Pages | first-principles | R-RTE-3 | MAPPED |
| B-GEO-1 | SEO/AEO | standard (schema.org / Google Rich Results) | R-GEO-1 | MAPPED |
| B-GEO-2 | SEO/AEO | standard (sitemaps.org / Google hreflang) | R-GEO-4 | MAPPED |
| B-GEO-3 | SEO/AEO | standard | R-GEO-3 | MAPPED |
| B-GEO-4 | SEO/AEO | emerging (AEO; medium authority) | R-GEO-2 | MAPPED |
| B-GEO-5 | SEO/AEO | standard | R-GEO-5 | MAPPED |
| B-GEO-6 | SEO/AEO | standard (Google) | R-GEO-6 | MAPPED |
| B-I18N-1 | i18n | first-principles | R-I18N-1, R-I18N-3, R-I18N-4, R-I18N-5 | MAPPED |
| B-I18N-2 | i18n | first-principles | R-LOC-2 | MAPPED |
| B-I18N-3 | i18n | regulatory (GDPR Art. 12) | R-I18N-2 | MAPPED |
| B-GEOIP-1 | Geolocation | first-principles | R-LOC-1 | MAPPED |
| B-GEOIP-2 | Geolocation | first-principles | R-LOC-1 | MAPPED |
| B-LEGAL-1 | Legal | regulatory (DE TMG §5 / EU) | R-I18N-2, R-COMP-6 | MAPPED |
| B-LEGAL-2 | Legal | regulatory | R-I18N-2, R-COMP-1 | MAPPED |
| B-LEGAL-3 | Legal | commercial | R-I18N-2 | MAPPED |
| B-LEGAL-4 | Legal | regulatory (GDPR/ePrivacy/TTDSG/EDPB dark-patterns) | R-I18N-4, R-COMP-3, R-COMP-4, R-COMP-5, R-COMP-6 | MAPPED |
| B-LEGAL-5 | Legal | regulatory (UWG / EU 2005/29/EC) | R-COMP-2 | MAPPED |
| B-MAIL-1 | Email | domain | R-MAIL-1 | MAPPED |
| B-MAIL-2 | Email | standard (RFC 8058) | R-MAIL-2 | MAPPED |
| B-MAIL-3 | Email | standard (RFC 8058 / Gmail-Yahoo bulk-sender) | R-MAIL-3 | MAPPED |
| B-MAIL-4 | Email | regulatory (GDPR Art. 17) | R-MAIL-4 | MAPPED |
| B-MAIL-5 | Email | regulatory (GDPR Art. 5(1)(e)) | R-MAIL-5 | MAPPED |
| B-MAIL-6 | Email | security/first-principles | R-MAIL-7 | MAPPED |
| B-SEC-1 | Security | first-principles | R-MON-2, R-SEC-2 | MAPPED |
| B-SEC-2 | Security | standard (OWASP ASVS) | R-SEC-1 | MAPPED |
| B-SEC-3 | Security | first-principles | R-MON-4, R-SEC-3 | MAPPED |
| B-SEC-4 | Security | standard (OWASP) | R-MAIL-7, R-SEC-4 | MAPPED |
| B-SEC-5 | Security | standard | R-MON-2, R-SEC-5 | MAPPED |
| B-SEC-6 | Security | regulatory | R-MAIL-5, R-SEC-6 | MAPPED |
| B-PERF-1 | Performance | first-principles | R-PERF-1 | MAPPED |
| B-PERF-2 | Performance | first-principles | R-PERF-2 | MAPPED |
| B-PERF-3 | Performance | first-principles | R-ING-8 | MAPPED |
| B-OPS-1 | Ops | first-principles | R-OPS-1 | MAPPED |
| B-OPS-2 | Ops | first-principles | R-ING-7, R-OPS-2 | MAPPED |
| B-OPS-3 | Ops | first-principles | R-OPS-1 | MAPPED |
| B-TEST-1 | Testing | first-principles | R-TEST-1 | MAPPED |
| B-TEST-2 | Testing | first-principles | R-TEST-2 | MAPPED |
| B-TEST-3 | Testing | first-principles | R-TEST-3 | MAPPED |
| B-UX-1 | UX | first-principles | R-UX-1 | MAPPED |
| B-UX-2 | UX | standard (WCAG 2.1) | R-UX-2 | MAPPED |
