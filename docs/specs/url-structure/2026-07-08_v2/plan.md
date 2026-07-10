# Plan: deal URL & slug structure migration — v2

**Spec (canonical):** `docs/specs/url-structure/2026-07-08_v2/spec.md` — read it first; this plan is sequencing only.
**Status:** Spec v2 APPROVED 2026-07-08 (all 5 decisions locked: scheme, brand prefix, country-in-identity, freeze-after-mint, dynamic rendering). v1 plan superseded after adversarial review — the v1 sequencing **bricked every URL in the Phase C window** (see red-team register, finding 1). Phase B is unblocked once A2 pre-flights run.
**Nothing is implemented yet.** The working tree contains only planning documents.

## Shape of the migration

Five phases. B and C are backward-compatible by construction; D is the point of no return (slug rewrite). The key v2 sequencing changes vs v1: **mint triggers move to Phase B** (so rows created during the window self-mint `public_id`/`legacy_slug`), the resolver gets a **live-slug rung** (so old-format URLs serve 200 — not a self-308 loop — before the flip), Phase D starts with a **delta backfill + zero-NULL gate**, and Phase C **holds in prod ≥1 week** before D.

```
A. Decisions ✔ + pre-flight probes          (read-only)
B. Schema, additive + MINT TRIGGERS         (DB migration; old app unaffected)
C. App: dual resolution + re-key + sitemap  (app deploy; hold ≥1 week)
D. Delta backfill → trigger flip → slug     (DB + immediate deploy/purge)
   rewrite → writer cleanup → expiry cron
E. Verification, GSC, monitoring            (no code)
```

**Rollback floor:** before D, any build rolls back cleanly. After D, full URL compatibility requires the C build or newer — a pre-C build keeps on-site navigation working (it reads `row.slug` directly) but 404s previously-published old-format URLs. This is why C holds a week: it flushes confidence before the irreversible step.

## Phase A — decisions & pre-flight

- ✔ All 5 design decisions locked (see spec header table).
- A2 probes (read-only): PostgREST `max-rows`; mixed-case slug census; `-d[0-9a-f]{12}$` legacy-collision scan; **country-flap census** (product_ids written by >1 country in 7 days — sizes the re-key dup-window); Netlify geo header reality (`x-nf-country` vs `req.geo`).

## Phase B — additive schema + mint triggers (old app unaffected)

- `CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions`.
- Columns: `public_id`, `legacy_slug`, `slug_base`, `status` (CHECK active|expired|gone), `expired_at`, `content_changed_at`.
- `deal_slug_base(brand, name)` — **STABLE**, schema-qualified `extensions.unaccent`, wildcard-free brand predicate in slug space.
- **Mint triggers (moved from D — this is what makes the window safe):** BEFORE INSERT sets `public_id := coalesce(NEW.public_id, substr(md5(product_id),1,12))` with salted retry on unique conflict, and `legacy_slug := coalesce(NEW.legacy_slug, NEW.slug)`. BEFORE UPDATE freezes NULL-safely (`COALESCE(OLD.public_id, …)`).
- Backfill: `public_id`, `legacy_slug = slug` (byte-frozen), `slug_base`, **`content_changed_at := last_updated`** (v1 omitted this — NULL sorts first and breaks shard ordering).
- Indexes: UNIQUE `public_id`; `legacy_slug` exact + `lower()`; partial `WHERE status='active'` variants for the sitemap range query AND the hot listing paths.
- **Checkpoint:** zero NULL public_id/legacy_slug; old app serves traffic unchanged; insert a row via the old writer → mint trigger stamps it.

## Phase C — app deploy: dual resolution + re-key + sitemap (hold ≥1 week)

Internal order: C1 (helper) first; C2/C4 depend on it; the rest parallel-safe.

