# DealRadar — Ground-Source-of-Truth v3 (Platform Scope)

**Date:** 2026-07-08 · **Status:** DRAFT — becomes canonical once the human confirmations below are signed off.

This is the spec-driven artifact set for the **full autonomous-platform** scope of DealRadar. It **supersedes** the `2026-06-23_v2/` suite and **folds in** the `2026-06-28` Tier-1 remediation, re-expressing both against the **code-grounded** current state (not the v2 "all RESOLVED" self-report).

## Read in this order

1. **[prd.md](prd.md)** — vision, framing (no literal 100%), the 7 subsystems, `OBJ-1…OBJ-8` (measurable), **Assumptions `A-01…A-19`**, `SC1…SC8`, `RSK-1…RSK-12`, Operator thresholds (§8.2), v2→v3 ID crosswalk (§9).
2. **[requirements.md](requirements.md)** — `FR-*` (7 areas) + `NFR-*` (10 categories). Every requirement cites its `OBJ`, carries a measurable **evaluate / verify / monitor** signal, and an **agentic vs deterministic vs human-gated** classification.
3. **[design.md](design.md)** — 57 `DSN-*` components (each citing the FR/NFR it satisfies), data-model deltas, the Operator architecture (deterministic monitors → agentic triage → human lane), and **both-direction traceability matrices** (§7).
4. **[tasks.md](tasks.md)** — 54 dependency-ordered `T-*` tasks grouped by milestone; each has Traces / Type / Acceptance / Verify / Monitor / Files.

## Traceability contract

`OBJ ← FR/NFR ← DSN ← Task`, enforced both directions. Verified: **57 DSN defined = 57 DSN referenced (0 orphaned)**; every `OBJ`/`FR`/`NFR`/`DSN` cited in a downstream doc resolves to a definition upstream. Reserved numbers (`FR-ING-8`, `FR-INF-3`, `NFR-REL-2/4`) are folded by design and carry no task.

## Milestone sequence (why the Operator is last)

| M | Milestone | Measurable exit gate |
|---|---|---|
| **M0** | Deploy & data-integrity baseline | prod curl of a remediated route = 200; `grep dealradar.eu` in prod = 0; FK+CHECKs present; no-creds refresh writes 0 rows |
| **M1** | Thin revenue loop | `deals.source<>'mock'` > 0; ≥ 50 PDPs 200 + valid JSON-LD; ≥ 1 postback persisted with recovered `product_id` |
| **M2** | Organic growth engine *(critical path)* | 0 → ≥ 1,000 indexed URLs in 90 d; 0 errors across the host/canonical/hreflang sample; ≥ 1 AI-engine citation |
| **M3** | Breadth | ≥ 4 countries live; cross-network EAN dedup + highest-commission-wins + reconciliation operating |
| **M4** | The Autonomous Operator | ≥ 90% of fault-drills actioned within MTTA ≤ 15 min / MTTR ≤ 60 min; dead-man's switch fires on silence |

## Permanent human gates (never automated)

- **G1** — affiliate/brand approval + KYC (`T-ING-2`, M1; the true M1 revenue blocker).
- **G2** — legal copy sign-off / real Impressum identity (`T-CMP-1`, M1; blocks EU prod launch).
- **G3** — payout/banking KYC (`T-MON-6`, M3; ledger view ships, disbursement does not).

## Before this becomes canonical — human confirmations required

Sign off (or correct) the **Assumptions block `A-01…A-19`** in prd.md §4 — especially the provisional target numbers (`A-09` cost ceiling, `A-10` 1,000-URL/90-day index target, `A-11` 60% historical-low coverage, `A-13` 4-country/10%-EAN breadth) and the three human gates. Until then all four docs carry **Status: DRAFT**.

## Provenance

Authored by a code-grounded, adversarially-verified pipeline: parallel per-subsystem code auditors → sequential PRD→Requirements→Design→Tasks authoring → 5 adversarial reviewers (hallucination / drift / measurability / traceability / completeness) → fix pass on blockers + majors → a manual editorial pass closing the residual measurability/drift items and adding the agentic-cost-guardrail (`NFR-COST-3`) and category-sitemap coverage.

**Not covered yet (recommended follow-up):** an accessibility (WCAG 2.1 AA / axe) + image-alt/broken-image requirement set — present in the `2026-06-28` remediation baseline (`R-UX-1/2`) but not yet re-expressed in v3. Adding it introduces `NFR-A11Y-*` + `DSN-PDP-6` + a task; deferred pending sign-off since it is a quality-bar decision.
