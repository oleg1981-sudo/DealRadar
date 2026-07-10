# URL/slug redesign spec — RECONSTRUCTION (lossy)

> **RECOVERED/RECONSTRUCTED — 2026-07-09.** The canonical package `docs/specs/url-structure/2026-07-08_v2/` (entry point `HANDOFF.md`, with provenance, verified repo-reality notes, the top implementation traps, and a 49→25-finding adversarial red-team register) and its v1 predecessor `docs/specs/2026-07-08_url-slug-structure_v1.md` were destroyed by a working-tree replacement and had never been committed. This file reconstructs the spec's **decisions and acceptance criteria** from three surviving sources. It does NOT recover the red-team register or trap list — do not treat this as the full spec.

**Sources:** (1) auto-memory note `dealradar-url-slug-spec` written 2026-07-08; (2) the recovered task breakdown [`tasks-todo.md`](tasks-todo.md) (verbatim); (3) the acceptance criteria embedded into `docs/ground_source_of_truth/2026-07-08_v3/` (A-19, FR-SEO-1/4/5/6/7/9/11, DSN-SEO-1/4/5/6/7, T-SEO-6).

## Status at loss

Specced, **human-approved** (A1 ticked 2026-07-08: scheme approved, brand prefix approved; 48h expiry window and `/search` noindex proceeding on spec defaults), adversarially red-teamed (49 findings → 25 verified), **nothing implemented** (next action was A2 pre-flight probes, then B1 schema migration).

## Locked decisions (do NOT re-litigate without the red-team register)

1. **URL scheme:** `/{locale}/deal/{slug_base}-d{12hex}` — matching `^/{locale}/deal/[a-z0-9-]+-d[0-9a-f]{12}$`. `public_id` = first 12 hex chars of `md5(product_id)` (TS helper must byte-match SQL `substr(md5(...),1,12)`).
2. **Country-in-identity** (the deal's country is part of its identity/routing semantics).
3. **Freeze-after-mint:** `public_id` and `legacy_slug` are frozen at mint; `slug_base` recomputes only on name/brand change; the DB trigger — not writers — composes and overwrites `slug`.
4. **Dynamic rendering** for deal pages (with `revalidate = 3600` in the resolver step).
5. **Resolver ladder:** Step A `publicId` → 200 | one-hop **308** | fall-through; Step B legacy slug exact-then-`lower()` → 308; Step C `notFound()` in `generateMetadata`. `parseDealSlug` must reject natural `-d` product names like `nikon-d5300` (requires exactly 12 hex after `-d`), and case-fold the id.
6. **Expired-state:** expired deals stay **200** with a localized banner + `expired_at`, CTA disabled, JSON-LD `availability=OutOfStock`, the 90-day-low line dropped, same-category alternative links. Expiry marked by cron at **48h** staleness (⛔ ASK FIRST before enabling in prod); upsert re-activates. **Never `DELETE FROM deals`** (CI grep guard).
7. **Schema additions (B1, additive first):** `unaccent` enabled; `public_id`/`legacy_slug`/`slug_base`/`status`/`expired_at`/`content_changed_at`; `deal_slug_base()`; backfill (`public_id` = md5-12, `legacy_slug` = frozen slug bytes); UNIQUE `deals_public_id_idx`, legacy exact & `lower()` indexes, partial active index.
8. **Sitemap:** `generateSitemaps()` sharded @10k/shard, active-only, `ORDER BY content_changed_at DESC`, `lastmod = content_changed_at` (fallback `last_updated`), `changefreq`/`priority` removed from deal entries; must paginate past the PostgREST 1000-row cap.
9. **robots:** `src/app/robots.ts` replaces `public/robots.txt`; `Sitemap:` line derives from `NEXT_PUBLIC_APP_URL` (= `https://dealradar.me`); explicit AI-bot Allow groups (OAI-SearchBot, PerplexityBot, Google-Extended) + `Disallow: /api/` preserved; `dealradar.eu` fallback purged everywhere `BASE_URL` is derived.
10. **Category pages:** `generateMetadata` canonical + 13 hreflang + `x-default`. **`/search`:** `noindex` meta, excluded from sitemap.
11. **Writers stop composing slugs** (D2): `toRow()` and `ingest-awin.cjs` send no slug; both bump `content_changed_at` only on price/name/availability change.
12. **Verification spine:** `scripts/smoke-spine.mjs` asserts new→200, legacy→308→200 (one hop), stale→308→200, bogus id→404, bogus slug→404, expired→200+OutOfStock, sitemap sample all-200; E1 curl matrix runs against `dealradar.me` (not previews) + Netlify cache purge; E2 = RRT 0 errors + GSC sitemap submit + 7-day coverage watch.

## Known-lost content

- The **25 verified red-team findings** and their rationale (49 raw → 25 verified).
- The **top implementation traps** list from HANDOFF.md.
- The full v2 spec prose (provenance, repo-reality notes, alternatives considered).
- `tasks/plan.md` (the implementation plan document).

**Consequence:** implementers get the *what* from this reconstruction but not the *why-not-otherwise*. If Time Machine / another machine / editor local-history has `docs/specs/url-structure/2026-07-08_v2/`, restore it and commit it — it supersedes this file.
