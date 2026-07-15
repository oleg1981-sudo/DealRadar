# Spec: PDP JSON-LD schema remediation (SEO / AEO / GEO)

**Source audit (canonical rationale):** `audit/2026-07-15_jsonld-schema/` (findings.md + audit-plan.md, Pass-2 enriched with July-2026 Google docs, AI-engine evidence, and competitor extraction).
**Plan & tasks:** `tasks/jsonld-schema/plan.md` + `tasks/jsonld-schema/todo.md` — *not* `tasks/plan.md`/`todo.md`, which are occupied by the approved URL/slug-v2 migration (M2). Do not touch those.
**Status:** APPROVED 2026-07-15 — full P0–P2 scope. Decisions: `priceSpecification` removed (T10 in); `sameAs` skipped, no profiles yet (T11 out); AWIN feed regeneration happens in Phase 2 as a browser-assisted session (Create-a-Feed columns + Toolbox feature review), user performs sign-in and secret update.

## Assumptions I'm making

1. Scope is the full audit plan P0 → P2 with stop-points at each checkpoint (you can cut scope at any checkpoint; P0 alone clears both real GSC flags).
2. The two "missing field" GSC flags (`shippingDetails`, `hasMerchantReturnPolicy`) are accepted as documented-N/A per the audit's will-not-do table — no work is planned for them.
3. JSON-LD truncation may diverge in length (not in substance) from the visible H1/description — confirmed compliant with Google's parity policy in the audit.
4. The breadcrumb fix is "emit only crumbs 1–2 in JSON-LD, keep the visible 3-crumb nav" (simplest honest option).
5. `priceSpecification`/`valueAddedTaxIncluded` gets removed (doc-orphaned dead weight) unless you want the EU VAT declaration kept.
6. Organization `sameAs` only ships if DealRadar has real profile URLs to point at; otherwise the task is skipped.

→ Correct any of these at approval time; silence = proceed as written.

## Objective

Make DealRadar PDPs emit the cleanest honest Product-snippet markup Google's current (July 2026) documentation defines for shopping-aggregator pages, and clear every page-level defect the 2026-07-15 live test run surfaced (two string-length flags, one unnamed button, four contrast failures). The user-visible outcomes: GSC URL inspection stops flagging string lengths; Lighthouse accessibility/agentic audits pass; identifier coverage (gtin/mpn/sku) becomes possible the moment the AWIN feed is regenerated. No fabricated data of any kind — that is a hard boundary, not a preference.

## Tech stack

Next.js 14 App Router (TypeScript), next-intl (13 locales: da de en es fi fr it nl no pl pt ro sv), Tailwind, Vitest, Supabase Postgres, pnpm. Prod: Netlify, deployed from **upstream** `oleg1981-sudo/DealRadar` main (push both remotes; every upstream push deploys prod).

## Commands

```
Typecheck:      pnpm typecheck
Tests:          pnpm test                    (vitest run; 78 tests green today)
Lint:           pnpm lint
Build:          pnpm build
i18n parity:    node scripts/check-i18n.mjs  (all 13 locales must have every key)
Live accept:    node scripts/verify-deploy.mjs   (48 assertions today; this work adds more)
```

## Project structure (the slice this work touches)

```
src/app/[locale]/deal/[slug]/page.tsx   → PDP; Product + BreadcrumbList JSON-LD (lines 81–149)
src/app/[locale]/layout.tsx             → site-wide Organization JSON-LD (lines 43–49)
src/lib/seo/                            → SEO helpers (new: schema-text.ts truncation helper)
src/components/layout/LocationPicker.tsx→ unnamed header button (a11y/agentic fix)
src/messages/*.json                     → 13 locale files; new key in the `geo` namespace
scripts/ingest-awin.cjs                 → feed→DB mapping (sku plumbing)
supabase/schema.sql                     → additive column for merchant sku (ask-first migration)
scripts/verify-deploy.mjs               → live acceptance suite (extend, never shrink)
tailwind.config.ts                      → accent scale (contrast fixes)
```

## Code style

Match the repo idiom: pure helpers with a JSDoc comment stating the *constraint*, colocated `.test.ts`, no new dependencies. Example of the expected shape:

```ts
/** Word-boundary cap for JSON-LD string fields — Google Merchant Center limits
 *  (name ≤150, description ≤5000) are mirrored by the Rich Results validators;
 *  exceeding them draws "Invalid string length" warnings (audit 2026-07-15). */
export function clampSchemaText(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max - 1);
  const cut = head.replace(/\s+\S*$/, '');
  return (cut.length >= max * 0.6 ? cut : head).trimEnd() + '…';
}
```

## Testing strategy

- **Unit (Vitest, colocated):** truncation boundaries (149/150/151 chars, multibyte umlauts — code-point safety, whitespace-free strings, the live 157-char name as a fixture); model-code extraction (strict match, rejection cases).
- **Gates before any push:** typecheck + test + lint + build all zero-fail, plus `check-i18n.mjs` when messages change.
- **Live acceptance:** extend `verify-deploy.mjs` — parse the sampled PDP's Product JSON-LD and assert `name.length ≤ 150`, `description.length ≤ 5000`, LocationPicker button has an accessible name, BreadcrumbList has no `/search?` item.
- **Human re-validation after deploy:** re-run GSC URL inspection + Rich Results Test on the same audit URL and confirm the two length warnings are gone.

## Boundaries

- **Always:** run all gates before pushing; keep JSON-LD server-rendered in initial HTML with the `<` escape; JSON-LD stays a faithful (possibly shorter) mirror of visible content; word-boundary truncation only; additive-only DB changes.
- **Ask first:** any push to upstream main (= prod deploy — per-batch authorization, as established); any prod DB migration (sku column); regenerating the AWIN feed URL and updating the `AWIN_FEED_URL` secret (user-side); adding any dependency; removing `priceSpecification` (open question 3).
- **Never:** fabricate schema data — no `aggregateRating`/`review`, no `shippingDetails`, no `hasMerchantReturnPolicy`, no `priceValidUntil`, no invented identifiers (the audit's will-not-do table is binding); never emit merchant-listing-only fields; never create `public/robots.txt`; never touch `tasks/plan.md`, `tasks/todo.md`, or `docs/specs/url-structure/**` (M2 lane).

## Success criteria

1. Live PDP JSON-LD: `name` ≤ 150 and `description` ≤ 5000 chars on every sampled deal (verify-deploy assertion green).
2. GSC re-inspection of the audit URL: both "Invalid string length" warnings gone; remaining non-critical flags are only the two documented-N/A merchant-listing fields.
3. Lighthouse on the audit URL: "Buttons do not have an accessible name" passes; Agentic-Browsing accessibility-tree audit passes; the four flagged contrast pairs meet WCAG AA.
4. `check-i18n.mjs` passes with the new `geo` key in all 13 locales.
5. All gates zero-fail; verify-deploy suite fully green (existing 48 + new assertions).
6. Conditional (post feed-regen): gtin/mpn/sku fill rate > 0 in fresh ingests and present in live JSON-LD for deals that carry them.

## Open questions

1. **Scope:** full P0–P2, or stop after a checkpoint? (Plan assumes full; checkpoints are cut-points.)
2. **`sameAs`:** do DealRadar social/profile URLs exist yet? If none → task skipped.
3. **`priceSpecification` removal:** OK to drop, or keep the EU VAT declaration?
4. **AWIN feed regeneration timing:** do it during this work (unblocks identifiers immediately) or defer to the parity-audit lane that already tracks it?
