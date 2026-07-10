# Requirements — Version 3.1 (Platform Scope) — DRAFT
## Project: DealRadar — Autonomous, Geo-Located, Multilingual Affiliate Deals Platform for Europe

* **Status:** DRAFT — canonical once the prd.md human confirmations are signed off.
* **Version:** **v3.1 — post-merge reconciliation of the `91140c9..155cf06` code delta + the 2026-07-09 data-loss event; supersedes `2026-07-08_v3`; authored 2026-07-09.** _Grounding SHAs: code delta grounded on `155cf06` (the code tree); current branch HEAD is `b53bb3e` (docs-only restore commit)._ Also supersedes `2026-06-23_v2/requirements.md` and folds in the `2026-06-28` remediation `R-*` requirements (crosswalk in [prd.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/prd.md) §9). New in v3.1: **FR-ING-12/13, FR-PDP-7, FR-SEO-15** (capabilities the `155cf06` merge landed that v3 never saw); **FR-ING-7 rewritten** to the day-keyed `price_history` model. All statuses below are **merged-on-branch** unless marked verified-live; prod DB shape and deployed SHA are UNKNOWN (probe first).
* **Date:** 2026-07-09
* **Sibling docs:** [prd.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/prd.md) (`OBJ-*`/Assumptions/Risks), [design.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/design.md) (`DSN-*`), [tasks.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/tasks.md) (`T-*`).

---

## 0. How to read this document

* **ID scheme:** `FR-<AREA>-<n>` with `AREA ∈ {ING, MON, PDP, SEO, INF, OPS, CMP}`; `NFR-<CAT>-<n>` with `CAT ∈ {PERF, REL, SEC, PRIV, SEO, COST, OBS, SCALE, AUTON}`.
* **EARS notation:** WHEN/WHILE/IF `<trigger>` THE SYSTEM SHALL `<response>`.
* **Traceability:** every requirement cites the `OBJ-*` it serves (upward) and is satisfied by ≥ 1 `DSN-*` (downward, in design.md) and implemented by ≥ 1 `T-*` (in tasks.md). No requirement is an orphan.
* **Reserved-number note:** IDs are **area-scoped and stable**; a few numbers are reserved/folded from v2 and are marked "_(reserved)_" so numbering gaps are deliberate, not accidental. Every **defined** requirement below has ≥ 1 task.
* **Measurability:** every Acceptance is an objective predicate — grep / HTTP status / SQL row-count / unit test / named external tool.

---

## 1. Functional Requirements

### 1.1 Ingestion (FR-ING-*) — serves OBJ-2 (→ OBJ-1)

