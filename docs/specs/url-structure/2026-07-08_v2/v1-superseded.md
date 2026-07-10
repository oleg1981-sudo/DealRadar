# Spec: SEO/AEO/GEO-optimized deal URL & slug structure

**Version:** 2026-07-08_v1 · **Status:** SUPERSEDED by [spec.md](spec.md) after adversarial review (25 accepted findings — see [red-team register](redteam-register.md)). The URL scheme and brand-prefix decisions survive; the migration sequencing, expiry triggers, sitemap section, and slug-drift policy do not. Do not implement from this document.
**Traces:** FR-RTE-1/2, FR-GEO-1..4, R-RTE-1/2, R-GEO-4/5, R-ING-4, GAP-1, P0-1, P1-4, SC2, SC5
**Evidence base:** live production probe of dealradar.me (2026-07-08), 4-agent codebase sweep, web research with verified competitor redirect tests (hotukdeals/dealabs 301 behavior confirmed by curl 2026-07-08).

---

## Objective

Give every deal a **unique, permanent, human-readable URL** that search engines can rank, answer engines can cite, and users can share — and make that URL survive product renames, provider churn, and deal expiry without ever 404ing.

**Why now (verified live):** production (dealradar.me) has **zero product URLs** — cards open a modal, the sitemap holds only 13 homepages + 130 category pages, and `/en/deal/*` 404s. Google has never indexed a DealRadar product URL. The branch (`feat/tier1-remediation-2026-06-28`) ships SSR deal pages, but with a slug scheme that would bake three defects into the index on day one:

1. **Unstable URLs** — `toRow()` ([deals.repo.ts:19](../../src/lib/db/deals.repo.ts)) regenerates `slug` from the live product name on every upsert (`onConflict: 'product_id'`, line 60); a provider rename silently moves the page. No redirect infrastructure exists anywhere (grep-verified).
2. **Provider-ID noise** — slugs end in `-kelkoo-12345` / `-awin-24290598113`: leaks internals, wastes the keyword window, and the `/gi` sanitizer preserves uppercase → mixed-case slugs that diverge from the (lowercasing) SQL backstop trigger and break the case-sensitive `.eq('slug', …)` lookup.
3. **Format quadruplication** — the slug formula is duplicated byte-for-byte in `deals.repo.ts`, `ingest-awin.cjs`, SQL `deal_slug()`, and `slug.ts`, and they already disagree on case.

**Success looks like:** a deal URL is minted once, never dies, always resolves in ≤1 redirect hop to exactly one canonical page per locale, and reads as `brand + product + model` — nothing else.

### ASSUMPTIONS I'M MAKING (correct now or I proceed with these)

1. **Canonical host is `https://dealradar.me`** — verified live (sitemap + robots point there). The `dealradar.eu` code fallback and the `dealradar.app` in the 2026-06-23 specs are both stale.
2. **There is no search index to protect** — verified live (no deal URLs exist in production). The legacy-slug redirect layer below is kept anyway (DB rows already carry old-format slugs; smoke-spine/SC2 gates reference them) because it costs one column + two indexes.
3. **One shared slug across all 13 locales** (no translated slugs). Product names are brand/model proper nouns; hreflang — not the path — declares locale equivalence. Google explicitly has no preference here.
4. **Category never enters the deal URL.** Verified industry practice (Slickdeals `/f/{id}-{slug}`, hotukdeals `/deals/{slug}-{id}`, dealabs, Geizhals `{slug}-a{id}.html` — all flat); deals cross/change categories, and hubs already exist at `/{locale}/category/{slug}`.
5. **Deal rows are never hard-deleted.** The commented-out purge cron stays dead permanently; expiry becomes a status, not a DELETE. This is what makes the zero-404 guarantee sound.
6. **Provider identity instability (Strackr title-fallback, Tradedoubler offer-id keying) is out of scope** — it mints new `product_id`s upstream of this layer. Flagged as a pre-launch blocker for those providers, not fixed here.

---

## The design

### 1. URL pattern

```
/{locale}/deal/{slug_base}-d{public_id}
e.g.  /de/deal/blazevideo-wildkamera-a252-64mp-solarpanel-d3f8a1c92b4e
```

- Route segment `[slug]` is **unchanged** — no netlify redirects, no new routes.
- `{locale}` = the 13 next-intl locales, prefix always (existing policy). Country never appears in the URL; category never appears in the URL; filters/sorts stay query params and stay out of the sitemap.
- The `-d[0-9a-f]{12}` suffix is the **routing key**; everything before it is cosmetic.

