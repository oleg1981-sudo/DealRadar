# DealRadar v3.1 — Real Completion Audit (code-grounded)

**Date:** 2026-07-15 · **Method:** 7 parallel verification agents, one per requirement area (ING/MON/PDP/SEO/INF/CMP/OPS), each independently re-checking every task's Acceptance criteria against the ACTUAL code on `main` (HEAD `0b78cc3`, confirmed in sync with both `origin` and `upstream` remotes) — not against the spec's own embedded status prose. 353 tool calls, ~608K tokens of verification.

**Ground rule:** the spec suite (`docs/ground_source_of_truth/2026-07-09_v3.1/`) is dated 2026-07-09 and contains many self-reported "DONE"/"merged-on-branch" claims. A large amount of code has landed since then (this session's own PDP content-parity work, AWIN programme discovery, consent-gated analytics, GDPR disclosures, sitemap/robots rework). Every verdict below was independently re-derived from current code, ignoring the doc's embedded claims — some prior "DONE" claims have since regressed, some prior "pending" items have since landed.

---

## Headline numbers

**60 tasks total** (matches `tasks.md`'s own count). Verdict distribution:

| Verdict | Count | % of 60 |
|---|---|---|
| **DONE** — every acceptance clause met in code | 10 | 16.7% |
| **PARTIAL** — some clauses met, real gaps remain | 18 | 30.0% |
| **NOT_DONE** — acceptance unmet / feature absent | 28 | 46.7% |
| **HUMAN_GATED_OPEN** — blocked on G1/G2/G3 or external creds, not a code gap | 4 | 6.7% |

**Weighted completion (DONE=1, PARTIAL=0.5, NOT_DONE/GATED=0): 31.7%** (19/60).
Excluding the 4 human-gated tasks from the denominator (since code cannot close them): **33.9%** (19/56).

**Do not read this as "34% of the product exists."** Weighting is a rough continuous proxy over discrete acceptance clauses; it is generous to PARTIAL tasks that are missing a single named sub-clause and equally generous to PARTIAL tasks missing half their scope. The milestone table below is more informative than the single headline number.

### NFR sample (28 of 32 spec NFRs independently sampled by the same agents)
DONE 5 · PARTIAL 9 · NOT_DONE 14. Pattern mirrors the task-level finding: security/privacy primitives (secrets, RLS, HSTS/CSP, subID PII-freedom) are solid; **observability, cost guardrails, and rate-limiting are almost entirely unbuilt.**

---

## By milestone (the spec's own build-sequencing gate)

| Milestone | Goal | Tasks | DONE | PARTIAL | NOT_DONE | GATED | Weighted % |
|---|---|---|---|---|---|---|---|
| **M0** | Deploy & data-integrity baseline | 10 | 4 | 4 | 2 | 0 | **60%** |
| **M1** | Thin revenue loop (earn once) | 24 | 5 | 10 | 5 | 4 | **42%** |
| **M2** | Organic growth engine (critical path) | 13 | 1 | 3 | 9 | 0 | **19%** |
| **M3** | Breadth (4+ countries, commission-wins, reconciliation) | 5 | 0 | 1 | 4 | 0 | **10%** |
| **M4** | The Autonomous Operator | 8 | 0 | 0 | 8 | 0 | **0%** |

**Reading this:** M0 (the deploy/integrity prereq) is genuinely the most solid milestone — schema dedup, prod deploy, and security headers all check out live. M1 (the actual revenue loop) is nearly half PARTIAL-or-blocked: the code scaffolding is often there, but the loop has never actually earned a cent because **T-ING-2 (G1 affiliate credentials) is still open** — every provider reports `isMock:true` today, so `T-ING-4`/`T-ING-5`/`T-ING-7`'s "live data" acceptance clauses are structurally unmeetable regardless of code quality. M2 (the stated **critical path** for the whole business — organic traffic) is only 19% done: the url-slug rework (`T-SEO-6`) that everything else depends on is still PARTIAL, and 5 of its sibling tasks (curation overlay, editorial content, related-deals linking, index-coverage polling, citation probing) are **entirely unbuilt from scratch** — not regressed, never started. M4 (the Operator) is **completely unbuilt** — 0 of 8 tasks have a single line of code — which is actually correct per the spec's own sequencing rule (RSK-9: don't build a monitor before there's anything to monitor), so this is expected, not alarming.

## By area

| Area | Tasks | DONE | PARTIAL | NOT_DONE | GATED | Weighted % |
|---|---|---|---|---|---|---|
| **CMP** (compliance/legal/consent) | 7 | 2 | 3 | 1 | 1 | **50%** — strongest area |
| **INF** (infra/reliability/security) | 12 | 4 | 3 | 5 | 0 | **46%** |
| **ING** (ingestion) | 12 | 1 | 6 | 3 | 2 | **33%** |
| **PDP** (product page content) | 6 | 1 | 2 | 3 | 0 | **33%** |
| **SEO** (organic growth) | 11 | 2 | 2 | 6 | 1 | **27%** |
| **MON** (monetization/attribution) | 6 | 0 | 2 | 4 | 0 | **17%** |
| **OPS** (autonomous operator) | 6 | 0 | 0 | 6 | 0 | **0%** |

---

## What's actually solid (verified DONE, no caveats)

- **T-DB-0** — the P0 duplicate-trigger schema bug is fixed on-disk with a CI guard (`db-migrate.yml:38-41`) that fails the build on any future duplicate function/trigger definition.
- **T-INF-12** — no untracked spec/doc trees remain (the 2026-07-09 data-loss risk is closed).
- **T-INF-1 / T-INF-2** — the migration is live on prod Supabase (846 deals, RLS enabled on all 5 tables, correct constraints via live MCP query) and the Netlify deploy is verifiably in sync with `main` HEAD (live curl headers byte-match `next.config.mjs`).
- **T-INF-5** — full security header suite (CSP/HSTS/XFO/XCTO) live on `dealradar.me`, byte-identical to source.
- **T-SEO-3 / T-SEO-4** — AI-proof visible fields (90-day low, "Verified at HH:MM CET") and 14-tag hreflang/canonical both render correctly.
- **T-CMP-2 / T-CMP-4** — i18n key parity passes with 0 gaps across 13 locales, and cookie consent is genuinely opt-in with 0 non-essential cookies pre-consent.
- **T-PDP-5** — the dead `DealDetailModal` and its synthetic `productSizes` fabrication are fully deleted, not just fixed.

## The single most consequential finding

**T-ING-2 (G1 — affiliate credential approval) is still open**, and it is the true blocker the spec itself calls "the true M1 revenue blocker" (A-05). Every provider (`awin.ts`, `kelkoo.ts`, `tradedoubler.ts`, `strackr.ts`) is coded correctly and will flip to `isMock:false` the instant real credentials land in env — **no code changes are needed once approval happens** — but until then:
- `T-ING-4`, `T-ING-5`, `T-ING-7`'s live-data acceptance clauses cannot pass by construction.
- The whole revenue loop (`T-MON-4`, the "north-star proof" task) has never run even once — and can't, because `scripts/thin-loop-drill.mjs` (the script that would run it) **doesn't exist yet either**, independent of the credential gate.

## Where code is missing outright (not regressed — never started)

These 15 tasks have **zero code scaffolding** — not a partial attempt, not a stale claim, genuinely nothing:
`T-PDP-3` (curation overlay), `T-PDP-4` (editorial authoring), `T-ING-8` (cross-network EAN dedup), `T-ING-9` (commission-wins selector), `T-MON-3` (dead `affiliate_subid` never dropped), `T-MON-4` (thin-loop drill script), `T-MON-5` (reconciliation job), `T-MON-6` (payout_ready view — this one has *no* human gate blocking it and is trivial SQL, yet is unbuilt), `T-CMP-6` (consent audit log), `T-SEO-7` (related-deals internal linking), `T-SEO-8` (GSC index-coverage poll), `T-SEO-9` (AI citation probe), `T-SEO-10` (GSC Search Analytics feed), and **all 6 T-OPS-* tasks** (the entire Operator subsystem).

## Where "DONE" in the spec has quietly regressed or was never actually true

- **T-ING-10** (verifier hardening — incremental flush, deadline-stop, non-zero exit on errors, input escaping): **zero of 4 defects fixed** since the doc's original "defects open" note on 2026-07-09. No regression — it was never started, and still isn't.
- **T-ING-11** (hidden-deal lifecycle): 3 of 4 read-surfaces are correctly filtered, but the SSR PDP now **hard-404s hidden deals** instead of rendering the required `200 + OutOfStock` state — this is a direct, explicit contradiction of the acceptance criteria, introduced by this session's own PDP work (the `getDealBySlug` hidden-filter added defensive-in-depth but broke the "resolve, don't 404" requirement).
- **T-SEO-2**: JSON-LD `availability` is still the hardcoded literal `InStock` string (`page.tsx:97`) — the exact defect the task exists to close, unchanged since the spec was authored.
- **T-INF-10**: the anti-pattern the task was written to eliminate — silent `exit 0` / `200 OK` on a missing secret instead of alarming — is **still present verbatim** in both `refresh-deals.mts:11-14` and `db-migrate.yml`.

## Systemic gaps across nearly every area

1. **No CI pipeline exists at all.** `.github/workflows/ci.yml` has never existed in git history. No workflow runs `tsc`, `next build`, or `pnpm test` on any PR. `T-INF-4`, `NFR-REL-5`, and the stale-host CI grep-gate (`T-SEO-1`) all fail on this same root cause.
2. **Rate limiting covers 1 of 5 required endpoints.** Only `/api/alerts` is limited; `/api/refresh`, `/api/postbacks`, `/api/search`, `/api/deals` all accept unlimited requests (live-verified: 8 rapid `/api/deals` calls, 8×200).
3. **The observability substrate (T-OPS-1) doesn't exist**, which structurally blocks all 5 downstream Operator tasks and 3 NFR-OBS items — this is correct sequencing per the spec (Operator built last), not a defect, but it does mean the "manual-daily until M4" interim monitoring the spec calls for is *also* not happening (nothing to check daily, no signals exist).
4. **Cost guardrails are 100% unbuilt** — `checkBudgets()`, egress caps, and token-spend tracking are named across `NFR-COST-1/2/3` and don't exist anywhere.
5. **Postback webhook auth is missing its second factor.** The static-secret check works and is well-tested, but HMAC body signature + replay-guard (`NFR-SEC-4`) is entirely absent — a captured/replayed postback would currently succeed.

---

## Full per-task ledger

See the companion detail dump for file:line evidence and exact gap text per task (60 entries) and per sampled NFR (28 entries) — every verdict above traces to a specific citation, not a summary judgment.
