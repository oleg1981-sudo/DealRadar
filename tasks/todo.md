# Tasks: deal URL & slug structure — v2

Spec: `docs/specs/url-structure/2026-07-08_v2/spec.md` · Plan: `tasks/plan.md` · Red-team register: `docs/specs/url-structure/2026-07-08_v2/redteam-register.md`
Order is dependency order. Nothing below is implemented yet.

## Phase A

- [x] A1: Design decisions — DONE 2026-07-08 (scheme, brand prefix, country-in-identity, freeze-after-mint, dynamic rendering; recorded in spec header)
- [ ] A2: Pre-flight probes (read-only)
  - Acceptance: 5 answers recorded in spec: PostgREST max-rows; mixed-case slug count; `-d[0-9a-f]{12}$` legacy collisions (≈0); product_ids written by >1 country in 7 days; Netlify geo header reality
  - Verify: outputs pasted into spec "Pre-flight items"
  - Files: (none — SQL + Netlify UI)

## Phase B

- [ ] B1: Additive schema + mint triggers + backfill
  - Acceptance: unaccent in extensions schema; 6 new columns (status CHECK incl. 'gone'); deal_slug_base() STABLE, schema-qualified, wildcard-free brand predicate; BEFORE INSERT mints public_id (salted-retry on conflict) + legacy_slug; BEFORE UPDATE NULL-safe freeze; backfill incl. content_changed_at := last_updated; UNIQUE public_id idx, legacy_slug exact+lower() idxs, partial active idxs
  - Verify: `pnpm db:migrate`; zero NULLs post-backfill; old-writer insert gets minted; old app build unaffected
  - Files: supabase/schema.sql

## Phase C (C1 first; hold deploy in prod ≥1 week before D)

- [ ] C1: deal-path helper + unit tests
  - Acceptance: dealHref (locale-less) / absoluteDealUrl / parseDealSlug + TS md5-12; parseDealSlug rejects `nikon-d5300`, accepts exactly 12 hex, case-folds
  - Verify: `pnpm test`
  - Files: src/lib/utils/deal-path.ts, src/lib/utils/deal-path.test.ts
- [ ] C2: Resolver ladder (incl. live-slug rung) + getDealByPublicId
  - Acceptance: Step A (parse → 200 | one-hop 308 | fall through); Step B rung 1 exact live-slug → 200 (pre-flip safety — THE blocker fix); rung 2 legacy exact + lower() → row.slug===raw ? 200 : 308; Step C notFound(); 308 via next/navigation permanentRedirect in generateMetadata; NO revalidate export; status-aware (expired renders, gone → 410)
  - Verify: `pnpm test`; preview: old-format URL → 200 no redirect; stale new-format → single 308
  - Files: src/app/[locale]/deal/[slug]/page.tsx, src/lib/db/deals.repo.ts