### 2. Identity: `public_id` (new column)

| Property | Rule |
|---|---|
| Value | `lower(substr(md5(product_id), 1, 12))` — 12 lowercase hex chars |
| Written by | `BEFORE INSERT` trigger: `coalesce(NEW.public_id, substr(md5(NEW.product_id),1,12))` |
| Mutability | **Frozen** by `BEFORE UPDATE` trigger (`NEW.public_id := OLD.public_id`) — a plain column, *not* GENERATED, so even a future `product_id`/PK rewrite cannot move URLs |
| Uniqueness | `UNIQUE INDEX deals_public_id_idx` |
| Collisions | ~10⁻⁷ at 100k rows; runbook: lengthen the colliding row's id to 16 hex manually. A unique-violation aborts a 500-row ingest batch — documented, acceptable |
| Why md5-derived | Deterministic: backfill, `ingest-awin.cjs`, and `smoke-spine.mjs` can compute it offline without a DB round-trip |

### 3. Slug: `slug_base` (cosmetic, drift-tolerant)

SQL function `deal_slug_base(brand text, product_name text)`, `IMMUTABLE`:

```
input    = CASE WHEN brand IS NOT NULL AND product_name NOT ILIKE brand || '%'
                THEN brand || ' ' || product_name ELSE product_name END   -- entity clarity for AEO
pipeline = unaccent → lower → regexp_replace('[^a-z0-9]+', '-', 'g') → trim '-'
         → truncate to ≤60 chars, cut back to last hyphen (never mid-word)
         → COALESCE(NULLIF(result, ''), 'deal')
```

- Charset strictly `[a-z0-9-]`. No provider prefix, no productId remnant, no shop, no price, no country.
- Recomputed **only when `product_name` or `brand` actually changed** (trigger compares OLD/NEW).
- Stored `slug` column = `slug_base || '-d' || public_id`, written **exclusively by the trigger**, which always overwrites writer-supplied values (deploy-order-proof). `slug` stays NOT NULL; the existing global unique index stays as a free trigger-bug tripwire.
- `toRow()` and `ingest-awin.cjs` **stop composing slugs entirely** — the quadruplication dies. TS `slugify()` survives only for the dedupe fallback key and mock mode (semantics unchanged — changing it would silently alter cross-merchant dedup).
- *Brand prefix: APPROVED by reviewer 2026-07-08.* Rationale: AWIN feed titles like "Bundle Wildkamera … | A252" (seen live) bury the brand; `brand` is a populated column; answer engines cite entities.

### 4. Resolution & canonicalization (the zero-404 ladder)

One React-`cache()`d resolver shared by `generateMetadata` + page render (`notFound()` still thrown in `generateMetadata` — preserves the R-RTE-1 real-HTTP-404 gate):

```
Step A — match /^(.*)-d([0-9a-f]{12})$/i on the segment:
    hit → getDealByPublicId(lower(id))
        found, segment === stored slug  → 200, per-locale self-canonical
        found, segment differs          → permanentRedirect() → 308 to /{locale}/deal/{row.slug}
                                          (rename drift, truncation, case variants — always ONE hop)
        id unknown                      → fall through to Step B
Step B — legacy (kept forever):
    exact .eq(legacy_slug, raw), then lower() variant with .limit(1) + log
        hit → 308 to current canonical
Step C — notFound() → real HTTP 404
```

- `legacy_slug` = new column, byte-frozen copy of every pre-migration slug (mixed case preserved), written once at migration, trigger-immutable, indexed exact + `lower()`.
- Because Step A self-heals drift, **no slug-history table is ever needed** post-migration.
- `export const revalidate = 3600` on the deal route so Netlify can't pin a stale 308 or expired-state page indefinitely.
- All **6** URL construction sites (sitemap `<loc>` + alternates, page canonical + hreflang + JSON-LD offer url, DealCard) route through one `buildDealPath(locale, slug)` helper. DealCard switches to the next-intl `Link` (today it manually prefixes locale with plain `next/link`); its mock-mode fallback computes the same md5-12 in TS so dev URLs match prod byte-for-byte.

### 5. Expired deals (status, not deletion)

- Schema: `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired'))` + `expired_at timestamptz` + partial index `(last_updated DESC) WHERE status='active'`.
- pg_cron marks `expired` where `active AND last_updated < now() - interval '48 hours'` (aligned to 15-min refresh + nightly ingest). Any later upsert re-activates.
- Expired page = **HTTP 200 forever** (Slickdeals/Pepper model; Google guidance: never blanket-redirect → soft-404): localized "Deal expired — last verified {expired_at}" banner, CTA disabled, JSON-LD `availability` → `OutOfStock`, 90-day-low proof line dropped, links to live same-category deals. Removed from sitemap on expiry.
- Optional valve, **off by default**: batch-410 rows expired >12 months with zero impressions.