| ID | Requirement (EARS) | Acceptance (measurable) | OBJ |
|---|---|---|---|
| **FR-ING-1** | WHEN `/api/refresh` runs THE SYSTEM SHALL route `DealQuery` across priority-ordered providers, fall through on `ProviderError`, and merge results. | `initProviders()` health map `ok:true` per provider; refresh `upserted` map non-zero per live country; fall-through logged and < error budget. | OBJ-2 |
| **FR-ING-2** | WHEN a provider (per-query or the AWIN bulk CSV) returns records THE SYSTEM SHALL normalize to one `NormalizedDeal` shape with a clamped `discount_percent`. | 0 rows where `discount_percent NOT BETWEEN 0 AND 100`; `scanned` vs `kept` tracked in the ingest summary. | OBJ-2 |
| **FR-ING-3** | WHEN duplicate deals are present THE SYSTEM SHALL dedup by EAN else `slug(name)+slug(shop)`, keeping the survivor, tie-broken deterministically. | `registry.test.ts` green (EAN survivor / name+merchant fallback / price-tie → priority / survivor `product_id`); per-cycle collapse ratio logged. | OBJ-2 |
| **FR-ING-4** | WHEN AWIN-written rows and per-query rows share an EAN THE SYSTEM SHALL collapse them to one survivor across networks. | integration fixture (AWIN + Kelkoo, same EAN) → one survivor; EAN-key collapse count > 0 once live. | OBJ-2 |
| **FR-ING-5** | IF a provider reports `isMock:true` THE SYSTEM SHALL NOT upsert its synthetic rows to prod. | empty-cred refresh writes 0 rows; `SELECT count(*) FROM deals WHERE source IN (<mock>)` = 0 in prod. | OBJ-2 |
| **FR-ING-6** | WHEN ingestion upserts a deal THE SYSTEM SHALL guarantee a non-null `slug` on every row. | 0 rows with `slug IS NULL` post-refresh. | OBJ-2 |
| **FR-ING-7** | _(rewritten v3.1)_ `price_history` is **day-keyed** (PK `(product_id, day)`, `currency NOT NULL`, no FK); writers are (a) the **single** day-based trigger `record_price_history` (`schema.sql:146-164`) and (b) the daily post-verify snapshot (`scripts/snapshot-prices.cjs`, one row/visible deal/UTC day, direct REST — bypasses the trigger). WHEN a deal's `sale_price` changes THE SYSTEM SHALL land exactly one `(product_id, current_date)` row with `currency` and recompute the 90-day `historical_low_price`. | `schema.sql` defines `record_price_history` **exactly once** (grep count = 1); a `sale_price`-changing upsert **succeeds** and lands one `(product_id, current_date)` row with `currency`; `select prosrc from pg_proc` confirms the day-based body in prod; `update_historical_lows_batch(90)` populates active products. **⛔ P0 2026-07-09 (T-DB-0):** the on-disk schema defines the function TWICE — def#2 (`schema.sql:250-265`, wins via create-or-replace) omits `day` (PK member, NOT NULL) and `currency` (NOT NULL) → 23502 aborts every price-changing upsert once applied. Surgical fix: delete `schema.sql:249-270` (or fold the `IS DISTINCT FROM` guard into def#1). Prod DB shape UNKNOWN — probe first. | OBJ-2 |
| _FR-ING-8_ | _(reserved — folded into FR-ING-2 normalization; no separate task.)_ | n/a | — |
| **FR-ING-9** | WHEN two sources carry the same product THE SYSTEM SHALL persist the survivor with the highest **expected commission** (`rate × price`), degrading to price-only with a signal if the rate feed (A-17) is null. | unit fixture: differing commission → higher-expected-commission source persisted; null rate feed → price-only + signal. | OBJ-2 |
| **FR-ING-10** | WHEN a newly-credentialed provider first activates THE SYSTEM SHALL verify its payload field-map yields real deals before trusting it at scale. | first live fetch yields > 0 normalized deals with `name+price+link`; `provider_first_yield > 0`; 0-yield → alert. | OBJ-2 |
| **FR-ING-11** | WHILE the refresh fan-out (country × category) runs THE SYSTEM SHALL stay within the verified serverless ceiling via bounded chunking or GH-Action offload. | timed full-matrix refresh completes with no 5xx/timeout under the verified ceiling. | OBJ-2 |
| **FR-ING-12** | _(new v3.1)_ WHEN the daily verify runs THE SYSTEM SHALL check each AWIN deal against the live shop **in the deal's market currency**, hide gone/sold-out/undiscounted deals, unhide restocked ones, and correct drifted prices — flushing writes incrementally and failing the job when errors/done > 80%. | verifier run corrects drifted prices + sets/clears `hidden` per live state; job exits **non-zero** when errors/done > 80% (today it exits 0 at 100% errors, `verify-awin.cjs:251,:291`); a > 30-min crawl no longer loses ALL deferred writes (incremental flush ~every 50 decisions; today writes land only after the full crawl, `verify-awin.cjs:288-289` / `verify-awin.yml:31`). _Status 2026-07-09: pipeline EXISTS merged-on-branch (`scripts/verify-awin.cjs` ~307 lines + `verify-awin.yml`, daily 05:00 UTC) with the listed defects open → T-ING-10._ | OBJ-2 |
| **FR-ING-13** | _(new v3.1)_ Every public read surface SHALL honor `hidden`: list/search/brands (done), sitemap slugs (exclude), SSR PDP (render an honest expired/`OutOfStock` state per the FR-SEO-1 design note — never `InStock`), alert reconciliation (exclude); `homepage_hidden` SHALL be re-synced by an automated post-ingest step. | `getDealBySlug` render path, `getAllDealSlugs`, and `getRecentlyUpdatedDeals` all honor `hidden` (today all three are blind: `deals.repo.ts:283-291,:318-333,:298-311`); no `hidden=true` deal emits `InStock` JSON-LD or appears in `/sitemap.xml`; `scripts/flag-homepage-hidden.cjs` has a scheduled caller (today: none on HEAD — grep workflows = 0; main ran it post-ingest). → T-ING-11. | OBJ-2, OBJ-5 |

### 1.2 Monetization & Attribution (FR-MON-*) — serves OBJ-3 (→ OBJ-1)

| ID | Requirement (EARS) | Acceptance (measurable) | OBJ |
|---|---|---|---|
| **FR-MON-1** | WHEN an outbound CTA renders THE SYSTEM SHALL decorate the affiliate URL with a lossless, network-correct subID — at **every** call site. | sampled `href` carries the right per-network param (Kelkoo `custom1`/AWIN `clickref`/Tradedoubler `epi`) + encoded `productId`; `decodeSubId(buildSubId(x))===x`; every `decorateAffiliateUrl` call site passes `(shopUrl, source, country, category, productId)` in the right order — enumerated in the test (or the args refactored into one options object). _Defect 2026-07-09: the dead `DealDetailModal` passes `productId` in the COUNTRY slot (`DealDetailModal.tsx:35`) → subid `dealradar_<productId>_gen_`, `decodeSubId → productId:null` — total attribution loss if ever wired (T-MON-1/T-PDP-6)._ | OBJ-3 |
| **FR-MON-2** | WHEN a postback arrives THE SYSTEM SHALL authenticate (timing-safe secret + HMAC body signature + replay guard), validate, recover `product_id`, and upsert idempotently on `transaction_id`. | valid → `{persisted:true}`+row; wrong secret → 401; tampered/replayed → rejected; negative commission → 400; unknown status → `pending`; repeat `transaction_id` idempotent. | OBJ-3 |
| **FR-MON-3** | WHILE storing a postback THE SYSTEM SHALL enforce ledger integrity (FK ON DELETE SET NULL, `commission ≥ 0` CHECK, status-enum CHECK). | `pg_constraint` holds `transactions_product_id_fkey` + `_commission_chk` + `_status_chk`; 0 status-enum violations. | OBJ-3 |
| **FR-MON-4** | THE SYSTEM SHALL NOT retain attribution plumbing written on one side and read-null on the other (`deals.affiliate_subid`, unpaired `subid3`). | `affiliate_subid` dropped (0 readers); `subid3` set outbound **iff** read inbound; `pnpm build` clean. | OBJ-3 |
| **FR-MON-5** | WHEN reconciliation runs THE SYSTEM SHALL compare the ledger vs network totals, flag aging/disputes, and enforce a monotonic `pending→approved→paid` lifecycle. | reconcile drill flags ≥ 1 aging/dispute case; status transitions monotonic; `reconciliation` rows written. | OBJ-3 |
| **FR-MON-6** | THE SYSTEM SHALL expose a read-only `payout_ready` view and SHALL NOT ship any disbursement/banking code (G3, A-15). | `payout_ready = SUM(commission) WHERE status='approved'` by network; grep confirms 0 disbursement paths. | OBJ-1 |

