# Tasks: PDP JSON-LD schema remediation

Spec: `SPEC.md` · Plan: `tasks/jsonld-schema/plan.md` · Audit: `audit/2026-07-15_jsonld-schema/`
Order is dependency order. Nothing below is implemented yet. ⚠ = requires explicit user authorization/action at that step.

## Phase 1 — P0

- [ ] **T1: `clampSchemaText` truncation helper + tests**
  - Acceptance: word-boundary cap with ellipsis; code-point-safe; returns input unchanged when ≤ max; falls back to hard cut when the last word exceeds 40% of budget (mirrors `feedDescription` semantics)
  - Verify: `pnpm test` — new cases: ≤150 passthrough, 151 cut, multibyte umlauts, whitespace-free string, the live 157-char BlazeVideo name as fixture
  - Files: `src/lib/seo/schema-text.ts`, `src/lib/seo/schema-text.test.ts`
  - Scope: XS · Dependencies: none

- [ ] **T2: cap PDP JSON-LD `name` (150) and `description` (5000)**
  - Acceptance: JSON-LD uses clamped values; `<h1>`, `<title>`, meta description, and visible description untouched
  - Verify: `pnpm test && pnpm typecheck && pnpm build`; local render of the BlazeVideo slug shows name ≤150 / description ≤5000 in the Product block
  - Files: `src/app/[locale]/deal/[slug]/page.tsx`
  - Scope: XS · Dependencies: T1

- [ ] **T3: verify-deploy assertions for JSON-LD field lengths**
  - Acceptance: suite parses the sampled PDP's Product block and fails on name >150 or description >5000
  - Verify: `node scripts/verify-deploy.mjs` fails against current prod (proves the assertion bites), passes after CP1 deploy
  - Files: `scripts/verify-deploy.mjs`
  - Scope: XS · Dependencies: T2

### Checkpoint 1
- [ ] Gates: `pnpm typecheck && pnpm test && pnpm lint && pnpm build` — all zero-fail
- [ ] ⚠ Deploy authorization → push origin + upstream → poll live
- [ ] `node scripts/verify-deploy.mjs` fully green (48 existing + new)
- [ ] ⚠ User re-runs GSC URL inspection on the audit URL → both length warnings gone

## Phase 2 — P1

- [ ] **T4: LocationPicker accessible name (a11y + agentic)**
  - Acceptance: header button exposes a localized accessible name on all viewports (reuses existing `geo.changeLocation` key — already translated in all 13 locales; no message-file changes needed)
  - Verify: `pnpm test/build`; verify-deploy gains an assertion that the button has an accessible name
  - Files: `src/components/layout/LocationPicker.tsx`, `scripts/verify-deploy.mjs`
  - Scope: XS (shrunk from S — existing key reused) · Dependencies: none

- [ ] **T5: sku plumbing (inert until feed regen)** ⚠ prod DB migration
  - Acceptance: `merchant_sku` nullable column (additive, RLS untouched); ingest maps `merchant_product_id`; repo maps row→`NormalizedDeal.merchantSku`; PDP emits `sku` (whitespace-stripped) only when present
  - Verify: `pnpm test` (emission conditional unit-tested); migration applied via MCP `apply_migration` after explicit authorization; no behavior change on current data (0-fill)
  - Files: `supabase/schema.sql`, `scripts/ingest-awin.cjs`, `src/lib/db/deals.repo.ts`, `src/lib/providers/types.ts`, `src/app/[locale]/deal/[slug]/page.tsx`
  - Scope: M · Dependencies: none (payoff depends on T6)

- [ ] **T6: ⚠ Browser-assisted AWIN session — Create-a-Feed regeneration + Toolbox review** (coordinates with parity-audit P2-1)
  - Acceptance: feed includes `ean`, `mpn`, `model_number`, `merchant_product_id`, `product_short_description`, `delivery_cost`, `delivery_time`, `condition`; user copies the regenerated URL into the `AWIN_FEED_URL` secret (feed URLs embed the API key — never pasted through chat); AWIN Toolbox features/plugins reviewed with a recommendation list
  - Verify: dry-run ingest, then fill-rate report per column; live PDP JSON-LD shows gtin/mpn/sku for deals that carry them
  - Files: none (Claude-in-Chrome session on ui.awin.com; user signs in and updates the GitHub secret)
  - Scope: browser session + user action · Dependencies: T5 for full payoff

### Checkpoint 2
- [ ] Gates + `check-i18n.mjs` green
- [ ] ⚠ Deploy authorization → push → verify-deploy green (incl. button-name assertion)
- [ ] Post-regen ingest fill-rate report posted (ean/mpn/model_number/merchant_sku)

## Phase 3 — P2 (independent; parallelizable)

- [ ] **T7: contrast fixes on PDP price/CTA column**
  - Acceptance: the four flagged pairs (accent merchant label, `zinc-400` was-price, affiliate badge, CTA text) meet WCAG AA (≥4.5:1 normal, ≥3:1 large text)
  - Verify: computed-ratio check (unit or script) + Lighthouse a11y re-run: zero contrast failures on the audit URL
  - Files: `src/app/[locale]/deal/[slug]/page.tsx`, badge/CTA components, `tailwind.config.ts`
  - Scope: S · Dependencies: none

- [ ] **T8: conservative trailing-model-code extraction → `model`**
  - Acceptance: strict `/\|\s*([A-Z0-9][A-Z0-9-]{1,14})\s*$/` match on `productName` only when `mpn`/`model_number` empty; emitted as `model`, never gtin/mpn; rejection cases tested (no pipe, lowercase tail, sentence tail)
  - Verify: `pnpm test` — extraction + rejection cases; BlazeVideo fixture yields `A323`
  - Files: `src/lib/seo/schema-text.ts` (or sibling), `page.tsx`, tests
  - Scope: S · Dependencies: none

- [ ] **T9: BreadcrumbList JSON-LD emits crumbs 1–2 only**
  - Acceptance: no `/search?` URL in structured data; visible 3-crumb nav unchanged
  - Verify: verify-deploy assertion: BreadcrumbList contains no `item` matching `/search?`
  - Files: `page.tsx`, `scripts/verify-deploy.mjs`
  - Scope: XS · Dependencies: none

- [ ] **T10: drop `priceSpecification` sub-node** (APPROVED 2026-07-15)
  - Acceptance: Offer keeps price/priceCurrency/availability/itemCondition/url/seller; validators still 0 errors
  - Verify: `pnpm test/build`; Rich Results Test re-run at CP3
  - Files: `page.tsx`
  - Scope: XS · Dependencies: user answer

- [x] ~~**T11: Organization `sameAs` + `description`**~~ — SKIPPED 2026-07-15: no real profile URLs exist yet; revisit when they do (never emit placeholder URLs)

### Checkpoint 3 — complete
- [ ] Gates green; ⚠ deploy authorization → push → full verify-deploy green
- [ ] ⚠ User re-runs Rich Results Test + GSC inspection + Lighthouse on the audit URL
- [ ] Results archived into `audit/2026-07-15_jsonld-schema/` (close-out note: which flags cleared, which are documented-N/A)