- C1 `deal-path.ts`: `dealHref(slug)` (locale-less, for next-intl Link) / `absoluteDealUrl(locale, slug)` (metadata/JSON-LD/sitemap/og:url) / `parseDealSlug`. **One helper cannot serve both** — v1's single signature double-prefixed the locale via next-intl Link (404 on every card).
- C2 Resolver ladder **with the live-slug rung** (exact `.eq(slug, raw)` → 200 before any legacy/308 logic — this is the blocker fix), `getDealByPublicId`, 308 via `next/navigation` `permanentRedirect` in `generateMetadata`. No `revalidate` (dynamic route — layout `cookies()`).
- C3 Expired/gone rendering: banner + disabled CTA + **full price-history table** (non-thin) + related-deals block on live AND expired pages; `gone` → 410. Strings ×13 locales.
- C4 DealCard → next-intl Link + `dealHref`; mock-path slug stamped **server-side** (DealCard is `'use client'` — no Node crypto there).
- C5 Sitemap rewrite: 256 hex-prefix shards on `public_id` (immutable membership), ≤1000-row paged fetches, all-13-locale plain entries (no sitemap alternates — on-page hreflang is the single method), `revalidate=3600`, fail-loud; **`sitemap-index.xml/route.ts`** (Next 14 generates no index natively).
- C6 `robots.ts` (host-derived Sitemap → the index), kill `dealradar.eu` fallbacks.
- C7 Category: canonical/hreflang metadata, crawlable `?page=N` pagination, stable crawler-default country (Googlebot is cookieless); `/search` meta-noindex.
- C8 Provider re-key (D3 decision): `{provider}:{COUNTRY}:{id}` at every boundary incl. ingest. Old rows coexist → age out via expiry; dup-window sized by A2 census.
- C9 Read-path `status='active'` filters: `queryDeals`, `distinct_brands` RPC, search (no-ops until D3 cron, correct forever after).
- C10 OG/twitter metadata + JSON-LD fixes (Product.url, single Offer + priceValidUntil, BreadcrumbList).
- C11 CI workflow (typecheck+vitest+check-i18n on PR; smoke on preview) + phase-aware smoke-spine.
- **Checkpoint (deploy preview):** old-format URL sampled from prod DB → **200 self-canonical, NO redirect**; new-format URL of a fresh row → 200; bogus → 404; sitemap-index + shards resolve with count parity; DealCard href has exactly one locale segment. Then hold in prod ≥1 week.

## Phase D — the flip (DB + immediate deploy)

Order matters: 1) **delta backfill** (`WHERE public_id IS NULL OR legacy_slug IS NULL`) + **gate: count = 0**; 2) authoritative trigger (always compose `slug`, freeze `slug_base` after mint, `content_changed_at` OLD/NEW row comparison force-overwriting writers, **re-activation predicate `NEW.last_updated IS DISTINCT FROM OLD.last_updated`** — the cron and historical-lows RPC never touch `last_updated`, writers always do); 3) one-time slug rewrite UPDATE; 4) **immediately deploy (auto-purges) or `purgeCache()`** — DB-only changes don't invalidate Netlify's cache; 5) writer cleanup: `toRow()`, **`fromRow()` fallback (v1 missed it)**, `ingest-awin.cjs`, stray DealCard fallback; 6) expiry cron — **set-difference vs last successful ingest run** for feed sources, ≥72h floor otherwise, >10% tripwire, skip-if-last-run-failed + failure alerting + workflow keepalive (ASK FIRST before enabling in prod).
- **Checkpoint (staging):** rename → H1 changes, URL unchanged, no redirect; cron-expire → historical-lows RPC runs → still expired → re-upsert → active; ingest batch with a forced public_id collision → salted retry, batch completes.

## Phase E — verification & monitoring

- Curl matrix on the deployed host: statuses + `Cache-Status` headers on 308s; one-hop assertions qualified "within one cache window".
- Sitemap freshness: post-deploy DB insert appears in a shard after TTL without redeploy.
- Rich Results Test 0 errors (SC5); GSC: submit the **sitemap-index URL**; watch coverage 7 days.
- Crawl-load budget: measure Supabase QPS + function invocations for a simulated full-sitemap crawl (D5 acceptance).
- Middleware geo fix/verify (`req.geo?.country` first); CI grep guards (no `DELETE FROM deals`, composition-site allowlist grep `slugify\([^)]*[Nn]ame\)`).

## Risks (accepted, eyes-open)

| Risk | Mitigation |
|---|---|
| md5-12 collision (1.8×10⁻⁵ @100k rows) | In-trigger salted re-derive; ingest never aborts; mint logged |
| Two missed ingest runs | Set-difference expiry skips on failed runs + 10% tripwire + alerting + keepalive |
| D-flip cache staleness | UPDATE → immediate deploy/purge; smoke warms before asserting |
| Re-key dup-window (D3) | Old rows expire out; sized by A2 census; listings filter active |
| Dynamic rendering crawl cost | Phase E budget measurement; ISR refactor is the documented follow-up |
