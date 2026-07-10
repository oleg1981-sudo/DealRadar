# Spec: SEO/AEO/GEO-optimized deal URL & slug structure — v2

**Version:** 2026-07-08_v2 · **Status:** APPROVED — supersedes v1 after adversarial review (49 raw findings → 25 accepted: 1 blocker, 16 major, 8 minor; full register in [redteam-register.md](redteam-register.md))
**Traces:** FR-RTE-1/2, FR-GEO-1..4, R-RTE-1/2, R-GEO-4/5, R-ING-4, GAP-1, P0-1, P1-4, SC2, SC5
**What survived review unchanged:** the identity core — frozen md5-derived `public_id`, trigger-owned slug composition, `legacy_slug` kept forever, the drift-healing 308 ladder, flat `/deal/` paths, no category/country in URLs. Positively verified sound: `permanentRedirect` in `generateMetadata` yields a real pre-shell 308; 308≡301 for Google/Bing; `price_history`/`transactions`/`alerts` all key on `product_id`, nothing downstream breaks.
**What v2 changes:** the migration sequencing (v1's Phase C bricked every URL), the expiry/reactivation trigger logic, the entire sitemap section (four false premises about Next 14/PostgREST/Netlify/Google), slug-drift policy (now freeze-after-mint), market identity (country folds into `product_id`), and rendering honesty (deal pages are dynamic; v1's `revalidate` was dead config).

---

## Objective

Give every deal a **unique, permanent, human-readable URL** that search engines can rank, answer engines can cite, and users can share — surviving product renames, provider churn, and deal expiry without ever 404ing unexpectedly.

Verified live (2026-07-08): production has zero product URLs (modal-only cards, category-only sitemap, `/en/deal/*` 404s). Nothing is indexed; this is the cheapest moment to choose the scheme.

## Decisions locked (reviewer, 2026-07-08)

| # | Decision | Choice |
|---|---|---|
| D1 | URL scheme | `/{locale}/deal/{slug_base}-d{12-hex public_id}` |
| D2 | Brand prefix in slug | Yes — prepend when the name doesn't already start with it (normalized comparison) |
| D3 | Market identity | **Country folds into `product_id`** at every provider boundary (`kelkoo:DE:123`, `awin:DE:12345`) — same product in two markets is two rows, two URLs, each with stable country/currency/price |
| D4 | Slug drift | **Freeze after mint** — `slug_base` computed once at first insert, never recomputed (no 308 churn, no browser-cached redirect loops; admin rebase via GUC escape hatch only) |
| D5 | Rendering | **Dynamic for launch** — deal pages render per-request (the shared `[locale]` layout reads `cookies()`, so ISR is unearnable without a layout refactor; that refactor is a documented follow-up, not part of this spec). Phase E gains a crawl-load budget check |

## The design

### 1. URL pattern

```
/{locale}/deal/{slug_base}-d{public_id}
e.g.  /de/deal/blazevideo-wildkamera-a252-64mp-solarpanel-d3f8a1c92b4e7a   (12 hex after -d)
```

Route segment `[slug]` unchanged. Locale prefix always (existing policy). Country, category, filters: never in the path; filters stay query params and out of the sitemap.

### 2. Identity: `public_id`

| Property | Rule |
|---|---|
| Value | `lower(substr(md5(product_id), 1, 12))` — 12 lowercase hex chars |
| Minted | **Phase B** `BEFORE INSERT` trigger: `NEW.public_id := coalesce(NEW.public_id, substr(md5(NEW.product_id),1,12))`; same trigger also stamps `NEW.legacy_slug := coalesce(NEW.legacy_slug, NEW.slug)` — so rows created during the B→D window are never stranded |
| Frozen | `BEFORE UPDATE`, **NULL-safe**: `NEW.public_id := COALESCE(OLD.public_id, substr(md5(NEW.product_id),1,12))` — immutable once set, self-repairing if NULL |
| Unique | `UNIQUE INDEX deals_public_id_idx` |
| Collisions | Birthday math (corrected): **1.8×10⁻⁵ @100k rows, 1.8×10⁻³ @1M** — a *when*, not an *if*, since rows are never deleted. Self-healing in-trigger: on unique conflict at INSERT, re-derive with a salt — `substr(md5(product_id || ':1'),1,12)`, incrementing until unique. Length stays 12, the parser never changes, ingest never aborts. A collided row loses offline derivability (documented; the mint is logged) |
| Why md5-derived | Backfill, ingest, and smoke tests derive it offline with no DB round-trip |

