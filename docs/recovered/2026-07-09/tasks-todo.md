# Tasks: deal URL & slug structure

> **RECOVERED FILE** — verbatim re-emission (2026-07-09) of `tasks/todo.md` as read into session context on 2026-07-08, after the original was destroyed by a working-tree replacement. Checkbox states are as of 2026-07-08.

Spec: `docs/specs/2026-07-08_url-slug-structure_v1.md` · Plan: `tasks/plan.md`
Gate: spec approval required before starting B1. Order is dependency order.

## Phase A — decisions & pre-flight

- [x] A1: Resolve open questions with reviewer — DONE 2026-07-08: scheme approved, brand prefix approved; expiry window (48h) and /search noindex (meta) proceed on spec defaults
  - Acceptance: spec updated from DRAFT with decisions recorded; assumptions block confirmed
  - Verify: spec header no longer says DRAFT ✓
  - Files: docs/specs/2026-07-08_url-slug-structure_v1.md
- [ ] A2: Pin host + prod pre-flight queries
  - Acceptance: NEXT_PUBLIC_APP_URL=https://dealradar.me confirmed in Netlify; PostgREST max-rows known; mixed-case slug count known; `-d[0-9a-f]{12}$` collision count ≈ 0
  - Verify: query outputs pasted into spec Open Questions answers
  - Files: (none — Netlify UI + read-only SQL)

## Phase B — additive schema

- [ ] B1: Migration — columns, function, backfill, indexes
  - Acceptance: unaccent enabled; public_id/legacy_slug/slug_base/status/expired_at/content_changed_at exist; deal_slug_base() created; backfill complete (public_id = md5-12, legacy_slug = frozen slug bytes); UNIQUE deals_public_id_idx + legacy_slug exact & lower() indexes + partial active index
  - Verify: `pnpm db:migrate`; row counts match; old app build still serves deals (no behavior change)
  - Files: supabase/schema.sql

## Phase C — app dual resolution

- [ ] C1: deal-path helper + unit tests
  - Acceptance: buildDealPath/parseDealSlug/md5-12 helper; parseDealSlug rejects `nikon-d5300`, accepts 12-hex, case-folds id; TS md5-12 byte-matches SQL substr(md5(),1,12) on fixtures
  - Verify: `pnpm test` new suite green
  - Files: src/lib/utils/deal-path.ts, src/lib/utils/deal-path.test.ts
- [ ] C2: Resolver ladder in deal page
  - Acceptance: Step A (publicId → 200 | one-hop 308 | fall-through), Step B (legacy exact then lower(), 308), Step C notFound() in generateMetadata; `export const revalidate = 3600`; getDealByPublicId in repo
  - Verify: `pnpm test`; manual: stale-slug URL 308s once; bogus id 404s with real HTTP status
  - Files: src/app/[locale]/deal/[slug]/page.tsx, src/lib/db/deals.repo.ts
- [ ] C3: Expired-state rendering + strings
  - Acceptance: expired → 200, localized banner with expired_at, CTA disabled, JSON-LD availability=OutOfStock, 90-day-low line dropped, same-category links; strings in all 13 message files
  - Verify: `node scripts/check-i18n.mjs`; render an expired fixture
  - Files: src/app/[locale]/deal/[slug]/page.tsx, src/messages/*.json
- [ ] C4: DealCard link unification
  - Acceptance: next-intl Link; href via buildDealPath; mock fallback = slugify(name) + '-d' + TS md5-12(productId) → dev/prod byte parity
  - Verify: `pnpm build` empty-env mock build; card hrefs match new pattern
  - Files: src/components/deals/DealCard.tsx
- [ ] C5: Sitemap sharding + lastmod integrity
  - Acceptance: generateSitemaps() @10k/shard; active-only; ORDER BY content_changed_at DESC; lastmod = content_changed_at (fallback last_updated); buildDealPath everywhere; changefreq/priority removed from deal entries
  - Verify: local build emits sitemap index + shards; sampled URLs resolve
  - Files: src/app/sitemap.ts, src/lib/db/deals.repo.ts
- [ ] C6: robots.ts + host fallback fix
  - Acceptance: src/app/robots.ts replaces public/robots.txt; Sitemap line derives from NEXT_PUBLIC_APP_URL; AI-bot Allow groups + Disallow /api/ preserved verbatim; dealradar.eu fallback → dealradar.me everywhere BASE_URL is derived
  - Verify: GET /robots.txt in dev shows dealradar.me sitemap; grep dealradar.eu → 0 hits in src/
  - Files: src/app/robots.ts, public/robots.txt (delete), src/app/sitemap.ts, src/app/[locale]/deal/[slug]/page.tsx
- [ ] C7: Category canonical/hreflang + /search noindex
  - Acceptance: category pages emit generateMetadata canonical + 13 hreflang + x-default; /search emits noindex meta and stays out of sitemap
  - Verify: view-source on dev category + search pages
  - Files: src/app/[locale]/category/[slug]/page.tsx, src/app/[locale]/search/page.tsx
- [ ] C8: smoke-spine extension
  - Acceptance: asserts new→200, legacy→308→200 one hop, stale-slug→308→200, bogus id→404, bogus slug→404, expired→200+OutOfStock, sitemap sample 100% 200
  - Verify: `node scripts/smoke-spine.mjs` green against deploy preview
  - Files: scripts/smoke-spine.mjs

## Phase D — DB flip + writer cleanup

- [ ] D1: Authoritative trigger + slug rewrite
  - Acceptance: trigger freezes public_id/legacy_slug, recomputes slug_base only on name/brand change, always composes+overwrites slug; one-time UPDATE rewrites all slugs to new format; old deal_slug()/deals_set_slug() replaced
  - Verify: insert/update fixtures in staging: rename → slug_base changes, public_id frozen; writer-supplied stale slug discarded
  - Files: supabase/schema.sql
- [ ] D2: Writers stop composing slugs; content_changed_at bumps
  - Acceptance: toRow() and ingest-awin.cjs send no slug; both bump content_changed_at only on price/name/availability change; `grep -rn "slugify(d.productName)"` → 0 composition hits
  - Verify: `pnpm test`; ingest a staging batch → trigger-composed slugs
  - Files: src/lib/db/deals.repo.ts, scripts/ingest-awin.cjs
- [ ] D3: Expiry cron (ASK FIRST before enabling in prod)
  - Acceptance: pg_cron marks expired @48h; upsert re-activates via trigger; purge cron remains dead + CI grep guard for DELETE FROM deals
  - Verify: staging: age a row, cron marks it, page shows expired state, sitemap drops it
  - Files: supabase/schema.sql, CI config

## Phase E — verification

- [ ] E1: Deployed-build verification + cache purge
  - Acceptance: curl matrix on dealradar.me (not preview): 308 one-hop, 404s real, expired 200; Netlify cache purged at release
  - Verify: curl output attached to PR
- [ ] E2: Rich Results Test + GSC
  - Acceptance: RRT 0 errors on a live deal page (closes SC5); sitemap index submitted; coverage monitored 7 days
  - Verify: RRT screenshot; GSC coverage report