### 6. Sitemap & robots

- `generateSitemaps()` sharding at 10k URLs/shard under an index — replaces the single-file, **unordered 5000-row cap** (which today silently samples an arbitrary subset).
- Query: `status='active'`, `ORDER BY content_changed_at DESC` (deterministic, freshness-biased membership).
- `lastmod` = new `content_changed_at` column — bumped by writers **only on price/name/availability change**, never by no-op refresh touches. (`last_updated` bumps every 15 min; Google demonstrably distrusts inflated lastmod site-wide. `changefreq`/`priority` are ignored by Google — stop tuning them.)
- One entry per logical page, 13 `alternates.languages` + `x-default`; `<loc>` = default-locale variant (consistent with per-locale self-canonicals via the hreflang cluster — this is the documented Google pattern, keep it).
- Host: pin `NEXT_PUBLIC_APP_URL=https://dealradar.me` in Netlify **and** in the code fallback; make robots' `Sitemap:` line derive from it (convert `public/robots.txt` → `src/app/robots.ts`). AI-bot Allow groups (OAI-SearchBot, PerplexityBot, Google-Extended) and `Disallow: /api/` preserved verbatim (R-GEO-3).
- Adjacent fix (in scope — the sitemap advertises these pages): category pages gain `generateMetadata` with canonical + hreflang; today they emit **none**. `/search` gets an explicit `noindex` policy and stays out of the sitemap.

---

## Tech stack

Next.js 14.2 App Router · next-intl 3 (`localePrefix: 'always'`, 13 locales) · Supabase (Postgres + PostgREST) · Netlify (`@netlify/plugin-nextjs`) · Vitest. No new dependencies except the `unaccent` Postgres extension.

## Commands

```
Build:      pnpm build          (also verify empty-env mock build)
Typecheck:  pnpm typecheck
Test:       pnpm test           (vitest run — slug/crypto/affiliate/dedup suites)
Lint:       pnpm lint
i18n gate:  node scripts/check-i18n.mjs
Smoke:      node scripts/smoke-spine.mjs   (extended by this spec — see Testing)
Schema:     pnpm db:migrate     (scripts/apply-schema.mjs)
```

## Project structure (files this spec touches)

```
supabase/schema.sql                          → public_id, legacy_slug, slug_base, status,
                                               expired_at, content_changed_at; deal_slug_base();
                                               rewritten authoritative trigger; new indexes
src/lib/db/deals.repo.ts                     → getDealByPublicId, resolver support; DELETE slug
                                               composition from toRow()
src/lib/utils/deal-path.ts        (new)      → buildDealPath(), parseDealSlug(), md5-12 helper
src/app/[locale]/deal/[slug]/page.tsx        → resolver ladder, 308s, revalidate, expired state
src/app/sitemap.ts                           → generateSitemaps() sharding, active-only, lastmod
src/app/robots.ts                 (new)      → replaces public/robots.txt, host-aware
src/app/[locale]/category/[slug]/page.tsx    → generateMetadata (canonical + hreflang)
src/components/deals/DealCard.tsx            → next-intl Link, buildDealPath, mock parity
scripts/ingest-awin.cjs                      → DELETE slug composition; content_changed_at logic
scripts/smoke-spine.mjs                      → extended assertions (see Testing)
src/messages/*.json (13 files)               → expired-banner strings
```

## Code style (one snippet, the pattern everything follows)

```ts
// src/lib/utils/deal-path.ts
const DEAL_SEGMENT = /^(.*)-d([0-9a-f]{12})$/i;

/** The ONLY place a deal path is composed. All 6 former construction sites import this. */
export function buildDealPath(locale: Locale, slug: string): string {
  return `/${locale}/deal/${slug}`;
}

/** Split a URL segment into cosmetic base + routing key; null → legacy/unknown format. */
export function parseDealSlug(segment: string): { base: string; publicId: string } | null {
  const m = DEAL_SEGMENT.exec(segment);
  return m ? { base: m[1], publicId: m[2].toLowerCase() } : null;
}
```

## Testing strategy