**Market identity (D3):** every provider composes `product_id` as `{provider}:{COUNTRY}:{id}` (mock providers already embed country). This ends the country last-write-wins flap: no more currency oscillating in JSON-LD under one canonical, no lastmod inflation from cross-market overwrites. Transition: the re-key ships in Phase C; old un-countried rows stop being written, coexist briefly with their re-keyed successors (bounded duplicate window), then age out via the expiry lifecycle and drop from listings/sitemap while their URLs keep resolving as expired pages.

### 3. Slug: `slug_base` (cosmetic, frozen at mint)

SQL function `deal_slug_base(brand text, product_name text)`, declared **STABLE** (not IMMUTABLE — it calls `unaccent`, which is dictionary-dependent), schema-qualified for Supabase: `extensions.unaccent('extensions.unaccent'::regdictionary, $1)`, with `ALTER FUNCTION … SET search_path = public, extensions`.

```
norm(x)   = extensions.unaccent(x) → lower → regexp_replace('[^a-z0-9]+','-','g') → trim '-'
norm_b    = norm(brand);  norm_n = norm(product_name)
input     = prepend brand iff brand IS NOT NULL
            AND norm_n <> norm_b
            AND left(norm_n, char_length(norm_b) + 1) <> norm_b || '-'     -- wildcard-free, slug-space comparison
slug_base = truncate(norm result, ≤60 chars, cut back to last hyphen) ; COALESCE(NULLIF(…,''),'deal')
```

- The v1 `NOT ILIKE brand || '%'` predicate is dead: `%`/`_` in feed brands acted as wildcards ("100% Pure"), and raw-text comparison double-prefixed accented brands ("L'Oréal" vs "L'Oreal Paris…" → `l-oreal-l-oreal-…`). The new predicate compares in normalized slug space.
- **Frozen after mint (D4):** computed on INSERT only; `BEFORE UPDATE` keeps `OLD.slug_base` (NULL-safe coalesce for the delta cohort). Since `public_id` is also frozen, the stored `slug` is immutable after mint — Step A's drift-308 serves only truncated/mistyped/case-variant URLs. Renames update page content, not the URL: cosmetic staleness the resolver already tolerates, in exchange for zero 308 churn and immunity to feed-title oscillation (browsers cache 308s indefinitely — RFC 7538) and brand backfills.
- Admin rebase escape hatch: the trigger honors `current_setting('app.slug_rebase', true) = 'on'` (set via `SET LOCAL` in an admin session) to recompute deliberately; never used by writers.
- Stored `slug` = `slug_base || '-d' || public_id`, composed **exclusively by the trigger** (Phase D), which force-overwrites writer-supplied values. `slug` stays NOT NULL; the existing global unique index stays as a trigger-bug tripwire.
- **SQL is the single slug authority.** No TS mirror of the pipeline: `slugify()`'s NFD-strip deletes what `unaccent` transliterates (`Weißwein`→`wei-wein` vs `weisswein`; ß/ø/æ/đ saturate 5 of 13 locales). Parity testing is snapshot-based (see Testing). TS `slugify()` survives untouched solely for the dedupe fallback key and mock mode.

### 4. Resolution & canonicalization (the zero-404 ladder)

One React-`cache()`d resolver shared by `generateMetadata` + render; `notFound()` and `permanentRedirect()` are thrown **in `generateMetadata`** (verified: real pre-shell HTTP statuses; preserves the R-RTE-1 gate). Redirects use `next/navigation`'s `permanentRedirect` with the fully-prefixed path — never `createNavigation`'s redirect.

