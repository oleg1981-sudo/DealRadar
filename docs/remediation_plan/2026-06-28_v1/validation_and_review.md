# DealRadar Remediation — Logical Validation & Adversarial Review

> Steps 4 + 7 of the planning pipeline, with the verification ladder (§4) applied at the highest tier available and degraded honestly. Verdicts are labeled by how they were obtained: **machine-checked** vs **UNVERIFIED (reasoned)**.

## Step 4 — Logical validation (verification ladder)

### Tier A — deterministic, machine-checked (RAN; actual verdicts below)

| Check | Tool (re-runnable) | Actual result |
|---|---|---|
| Plan structure, EARS pattern↔keyword, ≥1 acceptance/req, vague-term reject-list, provenance | `node validate_plan.mjs` | **PASS, exit 0** |
| Coverage matrix (baseline → ≥1 requirement) | `validate_plan.mjs` | **51/51 MAPPED, 0 UNMAPPED** |
| Traceability (req→task, req→component, component→req, task→verification; no dangling refs; no orphan req) | `validate_plan.mjs` | **0 dangling, 0 orphans** |
| Phase ordering (no dependency on a later phase) | `validate_plan.mjs` | **PASS** |
| Counts | `validate_plan.mjs` | **56 req (ubiquitous 30 / event 14 / unwanted 8 / state 4; P0=6 P1=23 P2=13 REGRESSION=14; stated=43 inferred=13) · 51 baseline · 31 components · 33 tasks · phases 0–5** |
| TypeScript health (current baseline) | `tsc --noEmit` | **exit 0, 0 errors** |
| Production build (current baseline) | `next build` | **exit 0, 78/78 pages, no warnings** |
| Dependency facts (license/version) | `npm view` | vanilla-cookieconsent **3.1.0 MIT** · @upstash/ratelimit **2.0.8 MIT** · vitest **4.1.9 MIT** |

The harness is **not a rubber stamp**: on first run it FAILED with **10 blocking errors** (1 UNMAPPED baseline item `B-I18N-2`; 8 requirements with no implementing task; 1 phase-ordering violation `T4.2→T5.3`) + 1 warning. All were corrected in `plan.json` (added R-LOC-2; attached the 8 orphan requirements to tasks; reversed the T4.2/T5.3 dependency) and the re-run PASSES. The build-health rows verify the *current* codebase baseline these tasks must not regress.

### Tier B — reasoned, **UNVERIFIED (not machine-checked)**: NL contradiction / vacuity / ambiguity

No SMT/solver was applied to the natural-language requirements, so the following are reasoned verdicts; the Tier-A upgrade would be to encode the invariants below into a checker.

**Contradictions examined (candidate pairs that could be jointly unsatisfiable in a reachable state):**
- `R-SEC-1` (no default signing secret / refuse in prod) **vs** `R-ING-7` + `SC1` (empty-`.env` `next build` exits 0): **was a real contradiction** (build runs `NODE_ENV=production`; the crypto module is imported during build → a throw-at-module-load would fail the empty-env build). Surfaced by the Tier-C red-team (F3) and **resolved by design decision**: R-SEC-1 is scoped to *request-time* refusal (no module-load throw), and its acceptance now explicitly requires the empty-env build to stay green. Reasoned consistent after the fix.
- `R-COMP-5` (no non-essential cookie before consent) **vs** `R-LOC-1` (middleware sets `dr_location` cookie): not a contradiction — `dr_location` is a *strictly-necessary* functional cookie (geo/locale), not analytics/marketing; setting it pre-consent is permitted under ePrivacy/TTDSG for essential cookies. Recorded as a classification decision.
- `R-ING-7` (mock on empty env) **vs** `R-MAIL-1`/`R-ING-1` (live ingestion/alerts): not contradictory — they hold in *disjoint* env states (unconfigured ⇒ mock; configured ⇒ live). Both reachable, never simultaneously required.
- `R-GEO-6` (rel `nofollow sponsored`) **vs** `R-MON-1` (subID decoration): complementary on the same `<a>` (rel attribute vs href param); no conflict.

**Vacuity (can each requirement ever fire?):** every event/unwanted/state requirement has a reachable trigger (e.g. R-MAIL-5 retention on schedule; R-LOC-1 on missing-cookie+unsupported-country; R-MON-3 on a postback). No requirement was found that can never fire. *(UNVERIFIED — reasoned.)*

**Ambiguity / acceptance rigor:** the Tier-A vague-term scan (reject-list: fast/secure/scalable/optimized/reliable/robust/efficient/performant/…) passed with 0 violations — every acceptance criterion carries an objective predicate (file/grep/HTTP status/exit code/count/standard token). One literal-match nit (`CACHE_TTL_SECONDS=1800` vs code `30*60`) was corrected (F5).

## Step 7 — Adversarial review (Draft → Red-Team → Correct)

### 7a. Structured self-critique (Tier A as the mechanism)
The `validate_plan.mjs` harness operationalizes the completeness/traceability/precision vectors as machine checks; it caught the 10 issues above before any human review. This is the §4 note that "a single agent auditing only itself is the weakest configuration" mitigated by structured self-critique.