### 1.3 PDP & Content Quality (FR-PDP-*) — serves OBJ-4 (→ OBJ-5)

| ID | Requirement (EARS) | Acceptance (measurable) | OBJ |
|---|---|---|---|
| **FR-PDP-1** | WHEN `/[locale]/deal/[slug]` is requested THE SYSTEM SHALL SSR-render real deal data (200) and `notFound()` (404) unknown slugs, within the A-12 CWV budget. | ≥ 95% of sampled PDPs → 200 with H1 + price; bogus slug → 404; LCP < 2.5 s, CLS ≈ 0; the PDP **declares its rendering strategy** (`dynamic`/`revalidate` — today neither is exported); `DealCard` emits **no href that 404s** (drop or resolve the `deal.slug \|\| slugify(productName)` fallback, `DealCard.tsx:27`). _v3.1 note: `DealDetailModal` (dead code, zero importers) must never REPLACE PDP navigation — any revival renders it in addition to the link; the SEO surface stays the SSR page._ | OBJ-4 |
| **FR-PDP-2** | THE SYSTEM SHALL keep human-authored editorial copy in a `deal_curation` overlay that survives ingestion upserts and renders only when `legal_ok=true`. | rename+refresh → overlay unchanged; `deal_curation` untouched by `onConflict product_id`; `legal_ok=false` → not rendered. | OBJ-4 |
| **FR-PDP-3** | THE SYSTEM SHALL render the leaf category tree as real crawlable routes (not `/search?…` query links). | each ~300 leaf term → 200 filtered `DealGrid`; crawlable non-deal category URLs = taxonomy size (≫ ~10 today). | OBJ-4 |
| **FR-PDP-4** | THE SYSTEM SHALL author non-thin PDP blocks (specs / multi-merchant comparison / FAQ) off the request path behind a human `legal_ok` gate. | curated PDPs carry `specs` + ≥ 1 `comparison` + `faq` in-source (not `display:none`); GSC does not flag thin content. | OBJ-4 |
| **FR-PDP-5** | THE SYSTEM SHALL surface the price-history / 90-day-low datum on the PDP as a proof field. | proof line renders where `historical_low_price` non-null; couples to FR-ING-7 fill-rate (A-11 ≥ 60%). | OBJ-4 |
| **FR-PDP-6** | THE SYSTEM SHALL remove dead synthetic detail modules so dead code cannot masquerade as content capability. | _(narrowed v3.1 — still OPEN)_ `productSpecs`/`otherStoreOffers`/fake model codes removed (**DONE merged-on-branch**, `product-details.ts` −122 lines); `productSizes` deleted or returns null until real stock data exists (today it still fabricates seeded-PRNG availability with a "never fully sold out" floor, `product-details.ts:44-62`); the remaining importer chain is either live UI or deleted — no dead-code-importing-dead-code (`DealDetailModal` → `productSizes`); `productGallery` is now REAL data (feed gallery) and survives, relocated to the PDP (T-PDP-6); build+lint clean. | OBJ-4 |
| **FR-PDP-7** | _(new v3.1)_ THE PDP SHALL render the real `gallery`, the feed `description` (also into JSON-LD `description`), and the 90-day price cardiogram from `price_history`; the `DealDetailModal` SHALL be either wired in (with corrected `decorateAffiliateUrl` args, a `SponsoredBadge`, and a real `priceNote` key) or deleted. | view-source: gallery + description + cardiogram render on the SSR PDP from the DB columns (`gallery text[]`/`description`/`merchant_url` exist at `schema.sql:6-36` but are rendered by **no reachable surface** today — the 211-line modal has zero importers; the SSR PDP renders `imageUrl` only); JSON-LD `description` uses `deal.description` when present; grep: the modal is imported by live UI or the file is gone. → T-PDP-6. | OBJ-4, OBJ-5 |

### 1.4 Organic Growth SEO/AEO/GEO (FR-SEO-*) — serves OBJ-5 (→ OBJ-1)