```
Step A — /^(.*)-d([0-9a-f]{12})$/i on the segment:
    hit → getDealByPublicId(lower(id))
        found, segment === stored slug   → 200, per-locale self-canonical
        found, segment differs           → 308 to /{locale}/deal/{row.slug}   (always one hop)
        id unknown                       → fall through
Step B — live + legacy slugs (kept forever):
    exact .eq(slug, raw)                 → 200 self-canonical      ← NEW: covers the pre-flip window;
                                                                      without it, Phase C self-308-loops the whole site
    exact .eq(legacy_slug, raw), then lower() variant (.limit(1) + log)
        → row.slug === raw ? 200 : 308 to current canonical
Step C — notFound() → real HTTP 404
```

- **URL composition: exactly one point of truth, two shapes.** v1's single `buildDealPath(locale, slug)` fed to the next-intl `Link` would double-prefix (`/en/en/deal/…` → 404 on every card click, verified against `createNavigation` + `localePrefix:'always'`):

```ts
// src/lib/utils/deal-path.ts — the ONLY module composing deal paths
export function dealHref(slug: string): string {          // next-intl Link consumers (DealCard) — Link adds the locale
  return `/deal/${slug}`;
}
export function absoluteDealUrl(locale: Locale, slug: string): string {  // canonical, hreflang, JSON-LD, sitemap, og:url
  return `${BASE_URL}/${locale}/deal/${slug}`;
}
export function parseDealSlug(segment: string): { base: string; publicId: string } | null { /* -d[0-9a-f]{12} $ */ }
```

  Seven construction sites route through it: sitemap `<loc>`, page canonical, hreflang set, JSON-LD url, DealCard href, the resolver's 308 target, and **`og:url`** (new).
- **Rendering (D5):** deal pages are dynamic (layout `cookies()`); no `revalidate` claim. Phase E budgets a full-sitemap crawl: Supabase QPS + Netlify invocation cost at active-deals × 13 locales.
- **Social/share metadata (new):** `generateMetadata` adds `openGraph { title, description, url: absoluteDealUrl(…), images: [deal.imageUrl], locale }` and `twitter { card: 'summary_large_image' }`; site-default OG in the locale layout.
- **JSON-LD corrections (while C3 touches the block):** add top-level `Product.url` (the canonical this spec exists to mint); replace `AggregateOffer` (offerCount:1 misuses the multi-seller type; highPrice asserted the strikethrough price as a live ceiling) with a single `Offer` — `price = salePrice`, `priceValidUntil` derived from the expiry window, `availability` by status; add `BreadcrumbList` (Home › {category} › {product}) reusing the category-hub URLs.

### 5. Lifecycle: active → expired → gone

Schema: `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','gone'))` + `expired_at timestamptz` + hot-path partial indexes `WHERE status='active'`.

**Re-activation discriminator (v1's was unimplementable — the cron's own UPDATE, the unguarded `update_historical_lows_batch` RPC, and writer upserts are indistinguishable at trigger level):**

```sql
-- BEFORE UPDATE, in the authoritative trigger:
IF NEW.last_updated IS DISTINCT FROM OLD.last_updated THEN
  NEW.status := 'active'; NEW.expired_at := NULL;
END IF;
-- Writers ALWAYS send a fresh last_updated; the expiry cron and the
-- historical-lows RPC never touch it. Writers MUST NOT send status/expired_at.
```