- [ ] C3: Expired/gone states + strings + related deals
  - Acceptance: expired → 200 + localized banner(expired_at) + disabled CTA + full price-history table + related-deals block (also on LIVE pages); gone → 410; JSON-LD availability by status; strings ×13
  - Verify: `node scripts/check-i18n.mjs`; fixture renders
  - Files: src/app/[locale]/deal/[slug]/page.tsx, src/components/deals/*, src/messages/*.json
- [ ] C4: DealCard link + mock parity
  - Acceptance: next-intl Link + dealHref; slug stamped server-side in mock read path (registry/repo — NOT in the 'use client' card); unit test: href contains exactly one locale segment
  - Verify: `pnpm build` empty-env; mock href → resolver → 200 round-trip test
  - Files: src/components/deals/DealCard.tsx, src/lib/providers/registry.ts, src/lib/db/deals.repo.ts
- [ ] C5: Sitemap shards + index route
  - Acceptance: generateSitemaps 256 hex-prefix shards on public_id; per-shard ≤1000-row paged fetches; entries = all 13 locale URLs, NO alternates; revalidate=3600 on sitemap.ts AND index route; fail-loud on empty query; sitemap-index.xml/route.ts emits <sitemapindex> from live count
  - Verify: `next build && next start` (prod paths differ from dev); count parity vs DB
  - Files: src/app/sitemap.ts, src/app/sitemap-index.xml/route.ts, src/lib/db/deals.repo.ts
- [ ] C6: robots.ts + host cleanup
  - Acceptance: robots.ts replaces public/robots.txt; Sitemap → index URL from NEXT_PUBLIC_APP_URL; AI-bot Allow groups + Disallow /api/ verbatim; zero dealradar.eu in src/
  - Verify: GET /robots.txt in preview; `grep -rn dealradar.eu src/` → 0
  - Files: src/app/robots.ts, public/robots.txt (delete), src/app/sitemap.ts, src/app/[locale]/deal/[slug]/page.tsx
- [ ] C7: Category crawl paths + search noindex
  - Acceptance: category generateMetadata (canonical + 13 hreflang + x-default); crawlable ?page=N w/ per-page self-canonical; stable cookieless-default country per locale; /search meta-noindex
  - Verify: view-source preview; paginated pages resolve
  - Files: src/app/[locale]/category/[slug]/page.tsx, src/app/[locale]/search/page.tsx
- [ ] C8: Provider re-key — country into product_id (decision D3)
  - Acceptance: every provider emits {provider}:{COUNTRY}:{id}; ingest-awin folds --country in; mock format unchanged (already country-scoped)
  - Verify: `pnpm test` (registry/dedup suites); staged ingest writes country-scoped ids
  - Files: src/lib/providers/kelkoo.ts, strackr.ts, tradedoubler.ts, scripts/ingest-awin.cjs
- [ ] C9: Read-path active filters
  - Acceptance: queryDeals, distinct_brands RPC, search all filter status='active'; deal resolver + alerts exempt
  - Verify: vitest; expired fixture absent from grid, present at its URL
  - Files: src/lib/db/deals.repo.ts, supabase/schema.sql (RPC), src/app/api/search/route.ts
- [ ] C10: OG/twitter + JSON-LD corrections
  - Acceptance: openGraph{title,description,url:absoluteDealUrl,images,locale} + twitter summary_large_image; Product.url added; AggregateOffer → single Offer + priceValidUntil; BreadcrumbList (Home › category › product)
  - Verify: Rich Results Test on preview URL: 0 errors
  - Files: src/app/[locale]/deal/[slug]/page.tsx, src/app/[locale]/layout.tsx
- [ ] C11: CI + phase-aware smoke
  - Acceptance: ci.yml runs typecheck+vitest+check-i18n on PR; smoke-spine: pre-flip (old-format → 200 no-redirect) and post-flip (legacy → one-hop 308) modes; count-parity sitemap assertion; bogus id/slug → 404; expired → 200+OutOfStock; gone → 410
  - Verify: CI green on PR; smoke green vs preview
  - Files: .github/workflows/ci.yml, scripts/smoke-spine.mjs

### Checkpoint C (gate to D): preview green on all C verifies; deployed to prod; ≥1 week soak; A2 collision scan re-run against latest rows

## Phase D (point of no return — sequence exactly)

- [ ] D1: Delta backfill → gate → trigger flip → slug rewrite → deploy
  - Acceptance: (1) backfill WHERE public_id IS NULL OR legacy_slug IS NULL; (2) GATE count=0; (3) authoritative trigger: compose slug always (force-overwrite writers), slug_base frozen after mint (GUC app.slug_rebase hatch), content_changed_at := now() iff ROW(name,brand,sale_price,original_price,discount_percent) changed, reactivation iff NEW.last_updated IS DISTINCT FROM OLD.last_updated; (4) one-time slug rewrite; (5) IMMEDIATE deploy or purgeCache()
  - Verify: staging: rename → H1 changes, URL unchanged, no redirect; stale-slug URL → one-hop 308; forced collision → salted retry, batch completes
  - Files: supabase/schema.sql
- [ ] D2: Writer cleanup
  - Acceptance: slug composition deleted from toRow() AND fromRow() fallback AND ingest-awin.cjs AND DealCard fallback; writers send no status/expired_at/content_changed_at; grep gate `grep -rnE "slugify\([^)]*[Nn]ame\)" src scripts` → allowlist only (registry dedupe key, mock-parity helper)
  - Verify: `pnpm test`; staged ingest → trigger-composed slugs
  - Files: src/lib/db/deals.repo.ts, scripts/ingest-awin.cjs, src/components/deals/DealCard.tsx
- [ ] D3: Expiry cron + alerting (ASK FIRST before prod enable)
  - Acceptance: feed sources expire by set-difference vs last SUCCESSFUL ingest run-id; ≥72h floor elsewhere; skip-if-last-run-failed; >10% tripwire; ingest failure alerting + 60-day keepalive; purge cron stays dead + CI grep guard (no DELETE FROM deals)
  - Verify: staging round-trip: cron-expire → run update_historical_lows_batch → still expired → re-upsert → active
  - Files: supabase/schema.sql, .github/workflows/ingest-awin.yml, .github/workflows/ci.yml
- [ ] D4: 'gone' policy job (OFF until E review)
  - Acceptance: scheduled batch marks gone WHERE expired > 12 months (impressions check manual for now); resolver 410s
  - Verify: staging fixture → 410
  - Files: supabase/schema.sql

## Phase E

- [ ] E1: Deployed-host verification
  - Acceptance: curl matrix (status + Cache-Status on 308s, one-hop within one cache window); sitemap freshness (post-deploy insert appears within TTL, no redeploy)
  - Verify: outputs attached to PR
- [ ] E2: RRT + GSC
  - Acceptance: Rich Results Test 0 errors incl. priceValidUntil (closes SC5); sitemap-INDEX URL submitted; 7-day coverage watch
- [ ] E3: Geo fix + crawl budget
  - Acceptance: middleware prefers req.geo?.country (headers as fallback); non-DE visitor verified; simulated full-sitemap crawl budget recorded (Supabase QPS + invocations)
  - Files: src/middleware.ts
