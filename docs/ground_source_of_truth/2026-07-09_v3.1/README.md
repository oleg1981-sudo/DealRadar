# DealRadar — Ground-Source-of-Truth v3.1 (Platform Scope)

**Date:** 2026-07-09 · **Status:** DRAFT — becomes canonical once the human confirmations below are signed off.

**v3.1 — post-merge reconciliation of the `91140c9..155cf06` code delta + the 2026-07-09 data-loss event; supersedes `2026-07-08_v3`; authored 2026-07-09.** _Grounding SHAs: the code delta is grounded on `155cf06` (the code tree); the current branch HEAD is `b53bb3e` — a docs-only commit (2026-07-09 10:56) restoring the url-slug spec package (see item 2 below)._

This is the spec-driven artifact set for the **full autonomous-platform** scope of DealRadar. Provenance chain: `2026-06-23_v2/` → `2026-07-08_v3/` (grounded on commit `91140c9`; now **frozen** — do not edit) → **this `2026-07-09_v3.1/`** (re-grounded on the `155cf06` code tree — the merge of main's ~15 feature commits into the 2026-06-28 remediation: 34 files, +1501/−232 for `91140c9..155cf06`; branch HEAD at authoring is `b53bb3e`, docs-only). Where v2 self-reported "all findings RESOLVED," this suite honors the **code-grounded** status instead.

## What changed in v3.1 (summary)

1. **Two P0s introduced by merge `155cf06`** now gate M0: (a) `supabase/schema.sql` defines `record_price_history()` TWICE — the winning duplicate omits the NOT-NULL `day`+`currency` columns, so once applied every price-changing upsert aborts (→ new **T-DB-0**, RSK-14); (b) the merge silently reverted `scripts/ingest-awin.cjs` + `ingest-awin.yml` to their `91140c9` bodies, destroying main's merchant_url/gallery/description extraction, verified-price preservation, stale-hide, and the flag/snapshot workflow steps (→ **T-ING-6** rewritten and elevated to M0).
2. **The 2026-07-09 data-loss event (EVENT 3) — since RESTORED:** a git pull destroyed the untracked, human-approved url-slug spec package, `tasks/plan.md`, and `tasks/todo.md`. It was restored and **COMMITTED at `b53bb3e`** (2026-07-09 10:56): `/Users/danielmanzela/DealRadar/docs/specs/url-structure/2026-07-08_v2/` — HANDOFF.md, spec.md, plan.md, tasks.md, **the 49→25 red-team register (`redteam-register.md`) + `redteam-adjudication-full.json`** — plus `tasks/plan.md`+`tasks/todo.md`. A-19, T-SEO-6, and design §4 point at that committed package as authoritative (fidelity caveat: restoration from session context + workflow journals; cross-check against the secondary `docs/recovered/2026-07-09/` reconstruction). New **RSK-13** (partially remediated at `b53bb3e`) + **T-INF-12** (commit the remaining at-risk docs — the FIRST task executed) prevent a recurrence. This v3.1 suite itself is at-risk-until-committed.
3. **Five net-new capability chains** for what main shipped that v3 never saw: the live-shop price **verifier** (`FR-ING-12`/`DSN-ING-11`/`T-ING-10`, DETERMINISTIC), the **hidden/homepage_hidden lifecycle** (`FR-ING-13`/`DSN-ING-12`/`T-ING-11`), the **PDP gallery/description/cardiogram** surface + DealDetailModal wire-or-delete (`FR-PDP-7`/`DSN-PDP-7`/`T-PDP-6`), **pagination + seed-crawl-trap hygiene** (`FR-SEO-15`/`DSN-SEO-12`/`T-SEO-11`), and the day-keyed `price_history` rewrite of `FR-ING-7`/`DSN-ING-6`.
4. **Delivered-by-the-delta status notes** (merged-on-branch, Verify still required — boxes stay unticked): T-SEO-3/T-SEO-4 implemented; FR-CMP-8/T-CMP-5/T-CMP-7 alerts+unsubscribe largely built; FR-SEO-6/7 partially delivered by adjacent main work that is NOT the A-19 spec (the merged sitemap is a replacement target, not a foundation); T-PDP-5 honesty-gutting largely done.
5. Refreshed PRD §2 evidence (verified-live 2026-07-09 where marked), amended A-02 (deploy preconditions), extended OBJ-2/SC5, updated RSK-2/RSK-5, four new §8.2 operator-threshold rows.

## Read in this order

1. **[prd.md](prd.md)** — vision, framing (no literal 100%), the 7 subsystems, `OBJ-1…OBJ-8` (measurable), **Assumptions `A-01…A-19`** (A-02/A-19 amended), `SC1…SC8`, **`RSK-1…RSK-14`**, Operator thresholds (§8.2, +4 rows), v2→v3 ID crosswalk (§9).
2. **[requirements.md](requirements.md)** — `FR-*` (7 areas, **+4 new**: FR-ING-12/13, FR-PDP-7, FR-SEO-15; FR-ING-7 rewritten) + `NFR-*` (10 categories, unchanged). Every requirement cites its `OBJ`, carries a measurable **evaluate / verify / monitor** signal, and an **agentic vs deterministic vs human-gated** classification.
3. **[design.md](design.md)** — **61** `DSN-*` components (**+4 new**: DSN-ING-11/12, DSN-PDP-7, DSN-SEO-12; DSN-PDP-6 reserved for a11y), data-model deltas (incl. the day-keyed `price_history` + the schema P0 note), the Operator architecture, and **both-direction traceability matrices** (§7).
4. **[tasks.md](tasks.md)** — **60** dependency-ordered `T-*` tasks grouped by milestone (**+6 new**: T-INF-12, T-DB-0, T-ING-10, T-ING-11, T-PDP-6, T-SEO-11); each has Traces / Type / Acceptance / Verify / Monitor / Files.
5. **[CHANGELOG.md](CHANGELOG.md)** — every v3→v3.1 edit as a row, plus consciously-omitted deltas.

## Traceability contract

`OBJ ← FR/NFR ← DSN ← Task`, enforced both directions. Verified: **61 DSN defined = 61 DSN referenced (0 orphaned)**; every `OBJ`/`FR`/`NFR`/`DSN` cited in a downstream doc resolves to a definition upstream. Reserved numbers (`FR-ING-8`, `FR-INF-3`, `FR-INF-11`, `NFR-REL-2/4`, `DSN-PDP-6` for a11y) are folded/held by design. Two documented task-ID exceptions: **T-DB-0** (deliberate out-of-area P0 hotfix ID matching the 2026-07-09 audit-plan + the url-slug chain `T-DB-0 → B1 → C2 → ingest re-merge → T-SEO-6 → E1/E2`) and **T-INF-12** (process task tracing to RSK-13, no DSN).

## Milestone sequence (why the Operator is last)

| M | Milestone | Measurable exit gate |
|---|---|---|
| **M0** | Deploy & data-integrity baseline | _(v3.1 pre-gate: T-INF-12 → T-DB-0 + T-ING-6 restore, BEFORE T-INF-1/T-INF-2)_ prod curl of a remediated route = 200; `grep dealradar.eu` in prod = 0; FK+CHECKs present; no-creds refresh writes 0 rows; **`schema.sql` defines `record_price_history` exactly once; `git diff main..HEAD -- scripts/ingest-awin.cjs` is empty-or-superset; no untracked files under `docs/`/`tasks/`/`audit/`** _(partially satisfied at `b53bb3e`: `docs/specs/`+`tasks/` committed; the ground_source_of_truth suites, `docs/recovered/`, `audit/2026-07-09_consolidation/` remain)_ |
| **M1** | Thin revenue loop | `deals.source<>'mock'` > 0; ≥ 50 PDPs 200 + valid JSON-LD; ≥ 1 postback persisted with recovered `product_id` |
| **M2** | Organic growth engine *(critical path)* | 0 → ≥ 1,000 indexed URLs in 90 d; 0 errors across the host/canonical/hreflang sample; ≥ 1 AI-engine citation |
| **M3** | Breadth | ≥ 4 countries live; cross-network EAN dedup + highest-commission-wins + reconciliation operating |
| **M4** | The Autonomous Operator | ≥ 90% of fault-drills actioned within MTTA ≤ 15 min / MTTR ≤ 60 min; dead-man's switch fires on silence |

## Permanent human gates (never automated)

- **G1** — affiliate/brand approval + KYC (`T-ING-2`, M1; the true M1 revenue blocker).
- **G2** — legal copy sign-off / real Impressum identity (`T-CMP-1`, M1; blocks EU prod launch).
- **G3** — payout/banking KYC (`T-MON-6`, M3; ledger view ships, disbursement does not).

## Three-state honesty (mandatory)

`merged-on-branch` ≠ `deployed-to-prod` ≠ `verified-live`. As of 2026-07-09: prod (`dealradar.me`) still served the old-format sitemap with **zero `/deal/` URLs**; the deployed SHA and the prod **DB shape are UNKNOWN — probe before any schema apply**. All v3.1 status notes are merged-on-branch unless explicitly marked verified-live. The sanctioned agentic set stays at exactly **4** components; everything the delta added (verifier, snapshot, lifecycle, pagination) is DETERMINISTIC.

## Before this becomes canonical — human confirmations required

Sign off (or correct) the **Assumptions block `A-01…A-19`** in prd.md §4 — especially A-02 (deploy preconditions, amended), A-19 (the committed `docs/specs/url-structure/2026-07-08_v2/` package restored at `b53bb3e` as the authoritative spec + red-team register: confirm the fidelity spot-check), the provisional target numbers (`A-09`, `A-10`, `A-11`, `A-13`), and the three human gates. Plus one v3.1 decision: **T-PDP-6's wire-or-delete of the `DealDetailModal`.** Until then all docs carry **Status: DRAFT**.

## Provenance

v3 was authored by a code-grounded, adversarially-verified pipeline (parallel per-subsystem code auditors → sequential authoring → 5 adversarial reviewers → fix passes). v3.1 was produced by a two-pass post-merge audit (2026-07-09): a v3-invalidation mapper + a spec-conformance pass over the 12 locked url-slug decisions and todo phases A2–E2, all claims verified against the `155cf06` code tree (identical to HEAD `b53bb3e` for code) with file:line citations, consolidated in `/Users/danielmanzela/DealRadar/audit/2026-07-09_consolidation/{findings,audit-plan}.md`.

**Not covered yet (recommended follow-up):** the accessibility (WCAG 2.1 AA / axe) requirement set — `DSN-PDP-6` stays reserved for it; deferred pending sign-off since it is a quality-bar decision. Also open (needs user/prod access): prod curls/DB probes/secrets verification, GSC read. _(Closed 2026-07-09: the Time Machine/recovery open item for the red-team register — the package was restored and committed at `b53bb3e`; the residual action is the fidelity spot-check against `docs/recovered/2026-07-09/`, not recovery.)_