| ID | Requirement (EARS) | Acceptance (measurable) | OBJ |
|---|---|---|---|
| **FR-SEO-1** | THE SYSTEM SHALL route deals on `public_id`-stable URLs with a one-hop 308 on rename and a 200 `OutOfStock` expired-state page. | URL matches `^/{locale}/deal/[a-z0-9-]+-d[0-9a-f]{12}$`; rename keeps 200 + old 308s once; expired → 200 + `OutOfStock` JSON-LD. _v3.1 design note (with DSN-SEO-1): reconcile with the merged `hidden` lifecycle — `hidden` (sold-out/gone per the verifier) → **200 + `OutOfStock` + disabled CTA + excluded from sitemap NOW** (cheap, pre-url-slug; never `InStock`, never silent 200); `expired_at` (url-slug D6) remains the terminal state; **hidden ≠ expired**. Today verifier-hidden deals serve 200 + hardcoded `InStock` — the opposite (FR-ING-13)._ | OBJ-5 |
| **FR-SEO-2** | THE SYSTEM SHALL emit `Product`+`AggregateOffer` JSON-LD (lowPrice/highPrice/offerCount/itemCondition/availability; conditional gtin/brand). | Google Rich Results Test = 0 errors on live PDPs across 3 locales; `availability` **derives from deal state** (`hidden`/expired → `OutOfStock`), never a constant (today hardcoded `InStock` at both offer levels, `deal/[slug]/page.tsx:73,79`); JSON-LD `description` uses `deal.description` when present (today name+shop despite the column existing). _Status 2026-07-09: JSON-LD is richer than v3 required (`itemCondition`, `priceSpecification`, conditional `gtin`/`brand`) but the availability falsehood blocks SC5._ | OBJ-5 |
| **FR-SEO-3** | THE SYSTEM SHALL render AI-proof visible fields (90-day low, relative price, "Verified at HH:MM CET"), never fabricated. | proof text non-CSS-hidden where the low is non-null; timestamp in CET; line silently drops when null. | OBJ-5 |
| **FR-SEO-4** | THE SYSTEM SHALL emit a per-page canonical + 13-locale hreflang + `x-default` on deal (and, via url-slug, category) pages. | 14 alternate tags per deal page; GSC International Targeting = 0 hreflang errors. | OBJ-5 |
| **FR-SEO-5** | THE SYSTEM SHALL derive every canonical/JSON-LD/sitemap host from `NEXT_PUBLIC_APP_URL=https://dealradar.me`. | `grep -rE 'dealradar\.(eu\|app)' src public` = 0; prod PDP canonical shows `dealradar.me`. | OBJ-5 |
| **FR-SEO-6** | THE SYSTEM SHALL serve a valid sitemap sourced from the DB with correct locales (`sv` not `se`) and hreflang alternates. | `/sitemap.xml` valid XML; sampled URLs → 200; locale codes correct; the sitemap **regenerates per-request or via ISR** (today it is a static prerender frozen at build — verified-live: prod has ZERO `/deal/` URLs, uniform lastmod); entries **omit `hidden=true`**; `lastmod` = `content_changed_at`/`last_updated` only, **never `new Date()`** (scope: the `?? new Date()` fallback at `sitemap.ts:23` governs home/legal/category entries and invalid dates — deal entries already pass real `d.lastUpdated`, `sitemap.ts:46-51`; for deals the build-freeze, not `new Date()`, is what freezes lastmod); the slug query is `.range()`-paginated past the PostgREST row cap (`.limit(5000)` likely truncates at 1000 silently — PLAUSIBLE). _Status 2026-07-09: DB-driven + 13-locale hreflang + category entries landed via main (adjacent work, NOT the A-19 spec); sharding stays FR-SEO-9._ | OBJ-5 |
| **FR-SEO-7** | THE SYSTEM SHALL serve host-aware robots with explicit AI/answer-engine Allow groups and the correct `Sitemap:` host. | `robots.txt` Sitemap line = `dealradar.me`; OAI-SearchBot/PerplexityBot/Google-Extended allowed — the three AI-bot rule groups live in `robots.ts` `rules[]`; `BASE` = `NEXT_PUBLIC_APP_URL` (today `process.env.URL`, `robots.ts:3` — previews advertise preview sitemaps); `public/robots.txt` deleted (today shadowed dead weight carrying a `dealradar.eu` Sitemap line). _Status 2026-07-09: `robots.ts` route EXISTS (merged-on-branch AND verified-live); AI groups + host var MISSING._ | OBJ-5 |
| **FR-SEO-8** | THE SYSTEM SHALL emit per-page SEO metadata (canonical + hreflang + unique title/description) on category pages. | view-source on a category page shows a per-page canonical + 13 hreflang (today: NO `generateMetadata` export on `category/[slug]/page.tsx`; all 13 locales × 11 categories share the layout's generic title); category content served to crawlers is **cookie-independent** (or `Vary` handled deliberately — today content varies by the location cookie, so crawlers index `DEFAULT_COUNTRY` inventory). Reuse the PDP metadata pattern (`deal/[slug]/page.tsx:35-43`) as the template. | OBJ-5 |
| **FR-SEO-9** | THE SYSTEM SHALL shard the sitemap (@10k) with freshness-biased `content_changed_at` lastmod, paginating past the PostgREST 1000-row cap. | sitemap-index with N shards; lastmod changes only on price/name/availability change. | OBJ-5 |
| **FR-SEO-10** | THE SYSTEM SHALL build the PDP internal-link graph (related / same-category / breadcrumb). | avg internal outlinks per PDP ≥ 8 (today ~1); expired-state links to live same-category alternatives. | OBJ-5 |
| **FR-SEO-11** | THE SYSTEM SHALL exclude `/search` from the index (`noindex`) AND no crawlable href on an indexable page SHALL carry a per-request-minted seed param; the homepage CTA SHALL target a stable URL. | view-source `/{locale}/search` shows `<meta name=robots content=noindex>`; grep pagination hrefs for `seed` = deterministic-or-absent. _Hazard grew 2026-07-09: HeroDeals "View all deals" links every crawl to `/search?sort=random` (`HeroDeals.tsx:71`) where each uncached request mints a fresh `Math.random` seed baked into every pagination href (`search/page.tsx:43,74`) — an unbounded near-duplicate crawl trap on a force-dynamic route, on an organic-only site. → T-SEO-11._ | OBJ-5 |
| **FR-SEO-12** | THE SYSTEM SHALL submit the sitemap and poll GSC/IndexNow coverage. | `pollCoverage()` writes `{indexed:int}`; sitemap resubmit on change; ≥ 1 PDP → "Indexed". | OBJ-5 |
| **FR-SEO-13** | THE SYSTEM SHALL probe AI-engine citations for a seeded query set. | `probeCitations(queries)` records ≥ 1 DealRadar citation on ChatGPT/Perplexity/Gemini/AI-Overviews within the M2 window. | OBJ-5 |
| **FR-SEO-14** | WHEN the index-coverage poll runs THE SYSTEM SHALL also pull GSC Search Analytics (avg position + CTR per query/page) into `operator_signals` so rank/CTR have a real feed. | rank/CTR rows populated in `operator_signals`; verified via a staging Search Analytics fetch. | OBJ-5 |
| **FR-SEO-15** | _(new v3.1)_ Paginated listings SHALL use crawlable server-rendered links with clean page-1 canonicals, and SHALL NOT emit non-deterministic params (seed) into crawlable hrefs. | `src/components/search/Pagination.tsx` renders real next-intl `<a>` hrefs with a clean page-1 URL + `aria-current` (**DONE merged-on-branch** — a v3-unknown capability); grep: no per-request-minted `seed` in any crawlable href (today Pagination faithfully propagates the seed the search/category pages mint, `search/page.tsx:43` / category `:42`). → T-SEO-11. | OBJ-5 |

### 1.5 Infra, Scale & Reliability (FR-INF-*) — serves OBJ-6

| ID | Requirement (EARS) | Acceptance (measurable) | OBJ |
|---|---|---|---|
| **FR-INF-1** | THE SYSTEM SHALL deploy the branch to prod Netlify, closing the merged≠deployed gap. | `curl` `/api/deals` = 200; deployed SHA == branch HEAD; a remediated route returns 200 not the stale 404. | OBJ-6 |
| **FR-INF-2** | THE SYSTEM SHALL verify Netlify's real function ceiling and offload/chunk the refresh fan-out accordingly. | measured full-matrix refresh completes with no timeout; false "15-min" docstrings corrected to the true daily cadence. | OBJ-6 |
| _FR-INF-3_ | _(reserved — cache/degradation folded into FR-INF-10 / NFR-PERF-1.)_ | n/a | — |
| **FR-INF-4** | WHEN an edge request arrives THE SYSTEM SHALL set `dr_location`, default unsupported countries to DE, and sanitize untrusted geo input. | supported header sets country; unsupported → DE; injected city neutralized; no lat/long column. | OBJ-6 |
| **FR-INF-5** | THE SYSTEM SHALL emit a heartbeat from every scheduled job and alarm (not silently exit) on a missing secret. | each cron writes `cron_heartbeat`; unset-secret run fires an alarm. | OBJ-6 |
| **FR-INF-6** | THE SYSTEM SHALL apply the migration to prod via an idempotent, allow-listed runner. | `db-migrate` exits 0; re-apply → no error; constraints/triggers/RLS/indexes present. | OBJ-6 |
| **FR-INF-7** | THE SYSTEM SHALL set security response headers / CSP on prod. | `curl -I` shows HSTS + CSP + `X-Frame-Options` + `X-Content-Type-Options`; securityheaders.com grade ≥ A. | OBJ-6 |
| **FR-INF-8** | THE SYSTEM SHALL apply atomic sliding-window rate limiting to write/expensive endpoints with a named fail-open warning. | (N+1)th request → 429 on refresh/postbacks/search/deals; unset-Upstash → named warning. | OBJ-6 |
| **FR-INF-9** | THE SYSTEM SHALL enforce in-repo cost guardrails + the named A-09 scale-up trigger. | `checkBudgets()` flags a synthetic over-budget scenario across DB rows / GH-Action minutes / AWIN egress / **Vertex-LLM token spend**; spend ≤ the declared cap. | OBJ-6 |
| **FR-INF-10** | THE SYSTEM SHALL build and run with an empty `.env` (graceful degradation), exiting 0. | clean-env `pnpm build` exit 0; providers log mock warnings; no navigation crash; 2nd `/api/deals` `cached:true` when Upstash set. | OBJ-6 |
| _FR-INF-11_ | _(reserved — unassigned; held vacant so FR-INF-12 (durability) keeps its v3-assigned number.)_ | n/a | — |
| **FR-INF-12** | THE SYSTEM SHALL maintain a data-durability posture: verified DB backup/PITR, a documented migration-rollback (or reversible-migration) convention, and a restore drill. | Supabase PITR/backup enabled; a restore drill recovers to a point-in-time; a forward-only migration has a documented rollback; `db-restore` is a T-OPS-6 fault class. | OBJ-6 |

### 1.6 Autonomous Operator (FR-OPS-*) — serves OBJ-7

| ID | Requirement (EARS) | Acceptance (measurable) | OBJ |
|---|---|---|---|
| **FR-OPS-1** | THE SYSTEM SHALL land the observability substrate (`operator_signals` + `operator_incidents` + error tracker + uptime probe + in-app instrumentation). | every §8.2 signal queryable in `operator_signals`; induced error captured; uptime ≥ 99.5%/mo recorded. | OBJ-7 |
| **FR-OPS-2** | THE SYSTEM SHALL run deterministic L1 monitors over `operator_signals` for feed health. | `runMonitors()` returns a `Breach[]` on the feed-health thresholds; 0 false positives on a clean run. | OBJ-7 |
| **FR-OPS-3** | THE SYSTEM SHALL monitor dedup-rate + 404-rate thresholds. | breach fires on a 404-spike / dedup-drop; clean → 0. | OBJ-7 |
| **FR-OPS-4** | THE SYSTEM SHALL monitor index-coverage + JSON-LD-validity thresholds. | breach fires on an index stall / validity drop. | OBJ-7 |
| **FR-OPS-5** | THE SYSTEM SHALL monitor postback 401 / FK-null / commission-anomaly thresholds. | breach fires on a 401 spike / commission=0 over 30 d. | OBJ-7 |
| **FR-OPS-6** | THE SYSTEM SHALL monitor rank / CTR regressions (fed by FR-SEO-14). | breach fires on a material rank/CTR regression vs the trailing window. | OBJ-7 |
| **FR-OPS-7** | THE SYSTEM SHALL monitor cost + cron-silence thresholds. | breach fires on a cost-cap breach / a silent cron. | OBJ-7 |
| **FR-OPS-8** | WHEN a novel incident is detected THE SYSTEM SHALL agentically triage it into one actionable escalation summary. | `triage(signalBundle)` names the affected subsystem + suggested action in one summary; fallback = escalate the raw bundle. | OBJ-7 |
| **FR-OPS-9** | THE SYSTEM SHALL deliver escalations to a human channel and run a dead-man's-switch heartbeat watchdog on an independent cron. | `escalate(summary)` delivers + returns an ack; suppressing the heartbeat fires the switch; 0 FP on a clean run. | OBJ-7 |
| **FR-OPS-10** | THE SYSTEM SHALL provide a fault-drill (game-day) harness covering the fault classes and measure detect/action rate. | `injectFault(type)` for {feed-down, mock-pollution, 404-spike, index-drop, postback-anomaly, cost-spike, cron-no-op, db-restore}; ≥ 90% actioned within NFR-AUTON-1. | OBJ-7 |

### 1.7 Compliance & Trust (FR-CMP-*) — serves OBJ-8

| ID | Requirement (EARS) | Acceptance (measurable) | OBJ |
|---|---|---|---|
| **FR-CMP-1** | THE SYSTEM SHALL render localized legal pages with 13-locale key parity — and every message key referenced in code SHALL exist in all 13 locale files. | `check-i18n.mjs` exit 0 (0 missing/empty keys); footer links route to localized Imprint/Privacy/Terms; a **code-usage↔messages cross-check** (`t(...)` extraction), not just cross-locale parity. _Defect 2026-07-09: `t('priceNote')` renders on EVERY `DealCard` (`DealCard.tsx:102`) and in the modal (`:174`) but `deal.priceNote` exists in NO messages file — next-intl shows the literal key to users in all 13 locales; cross-locale parity cannot catch it because the key is missing everywhere equally. Immediate fix: add the key to all 13 files or remove both call sites._ | OBJ-8 |
| **FR-CMP-2** | THE SYSTEM SHALL carry a real, counsel-signed Impressum (G2) — no placeholder identity in prod. | real name/VAT/address + `@dealradar.me`; grep `BE 0123.456.789`/`dealradar.eu` in prod = 0. | OBJ-8 |
| **FR-CMP-3** | THE SYSTEM SHALL render a visible affiliate-disclosure badge adjacent to every outbound CTA. | test asserts a visible (not `sr-only`, not footer-only) badge on `DealCard` + PDP; the badge-presence test **enumerates ALL components calling `decorateAffiliateUrl`** (incl. `DealDetailModal` if retained — its monetized CTA has NO badge today, `DealDetailModal.tsx:173-194`; dead code, but a latent counterexample the moment it is wired — cross-ref T-PDP-6 wire-or-delete). | OBJ-8 |
| **FR-CMP-4** | THE SYSTEM SHALL set 0 non-essential cookies pre-consent with equal-weight choice + withdrawal. | incognito first load → 0 non-essential cookies; footer control re-opens the modal; preference persists. | OBJ-8 |
| **FR-CMP-5** | THE SYSTEM SHALL support one-click unsubscribe (GET+POST, RFC 8058) + HMAC erasure. | valid token (either verb) → 200 + row deleted; invalid → error; repeat idempotent; `List-Unsubscribe`/`-Post` headers present. | OBJ-8 |
| **FR-CMP-6** | THE SYSTEM SHALL run a daily GDPR retention sweep of `price_alerts`. THE SYSTEM SHALL treat one-click unsubscribe + this sweep as satisfying GDPR Art 15/17 (A-18: `price_alerts.email` is the only PII; no separate DSAR handler required). | daily purge returns `{deleted:N}`; `price_alerts.created_at < now()-365d` = 0; a lint proves no other PII column exists on any table. | OBJ-8 |
| **FR-CMP-7** | THE SYSTEM SHALL log the consent choice server-side (Art 5(2)) with no PII. | a consent choice writes exactly one `consent_audit` row `{choice, analytics, policy_version, ts}`; PII-column lint = 0. | OBJ-8 |
| **FR-CMP-8** | WHEN a live refresh lowers a deal's `sale_price` below a subscriber's threshold THE SYSTEM SHALL fire the live-path alert and dispatch exactly one email (with the `List-Unsubscribe` header) within one cycle — and SHALL NOT alert on `hidden` deals. | a seeded qualifying drop → `refresh-alerts` dispatches exactly one email; raw-email inspection shows the unsubscribe header; alerts-sent count vs qualifying-drop count reconciles; **no alert email is dispatched for a deal with `hidden=true`** (either `.eq('hidden', false)` in `getRecentlyUpdatedDeals` — mirroring `dealsByIds` at `deals.repo.ts:234` — or a filter in `notifyPriceDrops`; today `getRecentlyUpdatedDeals` lacks the filter while hiding bumps `last_updated`, so alerts can fire for dead offers). _(v3.1, audit P2-I — subscription abuse-cap integrity:)_ the **per-email alert cap is enforced in the DB** (trigger or guarded-insert RPC) so concurrent POSTs cannot exceed the cap — today `alerts/route.ts:49-52` is a check-then-insert race — **OR** the accepted overshoot is documented; the IP limiter's **fail-open-without-Upstash** behavior (`redis.ts:78,83-85`) is documented; **double-opt-in** is recorded as a deferred product decision. _Status 2026-07-09: **built merged-on-branch** (`notifyPriceDrops` in `POST /api/refresh` + `notifyPendingAlerts` reconciliation + Netlify 06:00 cron + post-ingest `/api/refresh-alerts` step + decorated CTA + `List-Unsubscribe(-Post)`); verified-live pending (cron/secrets/Resend state UNVERIFIED). Real latency is up to ~24 h (daily 03:00/06:00 crons), not minutes._ | OBJ-8 |

---

## 2. Non-Functional Requirements

### 2.1 Performance (NFR-PERF-*) — OBJ-6
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-PERF-1** | Response cache. | Upstash 30-min TTL (`CACHE_TTL_SECONDS=1800`); 2nd identical `/api/deals` → `cached:true`. |
| **NFR-PERF-2** | PDP Core Web Vitals. | LCP < 2.5 s, CLS ≈ 0 (Lighthouse + CrUX field data). |
| **NFR-PERF-3** | DB hot-path latency. | `EXPLAIN` on deal/search/`public_id`/`ean` shows index use, no seq-scan. |

### 2.2 Reliability (NFR-REL-*) — OBJ-6 (→ OBJ-7)
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-REL-1** | Prod availability. | uptime probe records availability ≥ 99.5%/mo; graceful degradation, never a literal 100%. |
| _NFR-REL-2_ | _(reserved — mock-fallback folded into NFR-REL-5.)_ | n/a |
| **NFR-REL-3** | Empty-env build. | clean-env `pnpm build` exit 0. |
| _NFR-REL-4_ | _(reserved — release gate folded into NFR-REL-5 + T-INF-4 CI.)_ | n/a |
| **NFR-REL-5** | Build/test health gate. | `tsc --noEmit` + `next build` + `pnpm test` exit 0; mock output dev-only, never prod. |
| **NFR-REL-6** | Data durability / DR. | Supabase PITR/backup enabled; a restore drill recovers to a point-in-time; migration rollback documented (see FR-INF-12). |

### 2.3 Security (NFR-SEC-*) — OBJ-6 / OBJ-3
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-SEC-1** | Postback auth. | timing-safe dedicated `WEBHOOK_SECRET` (no CRON_SECRET fallback); wrong secret → 401. |
| **NFR-SEC-2** | Migration/DB privilege. | service-role key server-side only; RLS on all tables (`pg_policies`). |
| **NFR-SEC-3** | Transport/response hardening. | HSTS + CSP + `X-Frame-Options` + `X-Content-Type-Options` present. |
| **NFR-SEC-4** | Webhook integrity. | HMAC body signature + replay guard beyond the query-param secret; tampered/replayed → rejected. |
| **NFR-SEC-5** | Input sanitization. | edge city-injection payload neutralized (unit test). |
| **NFR-SEC-6** | Abuse protection. | atomic sliding-window rate limit on write/expensive endpoints; (N+1)th → 429. |

### 2.4 Privacy (NFR-PRIV-*) — OBJ-8 / OBJ-3
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-PRIV-1** | SubID carries no PII. | subID grammar = `dealradar_{country}_{category}_{productId}`; no email/name encoded. |
| **NFR-PRIV-2** | Right to erasure. | valid unsubscribe deletes the `price_alerts` row; idempotent on repeat. |
| **NFR-PRIV-3** | Consent accountability. | consent audit logged with no PII (Art 5(2)); opt-in analytics default OFF. |
| **NFR-PRIV-4** | No geo-coord persistence. | no lat/long column exists on any table (schema lint). |

### 2.5 SEO/Discoverability (NFR-SEO-*) — OBJ-5
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-SEO-1** | Index coverage. | 0 → ≥ 1,000 (A-10) indexed URLs within 90 d; weekly GSC delta. |
| **NFR-SEO-2** | Host correctness. | 0 sampled canonical/hreflang/JSON-LD/sitemap references on a non-`dealradar.me` host. |
| **NFR-SEO-3** | Structured-data validity. | RRT 0 errors; GSC "Merchant listings" valid-item count > 0. |
| **NFR-SEO-4** | GEO citation. | ≥ 1 AI-engine citation observed within the M2 window. |

### 2.6 Cost (NFR-COST-*) — OBJ-6
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-COST-1** | Cost envelope. | monthly spend ≤ the A-09 cap; `checkBudgets()` flags a breach. |
| **NFR-COST-2** | Feed egress cap. | AWIN egress ≤ ~300–350 MB/run (A-09); alert on a breach. |
| **NFR-COST-3** | Agentic-step cost bound. | per-run + monthly Vertex/LLM token spend for the 4 agentic components (DSN-ING-8/PDP-4/MON-5/OPS-4) ≤ the A-09 token cap; each agentic cron carries a max-iteration guard; `checkBudgets()` flags a breach. |

### 2.7 Observability (NFR-OBS-*) — OBJ-7
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-OBS-1** | Signal emission. | each named signal emitted on its code path (instrumentation test). |
| **NFR-OBS-2** | Error tracking. | an induced error is captured by the tracker. |
| **NFR-OBS-3** | Liveness. | a missing-signal / cron-silence check alerts if a stream goes dark. |

### 2.8 Scale (NFR-SCALE-*) — OBJ-6
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-SCALE-1** | Fan-out headroom. | full-matrix refresh within the verified serverless ceiling (no timeout). |
| **NFR-SCALE-2** | Sitemap scale. | sharded @10k, paginated past the PostgREST 1000-row cap. |
| **NFR-SCALE-3** | DB scale trigger. | DB-size trend watched vs the A-09 scale-up trigger; hot-path indexes present. |

### 2.9 Autonomy (NFR-AUTON-*) — OBJ-7
| ID | Requirement | SLO + measurement |
|---|---|---|
| **NFR-AUTON-1** | Fault response time. | **MTTA ≤ 15 min, MTTR ≤ 60 min** for known fault classes; read from `operator_incidents`; ≥ 90% of drills actioned within these bounds. |
| **NFR-AUTON-2** | Escalation quality. | novel-fault triage yields one actionable summary (not a firehose); human-ack rate tracked. |
| **NFR-AUTON-3** | Liveness guarantee. | the dead-man's switch fires within one heartbeat interval of Operator silence. |

---

## 3. Coverage & Orphan Check

* **OBJ → FR/NFR:** OBJ-1 ← FR-MON-6, plus the revenue-realizing acceptance of OBJ-2/3/4/5; OBJ-2 ← FR-ING-* (incl. new FR-ING-12/13); OBJ-3 ← FR-MON-1..5, NFR-SEC-1/4, NFR-PRIV-1; OBJ-4 ← FR-PDP-* (incl. new FR-PDP-7); OBJ-5 ← FR-SEO-* (incl. new FR-SEO-15), FR-ING-13, FR-PDP-7, NFR-SEO-*; OBJ-6 ← FR-INF-*, NFR-PERF/REL/SEC/COST/SCALE-*; OBJ-7 ← FR-OPS-*, NFR-OBS/AUTON-*; OBJ-8 ← FR-CMP-*, NFR-PRIV-2/3. **Every OBJ has ≥ 1 FR/NFR.**
* **FR/NFR → DSN → Task:** every requirement above is satisfied by ≥ 1 `DSN-*` (design.md §7 reverse matrix) and implemented by ≥ 1 `T-*` (tasks.md §7). Reserved numbers (FR-ING-8, FR-INF-3, FR-INF-11, NFR-REL-2/4) are explicitly folded/held and carry no task by design. New v3.1 chains: FR-ING-12 → DSN-ING-11 → T-ING-10; FR-ING-13 → DSN-ING-12 → T-ING-11; FR-PDP-7 → DSN-PDP-7 → T-PDP-6; FR-SEO-15 → DSN-SEO-12 → T-SEO-11.

---

_End of v3.1 Requirements. Every FR/NFR cites its OBJ and carries a measurable acceptance signal; design.md maps each to a DSN and tasks.md to a T-*. Three-state honesty applies to every status note above: merged-on-branch ≠ deployed-to-prod ≠ verified-live._
