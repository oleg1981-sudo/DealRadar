# DealRadar Remediation Plan — 2026-06-28_v1

Idea→implementation planning artifact produced per `~/Downloads/planning_agent_base_prompt.md`, compiling the ground-truth code audit (`/audit/findings.md`, `/audit/audit-plan.md`) into an executable, **machine-verified** plan.

## Read in this order
1. **`spec.md`** — Steps 0–2: intake, product-class, domain-baseline yardstick, scope, measurable success criteria (SC1–SC8).
2. **`requirements.md`** — Step 3: 56 EARS requirements + the coverage matrix (51/51 baseline items MAPPED). *Generated.*
3. **`design.md`** — Step 5: architecture, flows, schema/contracts, error handling, testing strategy, 31-component inventory.
4. **`tasks.md`** — Step 6: 33 phased, dependency-ordered tasks (Phase 0 = spine), each with named verification. *Generated.*
5. **`validation_and_review.md`** — Step 4 + Step 7: verification ladder results, the contradiction resolved (F3), the independent red-team's 6 findings + corrections, residual risk, and the §6 output-contract checklist.

## Source of truth & how to re-verify
- **`plan.json`** — canonical machine-readable plan (baseline, requirements, components, tasks; the rendered `.md` derive from it).
- **`validate_plan.mjs`** — Tier-A harness. Run:
  ```
  export PATH="/Users/danielmanzela/.nvm/versions/node/v22.20.0/bin:$PATH"
  node docs/remediation_plan/2026-06-28_v1/validate_plan.mjs   # structure/coverage/traceability/counts -> PASS exit 0
  node docs/remediation_plan/2026-06-28_v1/render_docs.mjs      # re-render requirements.md, tasks.md, component table
  ```
- `_components_table.md` is a generated fragment (embedded into `design.md`).

## Verified counts (machine-checked)
51 baseline items (51/51 MAPPED) · 56 requirements (P0=6, P1=23, P2=13, REGRESSION=14) · 31 components · 33 tasks (phases 0–5). Current codebase baseline: `tsc --noEmit` and `next build` both exit 0.

## Status
Plan **PASSES** Tier-A validation and an independent Tier-C red-team (counts confirmed, all 14 REGRESSION items verified implemented in code, 0 false-positive scope claims). This is a planning hand-off, gated behind the audit's approval gate — **no remediation code has been executed yet.**
