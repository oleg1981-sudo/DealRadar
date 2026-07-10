# Recovered documents — 2026-07-09

> ⚠️ **SUPERSEDED (same day, 2026-07-09 10:56):** the destroyed originals were restored byte-faithfully by their authoring session and **committed at `b53bb3e`** — `docs/specs/url-structure/2026-07-08_v2/` (incl. `redteam-register.md`, the 49→25 register, and `redteam-adjudication-full.json`) plus live `tasks/plan.md` + `tasks/todo.md`. **Those committed files are authoritative; this folder is retained as audit-trail and as a secondary fidelity cross-check only.** The one unrecovered casualty is the 2026-06-28 `audit/audit-plan.md` (its findings companion is preserved verbatim here). The "Action required" section below is historical — its recovery step completed; only "commit the remaining untracked trees" (v3.1 T-INF-12) stays live.

**Context:** the fresh git pull on 2026-07-09 replaced the working tree. Several **untracked** (never-committed) documents were destroyed. This folder re-materializes what could be recovered, with honest provenance per file. Recovered ≠ original: treat every file here as a snapshot of what a prior Claude session had read into context on 2026-07-08, not as the canonical artifact.

| File here | Original path (destroyed) | Provenance | Fidelity |
|---|---|---|---|
| `tasks-todo.md` | `tasks/todo.md` | Read in full into session context on 2026-07-08; re-emitted verbatim | **High** (verbatim re-emission) |
| `audit-findings-2026-06-28.md` | `audit/findings.md` | Read in full into session context on 2026-07-08; re-emitted verbatim | **High** (verbatim re-emission) |
| `url-slug-spec-RECONSTRUCTION.md` | `docs/specs/url-structure/2026-07-08_v2/` (whole package, HANDOFF.md entry point) + `docs/specs/2026-07-08_url-slug-structure_v1.md` | Reconstructed from: the auto-memory note `dealradar-url-slug-spec`, the v1 spec's task breakdown (`tasks/todo.md`), and the acceptance criteria the v3 ground-source-of-truth artifacts embedded from it | **Lossy** — the 25 verified red-team findings, the implementation-trap register, and the full v2 spec text are **NOT recoverable** from any known source |

## Not recoverable (no copy existed anywhere)

- `docs/specs/url-structure/2026-07-08_v2/` full package (HANDOFF.md, spec, red-team register) — the approved v2 spec. Only its decisions/acceptance criteria survive (see reconstruction file).
- `tasks/plan.md` — the url-slug implementation plan (never read into any surviving context).
- `audit/audit-plan.md` (2026-06-28) — the prioritized fix plan companion to the recovered findings.
- `.playwright-mcp/` session artifacts.

## Action required (P0 in the 2026-07-09 audit plan)

1. Check **Time Machine / another machine / editor local-history** for `docs/specs/url-structure/2026-07-08_v2/` and `tasks/`. If found, restore and **commit immediately**.
2. Whether or not originals are found: **commit this folder and `docs/ground_source_of_truth/`** so spec artifacts can never be destroyed by a pull again. Untracked spec work is a standing data-loss hazard.
