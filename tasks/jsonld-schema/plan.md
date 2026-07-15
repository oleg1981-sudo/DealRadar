# Plan: PDP JSON-LD schema remediation

**Spec (canonical):** `SPEC.md` (repo root) — read it first; this plan is sequencing only.
**Audit rationale:** `audit/2026-07-15_jsonld-schema/audit-plan.md`.
**Status:** DRAFT — nothing implemented. Awaiting spec approval.
**Note on location:** `tasks/plan.md`/`tasks/todo.md` belong to the URL/slug-v2 migration (M2) and must not be overwritten — this workstream lives in `tasks/jsonld-schema/`.

## Overview

Three phases matching the audit's P0/P1/P2 tiers. Each phase ends in a checkpoint that is also a **deploy gate** (prod push requires explicit per-batch authorization) and a valid stop-point if scope gets cut. High-risk-of-surprise work (truncation semantics, DB migration) is front-loaded within its phase.

## Architecture decisions

- **One shared truncation helper** (`src/lib/seo/schema-text.ts`), unit-tested, used for both `name` (150) and `description` (5000) — not two inline slices. Word-boundary cut + ellipsis, code-point-safe.
- **JSON-LD-only changes**: visible H1/title/description keep full text; only the machine-readable copies are capped (parity-compliant per audit).
- **Breadcrumb fix = omission**: JSON-LD emits crumbs 1–2 only; the visible 3-crumb nav is untouched. No new URL surface invented.
- **sku plumbing is additive and inert**: new nullable DB column + conditional emission; a no-op until the AWIN feed regeneration (user-side) starts filling it. Repo work and feed work decouple cleanly.
- **Verification lives in verify-deploy.mjs**: every fix gets a live assertion so regressions are caught by the standing acceptance suite, not by memory.

## Dependency graph

```
T1 clampSchemaText helper ──→ T2 wire into PDP JSON-LD ──→ T3 verify-deploy assertions ──→ CP1 (deploy)
T4 LocationPicker aria-label (independent) ─────────────┐
T5 sku plumbing (ASK-FIRST: DB migration) ──────────────┼──→ CP2 (deploy)
T6 AWIN feed regen (USER ACTION; unblocks T5 payoff) ───┘
T7 contrast fixes │ T8 model extraction │ T9 breadcrumb JSON-LD │ T10 drop priceSpecification │ T11 sameAs
        (all independent of each other) ──────────────────────────────────────────→ CP3 (deploy + full re-verify)
```

## Phases

### Phase 1 — P0: clear the two real GSC flags (T1–T3)
Truncation helper → PDP wiring → live assertions. Smallest possible deploy batch; proves the find→fix→verify loop on this workstream.

### Checkpoint 1
- All gates zero-fail (typecheck/test/lint/build)
- **Ask deploy authorization** → push both remotes → `verify-deploy.mjs` green incl. new length assertions
- Human re-runs GSC URL inspection on the audit URL → length warnings gone

### Phase 2 — P1: a11y/agentic button + identifier plumbing (T4–T6)
T4 is repo-only. T5 needs an **ask-first prod migration** (additive `merchant_sku` column). T6 is a user-side AWIN dashboard action (coordinates with parity-audit P2-1, which already tracks it) — without it T5 stays inert but harmless.

### Checkpoint 2
- Gates + `check-i18n.mjs` green; deploy authorization → push → verify-deploy green (incl. button-name assertion)
- After first post-regen ingest: fill-rate report for ean/mpn/model_number/merchant_sku

### Phase 3 — P2: quality items (T7–T11)
All independent; safe to parallelize across sessions/agents. T10/T11 are gated on open questions 3/2 in SPEC.md.

### Checkpoint 3 (complete)
- Gates green; deploy authorization → push → full verify-deploy green
- Human re-runs Rich Results Test + GSC inspection + Lighthouse on the audit URL; results archived into `audit/2026-07-15_jsonld-schema/`

## Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Truncation cuts inside a surrogate pair / multibyte char | Low (garbled JSON-LD) | Code-point-safe slice; unit tests with umlauts + the live 157-char fixture |
| Contrast fixes drift the brand look | Med | Minimal darkening within the existing accent scale; before/after screenshots at CP3 |
| Prod DB migration for sku | Med | Additive nullable column only; RLS untouched; explicit user authorization; applied via MCP `apply_migration` (db-migrate.yml is a no-op on prod) |
| AWIN feed regen changes column availability/order | Med | Ingest reads by header name (order-proof); dry-run ingest before the scheduled one; fill-rate report |
| Deploy batches land while the Antigravity/PDP lanes also push | Low | Pull/rebase before each push (established pattern after two prior rejections) |
| Model-code extraction fabricates an identifier | Low | Strict `\| CODE$` pattern, rejection unit tests, emitted as `model` (not gtin/mpn) |

## Parallelization

- **Safe to parallelize:** T4, T7, T8 (and T9–T11) — disjoint files.
- **Sequential:** T1→T2→T3 (dependency chain); T5 after its migration is authorized.
- **Needs coordination:** T6 (user + AWIN dashboard + GitHub secret update); any deploy (per-batch authorization).

## Out of scope / deferred

- Perf trims (render-blocking CSS, browserslist polyfills) — audit P2-#10, opportunistic only at Perf 99.
- Everything in the audit's will-not-do table (binding).
- Locale-translated product content and any slug/URL work — M2 lane (`tasks/plan.md`).