### 7b. Independent red-team (Tier C — a separate agent audited plan + code + contract)
The red-team independently re-ran the harness, re-computed every count (all match), and **spot-verified all 14 REGRESSION items against the actual code** — confirming none is falsely claimed as implemented (no scope-honesty defect) and no gold-plating. It filed **6 findings**; all applied in place:

| ID | Vector | Sev | Issue | Correction applied |
|---|---|---|---|---|
| F1 | completeness | med | GAP-4 (ingest discount math) mapped only as a component blurb, untasked | Added acceptance to **R-ING-4** + verification to **T0.2**; added GAP-4 to its `findings` |
| F2 | completeness | med | `historicalLowPrice===0` → null guard untasked | Added acceptance to **R-GEO-2** + verification to **T2.2** |
| F3 | logic | **high** | R-SEC-1 throw-at-load contradicts empty-env build (R-ING-7/SC1) | Rescoped **R-SEC-1** to request-time refusal; acceptance now requires green empty-env build |
| F4 | traceability | med | R-OPS-2 on wrong component (C-migrate) + partially tasked | Reassigned R-OPS-2 **C-migrate→C-redis**; acceptance narrowed to what T3.3 proves (+ regression note) |
| F5 | acceptance | low | `CACHE_TTL_SECONDS=1800` literal won't grep-match `30*60` | Reworded acceptance + T3.3 to "resolves to 1800 (e.g. 30*60)" |
| F6 | scope | low | spec.md In-scope overclaimed "all P2 mapped"; mixed count systems | Softened In-scope; mapped GAP-4/histlow via F1/F2; disambiguated finding-counts vs requirement-counts |

After corrections: harness re-run **PASS (exit 0)**, counts unchanged (56/51/31/33), and `plan.json` remains valid JSON. The 2 audit false-negatives the red-team found (GAP-4, historicalLowPrice guard) are now enforceably mapped — closing the §5 hard rule "never silently drop a finding."

### Residual risk / out-of-scope (honest deferrals)
- **Tier-B items are reasoned, not solver-proven.** NL contradiction/vacuity verdicts above are `UNVERIFIED`; encoding them into a checker is the available upgrade.
- **Binding legal copy + real Impressum data (Decision C)** are machine-translated scaffolds flagged for professional/legal sign-off; the plan ships structure + fallbacks, not legally-vetted text. Tracked, not silently dropped (N4).
- **Live commercial feeds not provisioned (N3).** Strackr/Kelkoo/TD/AWIN code paths are built and unit-tested with mocks; proving *real* prices flow (SC2/SC3 on live data) is a launch-checklist step requiring credentials.
- **Real-time pricing (N2).** Refresh stays daily-bounded; sub-daily cadence is a future capacity/SLA decision.
- **Strackr endpoint/schema (R-ING-1)** must be validated against current Strackr publisher docs at implementation time (Phase-0 anti-hallucination guard); the provider is built to the PriceProvider contract regardless.
- **a11y (R-UX-2) and Rich Results (SC5)** acceptance use external tools (axe, Google RRT) run at implementation time — not yet executed here.

## Output-contract checklist (base prompt §6) — definition of done

- [x] Spec has explicit in-scope / out-of-scope **with rationale** (`spec.md`).
- [x] Every requirement is atomic, EARS-patterned, and has ≥1 **measurable** acceptance criterion (Tier-A vague-term scan: 0 violations).
- [x] Coverage matrix has **zero UNMAPPED** items (51/51, machine-checked).
- [x] Logical validation ran at the **highest available tier** with verdicts at true confidence (Tier A machine-checked; Tier B labeled UNVERIFIED; Tier C independent).
- [x] Every design component traces to a requirement (0 componentless-requirement orphans by check; warning-free).
- [x] Every task traces to a requirement **and names its verification** (machine-checked).
- [x] Adversarial review filed specific findings (10 harness + 6 red-team) and **applied corrections in place**.
- [x] Residual-risk / out-of-scope note states what is deferred or unverified.

## Tunable parameters used (§7)
- EARS set: ubiquitous/event/state/unwanted/optional.
- Vague reject-list: fast, secure, scalable, optimized, reliable, robust, efficient, performant, user-friendly, seamless, simply, properly, correctly, appropriately, as-needed, etc. (enforced by harness with an objective-predicate exemption).
- Spine: ingest writes slug → deal page resolves by slug → live-path price-drop alert → one-click unsubscribe POST (Phase 0, hard prerequisite).
- Verification tier: A (structure/coverage/counts/build) + B (reasoned NL logic) + C (independent red-team).
- Locales: 13 (en, de, fr, es, it, pl, nl, pt, sv, ro, da, fi, no).
- Phase structure: 0 Spine · 1 Compliance/i18n · 2 SEO/AEO · 3 Security · 4 Ingestion depth · 5 Ops/Testing/a11y/regression.
- All values overridable in `plan.json.meta.params`.