- **Unit (vitest, colocated `*.test.ts`):** `parseDealSlug` (incl. the `nikon-d5300` false-positive class — fixed 12-hex must NOT match), `deal_slug_base` TS mirror ↔ SQL parity fixtures, md5-12 helper ↔ SQL `substr(md5(),1,12)` parity, truncation-at-hyphen edge cases, brand-prefix dedup cases.
- **Smoke (`scripts/smoke-spine.mjs`, extended):** new URL → 200 · legacy URL → 308 → 200 in one hop · stale-slug URL (`wrong-base-d{validId}`) → 308 → 200 · bogus id → 404 · bogus legacy slug → 404 · expired deal → 200 + `OutOfStock` in JSON-LD · sitemap sample URLs → 100% resolve 200.
- **Post-deploy (manual, gated):** curl the 308s against the deployed Netlify build (ODB cache behavior is unverified — schedule a cache purge with the release); Google Rich Results Test 0 errors (SC5 — still owed from the last remediation); GSC sitemap-index resubmission.
- **Regression gates that stay green:** `tsc --noEmit`, `next build` (incl. empty-env), vitest suites, `check-i18n.mjs`, smoke-spine.

## Boundaries

- **Always:** run typecheck + vitest + smoke-spine before commits · keep slug charset `[a-z0-9-]` · keep unknown-URL → real HTTP 404 via `generateMetadata` `notFound()` (R-RTE-1 is REGRESSION-class) · keep `rel="noopener noreferrer nofollow sponsored"` on affiliate CTAs · keep JSON-LD Product+AggregateOffer fields and visible proof text intact · route every deal-path composition through `buildDealPath()`.
- **Ask first:** applying schema migrations to the production Supabase project · enabling the pg_cron expiry job · changing `NEXT_PUBLIC_APP_URL`/robots host · GSC actions · enabling the 410 valve · anything touching the affiliate subID decoration.
- **Never:** DELETE rows from `deals` (the purge cron stays dead — add a CI grep) · drop `deals_slug_idx` or the NOT NULL · reintroduce a modal-only deal view or a streaming `loading.tsx` that commits 200 before `notFound()` · change TS `slugify()` semantics (dedup keys depend on it) · blanket-redirect expired deals to home/category.

## Success criteria (testable)

1. Every deal card click lands on a URL matching `^/(en|de|fr|es|it|pl|nl|pt|sv|ro|da|fi|no)/deal/[a-z0-9-]+-d[0-9a-f]{12}$` — no uppercase, no provider names, ≤~75 chars of slug.
2. Renaming a product upstream changes the page's H1 on next refresh **without changing what URL serves 200**; the old URL 308s to the new one in exactly one hop.
3. Every pre-migration slug (sampled from prod DB) returns 308 → 200; zero 404s for any URL ever emitted in a sitemap.
4. Sitemap: 100% of sampled entries resolve 200; expired deals absent; `lastmod` changes only when content changes across two consecutive refresh cycles.
5. Rich Results Test: 0 errors on a live deal page (closes SC5).
6. `smoke-spine.mjs` extended suite green in CI; `grep -rn "slugify(d.productName)" src scripts` returns zero slug-composition hits outside the dedupe key.
7. Same physical deal, dev-mock vs prod: byte-identical URL path.

## Open questions (answer before Phase 4; none block Phase 2/3 planning)

1. ~~**Brand prefix in `slug_base`**~~ — **RESOLVED: yes, prepend brand** (reviewer, 2026-07-08).
2. **PostgREST `max-rows`** — could silently cap `getAllDealSlugs` at 1000 regardless of `.limit(5000)`. One prod query to check; sharding fixes it regardless, but confirms current sitemap truth.
3. **48h expiry window** — right threshold for feeds that refresh nightly? (AWIN nightly + 15-min API refresh suggests 48h is safe; 24h risks flapping.)
4. **`/search` noindex** — explicit `noindex` meta vs robots Disallow? (Recommended: meta noindex; robots-blocking prevents Google from *seeing* the noindex.)
5. **Mixed-case slugs in prod DB** — do any exist (uppercase AWIN ids)? Determines whether Step B's `lower()` fallback ever fires in practice. One query.

## Out of scope (stated so the URL layer isn't mistaken for a fix)

- Strackr/Tradedoubler upstream identity instability (title/offer-id fallback → new `public_id` per rename). Fix provider identity or EAN-based consolidation **before** those providers go live.
- Cross-provider duplicate consolidation (same EAN, two providers → two rows → two URLs today). The query-time dedupe hides most of it; a canonical-product layer is a future spec.
- The `country` column last-write-wins flap across the 16-market refresh fan-out. A future country-in-identity PK migration is survivable precisely because `public_id` is frozen, not derived-on-read.