**Expiry keyed to availability, not wall-clock recency** (v1's 48h was justified against a 15-min refresh cadence that doesn't exist — the deployed reality is one daily cron with a top-100-per-cell persistence cap, under which live long-tail deals would mass-expire):
- Feed sources (AWIN): expire by **set-difference against the latest successful ingest run** — a run-id watermark; skip expiry entirely if the last run failed.
- API sources: exempt from wall-clock expiry until a full-inventory sweep exists; fallback wall-clock floor **≥72h**, never 48h.
- **Tripwire:** the cron refuses to expire >10% of active rows in one run (a rotated `CRON_SECRET` 401ing silently, a feed outage, or GitHub's 60-day scheduled-workflow auto-disable must not empty the catalog).
- **Ingest/refresh failure alerting is a deliverable of this spec** (also required by the collision-abort path), plus a keepalive against the 60-day auto-disable.

**Read-path matrix (v1 filtered only the sitemap — listings would rot majority-expired):**

| Path | Sees |
|---|---|
| `queryDeals` (home/category grids), `distinct_brands`, search | `status='active'` only |
| Deal page resolver, price-alert notify | active + expired (+ gone → 410) |
| Sitemap | active only (+ optional recently-expired shard, `lastmod=expired_at`, ≤12 months) |

**Expired pages are non-thin:** HTTP 200, localized "Deal expired — last verified {expired_at}" banner, CTA disabled, JSON-LD `Offer.availability → OutOfStock`, **retained price-history table rendered in full** (the citable evidence — a banner-only page is soft-404 bait), links to live same-category deals. Removed from the active sitemap on expiry.

**`gone` (410) is a real state, not a valve:** rows expired >12 months with zero impressions are batch-marked `gone` by scheduled policy (Step A hit with `status='gone'` → HTTP 410). The guarantee, restated precisely: **no URL we ever emitted 404s unexpectedly; retirement is 410 by policy.**

### 6. Sitemap & robots (rewritten — v1 had four false premises)

What v1 got wrong, verified: Next 14 `generateSitemaps()` emits only shard files and **no `<sitemapindex>`** (and `/sitemap.xml` stops existing); metadata routes are **build-time frozen** without route-segment config; PostgREST `max-rows` (default 1000) silently truncates any 10k `.range()` window; and Google's hreflang-in-sitemap method requires a `<url>` per locale variant — the opposite of v1's "documented pattern" claim.

The v2 design:
- **`src/app/sitemap-index.xml/route.ts`** (new deliverable): emits `<sitemapindex>` over the shard set from a live count; `robots.ts`'s `Sitemap:` line points here; this is the URL submitted to GSC.
- **Hreflang method: on-page only.** Deal pages already emit the full 13-locale cluster + x-default; the sitemap lists **all 13 locale URLs as plain `<url>` entries with no `alternates`** (Google: don't mix methods). No sitemap-level hreflang anywhere.
- **Sharding on an immutable key:** shard by `public_id` hex prefix (2 chars → 256 shards via `generateSitemaps()`). Membership is stable (frozen key, no OFFSET reshuffling between Google's fetches), each query is `WHERE status='active' AND public_id >= '{xx}' AND public_id < '{succ}'`, served by a partial index. Byte math: ~150 B/plain entry; at 500k active × 13 locales / 256 ≈ 25k entries ≈ 3.8 MB/shard — inside Netlify's ~6 MB response cap and the 50k-entry protocol limit. Growth rule: move to 3-hex prefixes (4096 shards) before active × 13 / 256 approaches 50k.
- **PostgREST pagination:** every shard fetch pages internally in ≤1000-row `.range()` windows (the A2 max-rows probe stays, but correctness no longer depends on the server setting).
- **Freshness:** `export const revalidate = 3600` on `sitemap.ts` and the index route (metadata routes freeze at build otherwise — the live 143-entry sitemap is this exact failure). `lastmod = content_changed_at`; **the bump lives in the trigger** (`BEFORE UPDATE: IF ROW(NEW.product_name, NEW.brand, NEW.sale_price, NEW.original_price, NEW.discount_percent) IS DISTINCT FROM ROW(OLD.…) THEN now() ELSE OLD.content_changed_at`), force-overwriting writer values — writers are blind bulk upserters and cannot know what changed (v1 assigned them an impossible job; also v1's criterion named an `availability` column that doesn't exist). Phase B backfills `content_changed_at := last_updated`.
- **Fail loudly:** an empty deal query in the sitemap throws — no more swallowed `console.error` degrading to 15 static entries.
- Host: `NEXT_PUBLIC_APP_URL=https://dealradar.me` pinned in Netlify and as the code fallback; `public/robots.txt` → `src/app/robots.ts` deriving the Sitemap line from it; AI-bot Allow groups + `Disallow: /api/` preserved verbatim (R-GEO-3).

### 7. Crawl paths (new section — v1 left discovery sitemap-only)

The only internal route to deal pages today is a cookie-gated, force-dynamic, unpaginated 48-item hub — and Googlebot sends no cookies, so it sees one country's top-48 per category and nothing else. Minimum crawl-path work, in scope:
- **Category pagination:** crawlable `?page=N` with self-canonical per page.
- **Crawler-default country:** cookieless requests resolve to a stable per-locale default country (no geo-adaptive content on canonical URLs — a pattern Google explicitly warns about).
- **Related-deals block on live deal pages** (v1 gave same-category links only to the expired state).
- Category pages gain `generateMetadata` canonical + hreflang; `/search` gets meta `noindex` and stays out of the sitemap.

---

## Tech stack

Next.js 14.2 App Router · next-intl 3 (`localePrefix:'always'`, 13 locales) · Supabase (Postgres + PostgREST; `unaccent` into the `extensions` schema) · Netlify (`@netlify/plugin-nextjs`) · Vitest. No new npm dependencies.

## Commands

```
Build:      pnpm build            (also the empty-env mock build)
Typecheck:  pnpm typecheck
Test:       pnpm test
Lint:       pnpm lint
i18n gate:  node scripts/check-i18n.mjs
Smoke:      node scripts/smoke-spine.mjs        (extended; needs a live BASE_URL — runs against deploy previews)
Schema:     pnpm db:migrate
CI:         .github/workflows/ci.yml (NEW — typecheck + vitest + check-i18n on PR; smoke-spine on deploy preview)
```

(v1's "green in CI" referenced a CI that didn't exist — the repo's workflows are three cron jobs and Netlify builds with bare `pnpm build`. The CI workflow is now a deliverable.)

## Project structure (files touched)

```
supabase/schema.sql                          → columns, deal_slug_base(), mint triggers (B),
                                               authoritative trigger (D), indexes, expiry cron, 'gone' policy
src/lib/db/deals.repo.ts                     → getDealByPublicId; status filters; slug composition deleted
                                               from toRow() AND fromRow() fallback (v1 missed fromRow)
src/lib/providers/*.ts                       → country folded into product_id (D3)
src/lib/utils/deal-path.ts        (new)      → dealHref / absoluteDealUrl / parseDealSlug
src/app/[locale]/deal/[slug]/page.tsx        → resolver ladder, OG/twitter, JSON-LD fixes, expired/gone states,
                                               related-deals block
src/app/sitemap.ts                           → 256 hex-prefix shards, revalidate, paged fetch, all-13-locale entries
src/app/sitemap-index.xml/route.ts (new)     → <sitemapindex>
src/app/robots.ts                 (new)      → replaces public/robots.txt, host-aware
src/app/[locale]/category/[slug]/page.tsx    → generateMetadata, pagination, crawler-default country
src/app/[locale]/search/page.tsx             → noindex
src/components/deals/DealCard.tsx            → next-intl Link + dealHref (slug stamped server-side in mock path —
                                               DealCard is 'use client'; Node crypto is unavailable there)
src/lib/providers/registry.ts / mock read path → stamps deal.slug for empty-env dev via the shared helper
scripts/ingest-awin.cjs                      → slug composition deleted; country-scoped ids; run-id watermark
scripts/smoke-spine.mjs                      → phase-aware extended assertions
.github/workflows/ci.yml          (new)      → typecheck + vitest + check-i18n; smoke on preview
.github/workflows/ingest-awin.yml            → failure alerting + keepalive
src/middleware.ts                            → prefer req.geo?.country before header fallbacks (E-phase cleanup)
src/messages/*.json (13)                     → expired-banner strings
```

## Testing strategy

- **Snapshot parity (SQL is the authority):** a script runs `deal_slug_base()` over fixture inputs (incl. `100% Pure`, `L'Oréal`, `Weißwein`, `Søstrene`, truncation boundaries) and emits a JSON snapshot; vitest compares TS-visible behavior against the snapshot. No live TS mirror of the pipeline.
- **Unit:** `parseDealSlug` (rejects `nikon-d5300`, accepts exactly 12 hex, case-folds); DealCard href contains **exactly one** locale segment; md5-12 TS helper ↔ SQL parity; mock href → mock resolver → 200 round-trip.
- **Phase-aware smoke (`smoke-spine.mjs`):** pre-flip: old-format URL → **200 self-canonical, no redirect**; post-flip: legacy → 308 → 200 one hop, stale-slug → 308 → 200, bogus id/slug → 404, expired → 200 + OutOfStock, gone → 410; **sitemap count parity** — |emitted URLs| ≈ active count × 13, expired absent.
- **One-hop criteria carry a staleness qualifier:** "within one cache window of the change" — app deploys auto-purge (Netlify atomic invalidation + deploy-scoped route-cache blobs), but **DB-only changes between deploys** (the Phase D flip) leave cached responses up to TTL; Phase D therefore sequences UPDATE → immediate deploy (or `purgeCache()` API — the UI "clear cache" button only clears build cache).
- **Post-deploy:** curl matrix asserting status + `Cache-Status` headers on 308s; sitemap freshness (a post-deploy DB insert appears in a shard after TTL); Rich Results Test 0 errors (SC5); crawl-budget measurement; GSC sitemap-index submission.

## Boundaries

- **Always:** typecheck + vitest + smoke before commits · slug charset `[a-z0-9-]` · unknown URL → real HTTP 404/410 via `generateMetadata` (R-RTE-1) · `rel="noopener noreferrer nofollow sponsored"` on affiliate CTAs · JSON-LD + visible proof fields intact · compose deal paths only via `deal-path.ts`.
- **Ask first:** prod schema migrations · enabling the expiry cron or the `gone` policy · host/robots changes · GSC actions · raising PostgREST `max-rows` · the admin `app.slug_rebase` escape hatch.
- **Never:** DELETE rows from `deals` (CI grep guard) · writers sending `status`, `expired_at`, or `content_changed_at` · recompute `slug_base` outside the GUC hatch · drop `deals_slug_idx`/NOT NULL · reintroduce a modal-only deal view or a streaming `loading.tsx` that commits 200 before `notFound()` · change TS `slugify()` semantics (dedup keys) · blanket-redirect expired deals · declare `deal_slug_base` IMMUTABLE (STABLE only — `unaccent` is dictionary-dependent; if an expression index is ever wanted, use a deliberately-IMMUTABLE two-arg wrapper + REINDEX-on-upgrade note).

## Success criteria (testable)

1. Every deal card click lands on `^/(en|de|fr|es|it|pl|nl|pt|sv|ro|da|fi|no)/deal/[a-z0-9-]+-d[0-9a-f]{12}$` — one locale segment, no uppercase, no provider names.
2. Renaming a product upstream changes the page's H1 on next refresh; **the URL does not change and no redirect occurs** (frozen slug). Truncated/mistyped/case-variant URLs 308 once to canonical, within one cache window.
3. Every URL ever emitted in a sitemap resolves 200 (active/expired) or 410 (gone by policy) — never 404. Pre-flip old-format URLs: 200 without redirect; post-flip: 308 → 200 in one hop.
4. Sitemap-index + shards: count parity with the DB active set (×13 locales), expired/gone absent, `lastmod` moves only when content changes across two consecutive refresh cycles, and a post-deploy insert appears within one revalidate window without a redeploy.
5. Rich Results Test: 0 errors on a live deal page (closes SC5) — including `priceValidUntil` and `Product.url`.
6. Composition-site gate: `grep -rnE "slugify\([^)]*[Nn]ame\)" src scripts` returns only the allowlist (registry dedupe key + mock-parity helper). Verified in the new CI workflow on PR.
7. Mock/dev URLs match the prod **format regex** (mock product ids never exist in prod; byte-identity was vacuous).
8. Listings/brand menus never show expired deals; an expired deal's page still renders its full price history.

## Pre-flight items (Phase A2 — read-only, before Phase B)

1. PostgREST `max-rows` value (correctness no longer depends on it, but the probe documents the environment).
2. Mixed-case slug census (does Step B's `lower()` rung ever fire?).
3. Collision scan: legacy slugs matching `-d[0-9a-f]{12}$` (expected ≈0).
4. **Country-flap census:** count `product_id`s written by >1 country in the last 7 days (sizes the D3 re-key dup-window).
5. Geo header verification: does the Netlify runtime populate `x-nf-country` or only `req.geo`? (Suspected silent DE-default for all visitors — pre-existing bug, E-phase fix.)

## Out of scope

- ISR/layout refactor to make deal pages statically cacheable (D5 follow-up, revisit when crawl volume justifies).
- Strackr/Tradedoubler upstream identity instability — **pre-launch blocker for those providers**, not fixed by this layer.
- Cross-provider EAN duplicate consolidation (same product, two providers → two URLs; query-time dedupe hides most of it).
