# Task Checklist — Version 3.1 (Platform Scope) — DRAFT
## Project: DealRadar — Autonomous, Geo-Located, Multilingual Affiliate Deals Platform for Europe

* **Status:** DRAFT — derives from and traces to the v3.1 [prd.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/prd.md) (`OBJ-1…OBJ-8`, Assumptions §4), [requirements.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/requirements.md) (`FR-*`/`NFR-*`), and [design.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/design.md) (`DSN-*`). Pending the same human confirmations (Assumptions Block, OBJ target numbers, human gates G1/G2/G3).
* **Version:** **v3.1 — post-merge reconciliation of the `91140c9..155cf06` code delta + the 2026-07-09 data-loss event; supersedes `2026-07-08_v3`; authored 2026-07-09.** _Grounding SHAs: code delta grounded on `155cf06` (the code tree); current branch HEAD is `b53bb3e` (docs-only restore commit)._ Also supersedes the `2026-06-23_v2/tasks.md` **and** folds in the `2026-06-28` Tier-1 remediation. New in v3.1: **T-INF-12 + T-DB-0 (M0 pre-gate), T-ING-10, T-ING-11 (M1), T-PDP-6, T-SEO-11 (M2)** — **60** tasks total, up from 54; **T-ING-6 rewritten and elevated to M0** (RSK-14). **Respects** the APPROVED url-slug rework — whose original files were destroyed by the 2026-07-09 pull (EVENT 3/RSK-13) and then **restored and COMMITTED at `b53bb3e`**: the authoritative references are `/Users/danielmanzela/DealRadar/docs/specs/url-structure/2026-07-08_v2/` (HANDOFF.md entry point + spec + plan/tasks + the 49→25 red-team register) and `tasks/plan.md`+`tasks/todo.md`, with `docs/recovered/2026-07-09/` as the secondary lossy cross-check. This checklist **references, never clobbers, and does not re-plan** that workstream (T-SEO-6 tracks its completion as the M2 gate).
* **Date:** 2026-07-09
* **Traceability:** Every `T-<AREA>-<n>` cites the `DSN-*` + `FR-*`/`NFR-*` it implements and the `OBJ-*` it serves. The Traceability note (§7) maps every one of the **61** DSN components (defined in design.md §3) to ≥1 task and lists intentional deferrals; design.md §7 gives the reverse FR/NFR→DSN matrix so orphan detection runs both directions. No orphans. (Two documented ID exceptions: **T-DB-0** is a deliberate out-of-area ID matching the 2026-07-09 audit-plan + url-slug chain `T-DB-0 → B1 → C2 → ingest re-merge → T-SEO-6 → E1/E2`; **T-INF-12** is a process task tracing to RSK-13 with no DSN.)

---

## 0. How to Read This Document

### 0.1 Task block format (binding on every task)

```
- [ ] T-<AREA>-<n>: <imperative description>
  - Traces: <DSN-id(s)> / <FR|NFR-id(s)> / <OBJ-id>
  - Type: DETERMINISTIC | AGENTIC | HUMAN-GATED (one-line why)
  - Acceptance: <measurable, testable condition — a number + a method>
  - Verify: <exact command/check: pnpm test / pnpm build / curl / SQL / RRT / GSC …>
  - Monitor: <the prod signal that proves it stays working — the agentic-SDLC hook>
  - Files: <paths, ≤5>
```

`AREA ∈ {ING, MON, PDP, SEO, INF, OPS, CMP}`. Task IDs are **area-scoped and stable** (`T-ING-1` keeps its number regardless of milestone); tasks are presented in **dependency order within each milestone**, so IDs are not globally sequential — follow order of appearance, not the number.

### 0.2 Executor guardrails

1. **No vibe coding.** Every change references a `T-*` ID and conforms to its `DSN-*`. No task touches **> 5 files**.
2. **Three-state honesty.** "Merged-on-branch ≠ deployed-to-prod ≠ verified-live." An **Acceptance** met on-branch is not met in prod until its **Verify** runs against `https://dealradar.me`.
3. **Verify before proceeding.** Do not tick a box without running its **Verify** and pasting the evidence into the PR.
4. **Mock fallback preserved.** No change may break the empty-`.env` build (T-INF-4). Mock output is **dev-only** and must never reach prod (T-ING-1).
5. **Monitor lands in M4.** Most **Monitor** hooks below name a signal the Operator watches; that substrate (`operator_signals`/`operator_incidents`, T-OPS-1) ships **last** (M4). Until then the Monitor is a manual check or a log line — the hook is pre-wired so the Operator can adopt it without re-instrumentation. **Interim monitoring procedure (not a deferred TODO):** until T-OPS-1 lands, each Monitor hook is checked manually by the **operator-on-call** at a stated cadence — **daily** for M0–M1 revenue-path signals (host regression, mock-rows, upserted, postback 401/FK-null, commission, 404-rate) and **weekly** for M2 SEO signals (index coverage, JSON-LD validity, rank/CTR, citations). The cadence + owner is the interim measurability contract; T-OPS-1 automates it.
6. **ASK FIRST on gates.** The three permanent human gates (G1 provider/brand approval, G2 legal sign-off, G3 payout/banking KYC) and **enabling any destructive prod cron** are marked **⛔ ASK FIRST**, mirroring the todo's D3 (`tasks/todo.md`, restored + committed at `b53bb3e`; secondary copy `docs/recovered/2026-07-09/tasks-todo.md`). Never self-authorize them.
7. **Never promise a literal 100%** (PRD §1.2). Reliability is an SLO + a degradation path.

### 0.3 Type legend

| Type | Meaning | Where it may run |
|---|---|---|
| **DETERMINISTIC** | Repeatable, predictable → coded pipeline / cron / SQL / pure function. **Default; preferred.** | anywhere |
| **AGENTIC** | Genuine judgment / ambiguity resolution → LLM (Anthropic via Vertex). Only the **4 sanctioned cases**: provider field-mapping, editorial copy, commission-dispute triage, novel-incident triage. | GH Action / external worker (never a daemon) |
| **HUMAN-GATED** | Legal/KYC/approval a machine cannot assume liability for — **G1/G2/G3**. | human, at the gate |

---

## Milestone M0 — Deploy & Data-Integrity Baseline _(prereq)_

> **Goal:** make prod actually run the branch, on the right host, with the migration applied and mock-writes impossible.
> **v3.1 pre-gate (2026-07-09):** two P0s introduced by merge `155cf06` block T-INF-1/T-INF-2 as-is. Ordered pre-gate tasks: **T-INF-12** (commit at-risk docs — executed FIRST) → **T-DB-0** (schema dedup) + **T-ING-6** (ingest restore) — all **BEFORE** T-INF-1/T-INF-2.
> **Exit criterion (gate):** prod `curl` of a remediated route = **200**; `grep dealradar.eu` in prod output = **0**; `pg_constraint` shows the FK + CHECKs; a refresh with **no live creds writes 0 rows**; _(v3.1)_ `schema.sql` defines `record_price_history` **exactly once**; `git diff main..HEAD -- scripts/ingest-awin.cjs` is **empty-or-superset**; `git status` shows **no untracked files** under `docs/`, `tasks/`, or `audit/` _(**satisfied 2026-07-09**: `b53bb3e` committed `docs/specs/`+`tasks/`; `7f0ffa9` committed both `ground_source_of_truth` suites, `docs/recovered/`, and `audit/2026-07-09_consolidation/`)_. _**Gate progress 2026-07-09:** single `record_price_history` definition ✓ (`c2d9794`), ingest diff-vs-main empty ✓ (`3ed5859`), no untracked docs ✓ (`7f0ffa9`). Remaining for M0 exit: the prod-facing clauses (curl 200, prod grep, `pg_constraint`, no-creds refresh writes 0) — all need T-INF-1/T-INF-2._

- [x] T-INF-12: Commit the at-risk ground-source-of-truth, recovered, and spec/plan doc trees to git — the **first task executed** (data-loss prevention; RSK-13 ALREADY OCCURRED on 2026-07-09). _**DONE 2026-07-09 at `7f0ffa9`** (17 files, 3,534 insertions: both gsot suites + docs/recovered + audit/2026-07-09_consolidation). Verify evidence: `git status --porcelain | grep -E '^\?\? (docs|tasks|audit)/'` → empty ✓. Residual untracked (out of scope, tooling): `.agents/`, `.claude/skills/`, `.mcp.json`, `skills-lock.json`._
  - Traces: RSK-13 / OBJ-6 (docs-integrity; process task — no DSN by design, documented exception)
  - Type: DETERMINISTIC (git add + commit of untracked doc trees; nothing destructive).
  - Acceptance: `git status` shows **no untracked files** under `docs/`, `tasks/`, or `audit/`. _(Already committed at `b53bb3e`: `docs/specs/url-structure/2026-07-08_v2/` + `docs/specs/url-structure/README.md` + `tasks/plan.md` + `tasks/todo.md`.)_ The **actual remaining untracked set** to commit on `feat/tier1-remediation-2026-06-28`: `docs/ground_source_of_truth/2026-07-08_v3/` (frozen) AND `docs/ground_source_of_truth/2026-07-09_v3.1/` (this suite), `docs/recovered/2026-07-09/`, and `audit/2026-07-09_consolidation/` ({findings,audit-plan}.md — the provenance corpus every CHANGELOG driving-finding cites); the v3.1 suite lands in the same change. (Docs-only commit — the >5-file rule of §0.2.1 is waived as a documented exception.)
  - Verify: `git status --porcelain | grep -E '^\?\? (docs|tasks|audit)/'` → empty; `git log -1 --stat` shows the doc trees.
  - Monitor: CI/pre-pull check for untracked files under `docs/`+`tasks/`+`audit/`; alert on any untracked spec artifact (DSN-OPS-2, M4; manual-daily until then per §0.2.5).
  - Files: docs/** , audit/** (docs-only exception; tasks/ already committed at b53bb3e)

- [ ] T-DB-0: ⛔ **P0** — delete the duplicate `record_price_history()` from `supabase/schema.sql`, unifying to **ONE** day-aware, currency-carrying, NULL-safe definition — BEFORE any schema apply or any merge to main. _**On-disk fix DONE 2026-07-09 at `c2d9794`**: single definition (grep = 1) with `IS DISTINCT FROM` + `of sale_price` folded in; duplicate block deleted (tombstone comment); db-migrate.yml pre-apply single-definition guard added and tested both ways. **Keep unticked:** the staging price-changing-upsert drill and the prod `prosrc`/`price_history`-shape probes (before/after apply) remain — prod DB shape still UNKNOWN._
  - Traces: DSN-ING-6 / FR-ING-7 / OBJ-2 (unblocks T-INF-1, T-ING-5 and url-slug B1; RSK-14). _ID note: `T-DB-0` is a deliberate out-of-area ID matching the 2026-07-09 audit-plan and the url-slug chain `T-DB-0 → B1 → C2 → ingest re-merge → T-SEO-6 → E1/E2`._
  - Type: DETERMINISTIC (surgical SQL deletion + a CI single-definition guard).
  - Acceptance: `schema.sql` defines `record_price_history` **exactly once** — the day-based body (`:146-159`: inserts `product_id, day, sale_price, original_price, currency` with `ON CONFLICT (product_id, day)`); the remediation duplicate (`:250-265`, which omits `day` — PK member, NOT NULL, no default — and `currency` — NOT NULL — and whose trigger `:267-270` wins) is **deleted at `:249-270`**, or its `IS DISTINCT FROM` guard folded into def#1; a `sale_price`-changing upsert **succeeds** (no 23502) and lands one `(product_id, current_date)` row with `currency`; a CI guard asserts one `CREATE OR REPLACE` per function/trigger name in `schema.sql`.
  - Verify: grep count of `function record_price_history` definitions in `supabase/schema.sql` = 1 ✓; staging apply → price-changing upsert → +1 day row (pending, runs with T-INF-1); `select prosrc from pg_proc where proname='record_price_history'` contains `ON CONFLICT (product_id, day)` — **BEFORE-probe DONE 2026-07-10 (Supabase MCP): the function does NOT EXIST in prod at all (zero user triggers) — the broken schema never reached prod, so the on-disk fix fully closes the risk; `price_history` is already day-keyed. AFTER-probe runs with T-INF-1.**
  - Monitor: the single-definition CI grep guard (RSK-14); note `db-migrate.yml` auto-applies `schema.sql` on any push to main touching it — **do NOT merge to main until this lands**.
  - Files: supabase/schema.sql, .github/workflows/db-migrate.yml

- [ ] T-ING-6: ⛔ **P0** — restore **main's** `scripts/ingest-awin.cjs` + `.github/workflows/ingest-awin.yml` (silently reverted to their `91140c9` bodies by merge `155cf06` — RSK-14), then run the AWIN bulk-feed daily Action as a live source with an egress cap. _(Rewritten + elevated from M1 in v3.1; live-feed activation still gates on T-ING-2/G1 creds and completes in M1.)_ _**Restore half (M0) DONE 2026-07-09 at `3ed5859`**: `git diff main..HEAD` on both files = empty ✓; merchant_url/gallery/description + fetchExistingPrices preservation + stale-hide + flag/snapshot workflow steps verified present; scripts syntax-checked. **Diff-review finding:** main's version composes NO deal slug (D11-conformant) — non-null slugs rely on the `deals_set_slug` trigger backstop, making T-INF-1's schema apply **load-bearing** before this ingest runs against a DB lacking the trigger. **Keep unticked:** the M1 live-feed clauses (creds, `upserted > 0`, egress cap, dry-run) gate on T-ING-2/G1._
  - Traces: DSN-ING-10, DSN-ING-12 (flag re-wire) / FR-ING-2, FR-ING-6, FR-ING-13, NFR-COST-2 / OBJ-2
  - Type: DETERMINISTIC (git restore + RFC-4180 stream parse + batched REST upsert on a GH Action cron).
  - Acceptance: **(restore, M0)** HEAD's two files are re-merged from main (`git checkout main -- scripts/ingest-awin.cjs .github/workflows/ingest-awin.yml`), verified to retain the remediation slug/discount guards; new AWIN rows carry `merchant_url`+`gallery`+`description` (without them new products are permanently unverifiable — the verifier selects `merchant_url=not.is.null`); a **verifier-corrected price is NOT overwritten by the next ingest** (main's `fetchExistingPrices` preservation — closes the daily 03:00→05:00 clobber window, e.g. Kuishi GBP-as-EUR); **stale-hide** restored (feed-dropped 3+ days → hidden); the workflow re-runs `flag-homepage-hidden` + the post-ingest snapshot step. **(live feed, M1, creds)** the daily Action upserts > 0 real rows with `ean_code`, egress ≤ ~300 MB, a dry-run without `--upsert` writes 0.
  - Verify: `git diff main..HEAD -- scripts/ingest-awin.cjs .github/workflows/ingest-awin.yml` = **empty-or-superset**; run `ingest-awin.yml` (staging creds) → logs `upserted N>0`; seed a verifier correction → it survives the next feed run.
  - Monitor: AWIN `upserted` count + feed egress vs cap; _(v3.1 §8.2)_ count of price rows overwritten by feed within 24 h of a verifier correction; alert on 0-yield or egress breach (DSN-INF-9/OPS-2, M4).
  - Files: scripts/ingest-awin.cjs, .github/workflows/ingest-awin.yml (note: scripts/flag-homepage-hidden.cjs is re-wired by the workflow step)

- [ ] T-SEO-1: Pin `NEXT_PUBLIC_APP_URL=https://dealradar.me`, add a CI grep-gate on stale hosts, and patch on-disk `.eu`/`.app` fallbacks (incl. robots `Sitemap:` host).
  - Traces: DSN-SEO-5, DSN-SEO-7 (robots host) / FR-SEO-5, FR-SEO-7, NFR-SEO-2 / OBJ-5
  - Type: DETERMINISTIC (env pin + build-failing grep gate + literal patch; the env-pin overlaps in-flight url-slug A2, and `robots.ts` consolidation is owned by url-slug C6 — reference the recovered spec, don't re-plan it).
  - Acceptance: `grep -rE 'dealradar\.(eu|app)' src public` = 0 _(v3.1: today this catches the three LIVE `.eu` fallbacks the merge added — `sitemap.ts:6`, `deal/[slug]/page.tsx:20`, `alerts.repo.ts:100`)_; `robots.ts` base = `NEXT_PUBLIC_APP_URL` (NOT `process.env.URL`, `robots.ts:3`); **one shared `baseUrl()` helper** (throw in prod when unset) used by all four call sites; `public/robots.txt` **removed** (shadowed dead weight with a `.eu` Sitemap line); the CI gate also greps `process.env.URL` outside netlify functions; Netlify env shows `NEXT_PUBLIC_APP_URL=https://dealradar.me`; a prod PDP's canonical + JSON-LD `url` + `/sitemap.xml` all show `dealradar.me`; _(v3.1, FR-SEO-7)_ the three **AI-bot Allow rule groups** (OAI-SearchBot, PerplexityBot, Google-Extended) are ported from the shadowed `public/robots.txt` into `robots.ts` `rules[]` **before** that file is deleted — verified-live missing on prod today, and no other task owns them. _(Note: the corrected `.me` fallback currently lives only in the dead `src/lib/email/unsubscribe.ts:28-30` — salvage its `siteOrigin()` into the shared helper, see T-CMP-7.)_
  - Verify: CI grep-gate fails the build on any stale literal; `curl -s https://dealradar.me/<pdp>` view-source shows `dealradar.me` canonical; `curl https://dealradar.me/robots.txt` Sitemap line = `dealradar.me`.
  - Monitor: host-regression watch — alert if `dealradar.eu` appears in prod output or the env unsets (RSK-2; adopts DSN-OPS-2, M4).
  - Files: src/app/robots.ts, src/app/sitemap.ts, src/app/[locale]/deal/[slug]/page.tsx, src/lib/db/alerts.repo.ts, public/robots.txt (delete)

- [ ] T-ING-1: Build the mock-pollution write gate — an `isMock` provider's synthetic rows can never upsert to prod.
  - Traces: DSN-ING-4 / FR-ING-5 / OBJ-2 (protects OBJ-1/OBJ-5)
  - Type: DETERMINISTIC (pre-upsert filter keyed on `isMock` + prod detection).
  - Acceptance: a refresh with empty creds writes **0** rows (row-count delta = 0); `SELECT count(*) FROM deals WHERE source IN (<mock providers>)` = 0 in prod; `assertNotMock(deals,{isProd:true})` drops mock rows and throws-to-log if any slip through.
  - Verify: unit — `assertNotMock(mockDeals,{isProd:true})` → `[]`; integration — an empty-cred refresh asserts a 0-row delta.
  - Monitor: `mock_rows_written` = 0 per cycle (RSK-4; DSN-OPS-2, M4).
  - Files: src/lib/db/deals.repo.ts, src/app/api/refresh/route.ts, src/lib/providers/registry.ts, src/lib/db/deals.repo.test.ts

- [ ] T-INF-1: Apply the remediation + on-disk schema migration to the **prod** Supabase DB (A-07) via the allow-listed idempotent runner. _**DB half DONE 2026-07-10** — applied via Supabase MCP `apply_migration` as `v3_1_remediation_layer_baseline` (starts migration-history tracking; `schema_migrations` row recorded). Pre-flight: server-side snapshot `backup_20260710` (835/8/2406 rows, drop after T-INF-2 verifies); slug-collision pre-check = 0/835. Post-apply contract test (`scripts/db-verify.mjs` tiers, run via MCP): **shape 15/15, semantics 6/6 (slug auto-compose, one-snapshot-per-day conflict-update, non-price patch no-fire, tx idempotency, RPC), retrieval 8/8, zero probe residue** — and 803 deals now carry `historical_low_price`. **Keep unticked:** the deploy-facing clauses (prod curl via `db-migrate.yml` path, re-apply-idempotency in CI) close with T-INF-2, which is now UNBLOCKED._
  - Traces: DSN-INF-6, DSN-MON-3, DSN-ING-6, DSN-INF-10 (indexes) / FR-INF-6, FR-MON-3, FR-ING-7, NFR-SEC-2 / OBJ-6 (unblocks OBJ-2/OBJ-3)
  - Type: DETERMINISTIC (CI + `psql ON_ERROR_STOP=1`; additive & idempotent, so no ASK-FIRST, but it is a prod DB mutation — run via `db-migrate`, not by hand). **⛔ v3.1 precondition: T-DB-0 first — as merged, `schema.sql` is the P0 carrier, and `db-migrate.yml:11-17` auto-applies it on any push to main touching it: the break would self-deploy. Do NOT merge `schema.sql` to main until the duplicate block (`:249-270`) is deleted.** _(T-DB-0's on-disk fix landed at `c2d9794`.)_ **Probe results 2026-07-10 (Supabase MCP, findings §7): prod is main-lineage-only — 3 tables, 1 function (`distinct_brands`), ZERO triggers; it lacks `deals.slug` + all metadata columns, the ENTIRE `transactions` table, `price_alerts.locale`, and every function/trigger/index this task applies. `price_history` is already day-keyed (the guarded-migration clause is a verify-only no-op, P1-A moot). Consequently this task's apply is a large but purely-additive delta — and it MUST land BEFORE T-INF-2: the branch build writes `slug`/`ean_code` (PGRST204 → every upsert fails) and reads `.eq('slug')` (→ every PDP errors) against today's prod schema.**
  - Acceptance: `db-migrate` job exits 0; prod `pg_constraint` holds `transactions_product_id_fkey` + `_commission_chk` + `_status_chk`; `slug NOT NULL`; `pg_trigger` shows `record_price_history`; RPC `update_historical_lows_batch` present; `pg_policies` shows RLS on all tables; `deals_public_id_idx`/`deals_ean_idx` present; _(v3.1)_ `schema.sql` defines each function/trigger **exactly once** (`record_price_history` count = 1); prod `pg_proc.prosrc` for `record_price_history` contains `ON CONFLICT (product_id, day)` (the trigger-presence check alone passes even with the broken body); prod `price_history` has the `day`+`currency` columns via an **explicit guarded old→new migration** — NOT create-if-not-exists reliance (`:118` silently keeps a remediation-era shape, then `snapshot-prices` 400s and `/api/price-history` 500s).
  - Verify: run `.github/workflows/db-migrate.yml` against prod; `SELECT conname FROM pg_constraint WHERE conrelid='public.transactions'::regclass`; re-apply → no error (idempotent); _(v3.1)_ the `prosrc` + `information_schema.columns` probes **before AND after** apply — the prod DB's current shape is UNKNOWN, probe first (three-state).
  - Monitor: constraint-presence probe — alert if a constraint disappears (migration drift, RSK-3; DSN-OPS-2, M4).
  - Files: .github/workflows/db-migrate.yml, scripts/apply-schema.mjs, supabase/schema.sql

- [ ] T-INF-2: Deploy the `feat/tier1-remediation-2026-06-28` build (branch HEAD — `b53bb3e` at authoring; `155cf06` is the code tree) to prod Netlify — close the merged≠deployed gap.
  - Traces: DSN-INF-1 / FR-INF-1, NFR-REL-1 / OBJ-6
  - Type: DETERMINISTIC (Netlify build+deploy of the branch). **⛔ v3.1 precondition (A-02): deploying HEAD as-is is BLOCKED by the two `155cf06` P0s — T-DB-0 (schema dup) and T-ING-6 (ingest revert) must land first, else the deploy ships the price-clobber/no-merchant_url regression and a merge to main self-applies the broken schema.** _(Both landed 2026-07-09: `c2d9794`, `3ed5859`.)_ **⛔ HARD ORDER (2026-07-10 probe, findings §7): T-INF-1 strictly BEFORE this task — prod's schema has no `slug` column and no `transactions` table; the branch build's `toRow()` upserts and `getDealBySlug` reads fail against it (site-down class), while the reverse order is safe (schema.sql is additive; the current deployed build ignores the new objects).**
  - Acceptance: `curl -s -o /dev/null -w '%{http_code}' https://dealradar.me/api/deals` = 200; deployed commit SHA == branch HEAD (`b53bb3e` at authoring; `155cf06` is the code tree — any later HEAD supersedes both); a remediated route (e.g. a seeded `/de/deal/*`) returns 200, not the stale build's 404.
  - Verify: Netlify deploy log shows the branch SHA; curl the remediated route on `dealradar.me` (not a preview).
  - Monitor: uptime probe on `/api/deals` + deploy-SHA-drift check (DSN-OPS-1, M4).
  - Files: netlify.toml

- [ ] T-INF-3: Verify Netlify's real serverless function ceiling and add a chunk/background-offload path for the refresh fan-out.
  - Traces: DSN-INF-2, DSN-ING-9 / FR-INF-2, FR-ING-11, NFR-SCALE-1 / OBJ-6
  - Type: DETERMINISTIC (measurement + config + bounded chunking; `maxDuration=300` is only a Next.js hint).
  - Acceptance: a measured full-matrix (country × category) refresh completes with **no function timeout**; if the ceiling < needed, fan-out is chunked to ≤ N tasks/invocation or offloaded to a GH Action; the false "15-min" docstrings are corrected to the true daily cadence.
  - Verify: timed synthetic full-matrix refresh records duration < the verified ceiling with no 5xx/timeout; `grep "15 min" src/app/api/refresh` = 0; _(v3.1)_ `grep -n '15 min' netlify/functions/refresh-deals.mts` = 0 after the fix (today `refresh-deals.mts:2` says "every 15 minutes" vs `config.schedule '0 6 * * *'` at `:33` — anyone deriving alert latency from the comment is off ~96×); document the deliberate cron ordering **03:00 ingest → 05:00 verify+snapshot+purge → 06:00 refresh** as the cadence.
  - Monitor: refresh fn duration p95 + timeout count (RSK-8; DSN-OPS-2, M4).
  - Files: src/app/api/refresh/route.ts, netlify/functions/refresh-deals.mts, src/lib/providers/registry.ts

- [ ] T-INF-4: Add the empty-env graceful-degradation build/test gate to CI (exit 0 with no secrets).
  - Traces: DSN-INF-3 / FR-INF-10, NFR-REL-3, NFR-REL-5, NFR-PERF-1 / OBJ-6
  - Type: DETERMINISTIC (CI gate over the null-safe clients).
  - Acceptance: `pnpm build` with an empty `.env` exits 0; providers log mock warnings; no navigation crash; a 2nd identical `/api/deals` returns `cached:true` when Upstash is set.
  - Verify: CI job runs a clean-env `pnpm build` → exit 0; `pnpm test` (slug/crypto/affiliate/dedup) → exit 0.
  - Monitor: CI status as a release gate; build-health signal (DSN-OPS-2, M4).
  - Files: .github/workflows/ci.yml, package.json

- [ ] T-INF-11: Establish the data-durability / DR posture — verified DB backup + a restore drill + a migration-rollback convention.
  - Traces: DSN-INF-11 / FR-INF-12, NFR-REL-6 / OBJ-6
  - Type: DETERMINISTIC (backup config verification + a scripted restore drill; the idempotent full-file migration runner (T-INF-1) has no versioning/rollback, so a reversible-migration convention is documented alongside it).
  - Acceptance: Supabase **PITR/backup is enabled** for the prod project (deals/transactions/price_history/price_alerts); a **restore drill** recovers a staging clone to a chosen point-in-time; a forward-only migration carries a documented rollback (or a reversible-migration convention); a **`db-restore`** fault class is registered in the game-day set (T-OPS-6).
  - Verify: confirm PITR enabled in the Supabase dashboard/API; run a staging restore drill and assert row-counts recover; grep the migration-rollback note in `supabase/schema.sql`/runbook.
  - Monitor: backup-freshness + last-successful-restore-drill age; alert if backups lapse or a drill hasn't run within the review window (DSN-OPS-2, M4).
  - Files: supabase/schema.sql, scripts/restore-drill.mjs, .github/workflows/db-migrate.yml

---

## Milestone M1 — Thin Revenue Loop

> **Goal:** earn once — one country, one live feed, indexed PDPs, one real postback. The genuine thin vertical slice: `live feed → indexed PDP → clicked subID → captured postback → ledger`.
> **Exit criterion (gate):** `deals.source <> 'mock'` count **> 0** for the launch country; **≥ 50** PDPs (SC3, provisional) return 200 + valid JSON-LD; **≥ 1 postback persisted with a recovered `product_id`** (SC4) (and, gated on A-05, ≥ 1 approved commission).

- [ ] T-ING-2: ⛔ **ASK FIRST (G1)** — obtain affiliate/brand approval + credentials for one launch-country provider (A-03/A-05).
  - Traces: DSN-ING-1, DSN-ING-8 / FR-ING-1, FR-ING-10 / OBJ-1, OBJ-2
  - Type: HUMAN-GATED (G1) — provider/brand approval + KYC is a contractual act a machine cannot grant; this is the true M1 revenue blocker.
  - Acceptance: one provider (AWIN **or** Kelkoo per A-03) shows an "approved" program + live credentials set in Netlify env; `init()` reports `isMock:false` for it.
  - Verify: `initProviders()` health map shows `ok:true, isMock:false` for the approved provider; a single live fetch returns > 0 raw records.
  - Monitor: feed-health — alert if the live provider reverts to `isMock` (credential expiry).
  - Files: (none — provider console approval + Netlify env)

- [ ] T-ING-3: First-activation field-mapping verification for the credentialed provider (before trusting it at scale).
  - Traces: DSN-ING-8 / FR-ING-10 / OBJ-2 (feeds OBJ-1)
  - Type: AGENTIC — mapping an undocumented/"best-effort" provider payload to `NormalizedDeal` is a one-time judgment call per provider (deterministic thereafter); deterministic fallback = provider stays mock-gated + 0-yield alert.
  - Acceptance: the first live fetch yields **> 0** normalized deals with `name+price+link` populated (`ean` where supplied), `isMock:false`; a human confirms the proposed field map on first run.
  - Verify: staging activation harness asserts ≥ 1 real product maps end-to-end; `provider_first_yield > 0`.
  - Monitor: alert if a newly-live provider yields **0** normalized deals across a cycle (masked-failure, RSK-11).
  - Files: src/lib/providers/<provider>.ts, scripts/verify-provider-mapping.mjs

- [ ] T-ING-4: Verify the live ingestion path writes real, deduped, non-mock, non-null-slug rows for the launch country.
  - Traces: DSN-ING-1, DSN-ING-2, DSN-ING-3, DSN-ING-5 / FR-ING-1, FR-ING-2, FR-ING-3, FR-ING-6 / OBJ-2 (feeds OBJ-1)
  - Type: DETERMINISTIC (route → normalize+clamp → dedup → non-null-slug upsert; slug ownership moves to the trigger later via the in-flight url-slug D1/D2).
  - Acceptance: post-refresh `count(*) FROM deals WHERE source<>'mock'` > 0 for the launch country; **0** rows with `discount_percent NOT BETWEEN 0 AND 100`; **0** rows with `slug IS NULL`; the per-cycle `rawDeals→deduped` collapse ratio is logged, with deduped ≤ raw and > 0 rows removed on a known-duplicate fixture (0 on a duplicate-free fixture).
  - Verify: `pnpm test` `registry.test.ts` (EAN survivor / name+merchant fallback / price-tie→priority / survivor `product_id`) green; an integration refresh logs `upserted N>0` + the dedup ratio; SQL null-slug count = 0.
  - Monitor: per-source `upserted`, dedup-ratio drift, staleness ≤ 26 h (DSN-OPS-2, M4).
  - Files: src/lib/providers/registry.ts, src/lib/db/deals.repo.ts, src/lib/providers/types.ts

- [ ] T-ING-5: Verify the price-history trigger + historical-low batch RPC populate after go-live (feeds the proof field).
  - Traces: DSN-ING-6 / FR-ING-7, FR-PDP-5 / OBJ-2 (feeds OBJ-4/OBJ-5)
  - Type: DETERMINISTIC (DB trigger + scheduled RPC; real only post-migration T-INF-1).
  - Acceptance: _(v3.1 pre-req)_ `schema.sql` carries **ONE** `record_price_history` definition (T-DB-0 — the on-disk P0 makes this task's original acceptance unrunnable: the trigger aborts the upsert instead); a **guarded old→new `price_history` migration** exists (if the prod table lacks the `day` column: add `day`/`currency`, backfill `day = recorded_at::date`, dedupe to one row per product/day, swap the PK — or rename-aside; ⛔ **ASK FIRST**: the path choice, ALTER-in-place vs rename-aside, is a **human decision taken only after the prod-shape probe** — audit-plan sequencing note 3); an upsert changing `sale_price` inserts **exactly one** `(product_id, current_date)` row with `currency` (same-price/same-day → none); the snapshot batch POST returns 2xx (not 400) post-migration (the second writer, `snapshot-prices.cjs`, bypasses the trigger via direct REST); after ~30 cycles `deals.historical_low_price` non-null coverage **reaches ≥ 60% (A-11)**, measured by `count(historical_low_price IS NOT NULL)::float / count(*)`.
  - Verify: SQL — upsert a price change → +1 `price_history` row; run `update_historical_lows_batch(90)` → `historical_low_price` populated for active products; _(v3.1)_ `select prosrc from pg_proc where proname='record_price_history'` shows the day-based body; the stale header comment `snapshot-prices.cjs:3` ("Runs twice a day from the workflows" — false at HEAD, where only `verify-awin.yml` runs it) is corrected to the actual wiring (true again once T-ING-6 restores the post-ingest step).
  - Monitor: historical-low fill-rate trend + RPC success in refresh logs; alert on RPC error or fill-rate stall; _(v3.1 §8.2)_ `price_history` rows written = 0 for a UTC day while visible deals > 0 (DSN-OPS-2, M4).
  - Files: supabase/schema.sql, src/lib/db/deals.repo.ts, src/app/api/refresh/route.ts, scripts/snapshot-prices.cjs, .github/workflows/verify-awin.yml

> _(v3.1 note: **T-ING-6** — the AWIN bulk-feed task — was rewritten and elevated to **M0** as the ingest-restore P0; its live-feed activation clauses complete here in M1 once T-ING-2/G1 creds exist. See M0.)_

- [ ] T-ING-10: _(new v3.1)_ Harden the live-shop **verifier** — incremental write flush, deadline-stop, non-zero exit over the error threshold, input escaping.
  - Traces: DSN-ING-11 / FR-ING-12 / OBJ-2
  - Type: DETERMINISTIC (scripted crawl + fixed rules; NOT one of the 4 sanctioned agentic components).
  - Acceptance: the verifier flushes writes incrementally (~every 50 decisions) instead of only after the full crawl (`verify-awin.cjs:288-289`); a `--deadline` stop-to-write path survives the workflow's 30-min timeout (`verify-awin.yml:31`); the job exits **non-zero** when `errors/done` > 80% (today exit 0 even at 100% errors, `:251,:291`); `product_id`s are escaped/rejected unless matching `[\w:.-]` before the `in.()` filter (`:210` unescaped quotes).
  - Verify: kill a run mid-crawl → decisions made so far are persisted; a fixture run with > 80% simulated errors exits non-zero; a quote-bearing `product_id` cannot break the filter.
  - Monitor: _(v3.1 §8.2)_ verifier `errors/done` > 80%; `price_history` rows written = 0 for a UTC day while visible deals > 0 (a failed verify job skips the day's only snapshot); manual-daily until DSN-OPS-2 (M4).
  - Files: scripts/verify-awin.cjs, .github/workflows/verify-awin.yml

- [ ] T-ING-11: _(new v3.1)_ Close the `hidden`/`homepage_hidden` lifecycle gaps — the three missing read-surface filters + the automated flag re-sync.
  - Traces: DSN-ING-12 / FR-ING-13, FR-CMP-8 (no-alert-on-hidden), FR-SEO-1 (honest state) / OBJ-2, OBJ-5
  - Type: DETERMINISTIC (query filters + a workflow step).
  - Acceptance: `getAllDealSlugs` excludes `hidden=true` (sitemap); the SSR PDP renders the honest expired/`OutOfStock` state for hidden deals — never `InStock`, never a live CTA (per the FR-SEO-1 design note; resolve, don't 404); `getRecentlyUpdatedDeals` (or `notifyPriceDrops`) excludes `hidden=true` (alerts); `scripts/flag-homepage-hidden.cjs` runs from an automated post-ingest step (restored `ingest-awin.yml` or `verify-awin.yml`).
  - Verify: SQL/grep: the three read paths carry the filter (mirror `dealsByIds` at `deals.repo.ts:234`); render a hidden deal → 200 + `OutOfStock` JSON-LD + disabled CTA; a hidden deal in the alert window → 0 dispatches; the workflow log shows the flag step.
  - Monitor: _(v3.1 §8.2)_ sitemap contains any `hidden=true` slug → breach; manual-daily until DSN-OPS-2 (M4).
  - Files: src/lib/db/deals.repo.ts, src/app/[locale]/deal/[slug]/page.tsx, scripts/flag-homepage-hidden.cjs, .github/workflows/ingest-awin.yml

- [ ] T-PDP-1: Verify the SSR PDP renders real launch-country deal data (200) and 404s unknown slugs, within the CWV budget.
  - Traces: DSN-PDP-1 / FR-PDP-1, NFR-PERF-2 / OBJ-4 (feeds OBJ-5/OBJ-1)
  - Type: DETERMINISTIC (SSR from a DB read; renders whatever is in `deals`, mock-gated until T-ING-2 creds).
  - Acceptance: ≥ 95% of sampled `/de/deal/*` return **200** with a non-empty H1 + price; a bogus slug → `notFound()` (404); a sampled PDP has LCP < 2.5 s, CLS ≈ 0; _(v3.1, FR-PDP-1)_ `DealCard` emits **no href that 404s** — drop or resolve the `deal.slug \|\| slugify(productName)` fallback (`DealCard.tsx:27`), which today mints links the resolver can't match; this S-effort fix must NOT wait for the M2 url-slug task (T-SEO-6 covers the site as a D11 slug-composition site later, but the 404-link class needs a pre-M2 owner).
  - Verify: render a seeded live deal → 200 + fields; bogus slug → 404; Lighthouse LCP/CLS on the PDP; a card whose deal row lacks `slug` renders no minted-404 href.
  - Monitor: `/deal/*` 404-rate + CWV field data (GSC/CrUX; DSN-OPS-2, M4).
  - Files: src/app/[locale]/deal/[slug]/page.tsx, src/components/deals/DealCard.tsx

- [ ] T-SEO-2: Verify `Product`+`AggregateOffer` JSON-LD emits **0** Rich Results errors on live PDPs (closes SC5).
  - Traces: DSN-SEO-2 / FR-SEO-2, NFR-SEO-3 / OBJ-5
  - Type: DETERMINISTIC (structured output from data; `gtin`/`brand` conditional on non-null EAN/brand).
  - Acceptance: Google Rich Results Test = **0 errors** on a live deal page across 3 sampled locales; `lowPrice/highPrice/offerCount/itemCondition(NewCondition)/availability` present; `gtin`/`brand` emitted when non-null; _(v3.1, SC5 carry)_ `availability` **derives from deal state** — `hidden`/expired → `OutOfStock`, never the hardcoded `InStock` constant (`deal/[slug]/page.tsx:73,79`); JSON-LD `description` uses `deal.description` when present.
  - Verify: RRT on a live `dealradar.me` PDP; assert the JSON-LD block in view-source.
  - Monitor: JSON-LD-validity signal + GSC "Merchant listings" valid-item count; alert on a validity drop (DSN-OPS-2, M4).
  - Files: src/app/[locale]/deal/[slug]/page.tsx

- [ ] T-SEO-3: Verify AI-proof visible fields (90-day low, relative price, "Verified at HH:MM CET") render when data is present, and never fabricate. _(v3.1 status: **implemented merged-on-branch at `155cf06`** — 90-day-low line + verified-at time render on the PDP, `deal/[slug]/page.tsx:95-104`, silently dropping when null. Keep unticked: the Verify — view-source non-CSS-hidden + CET-not-UTC timestamp — still has to run against `dealradar.me` post-deploy.)_
  - Traces: DSN-SEO-3 / FR-SEO-3 / OBJ-5
  - Type: DETERMINISTIC (templated from `historical_low_price`/`last_updated`).
  - Acceptance: view-source shows the proof text **non-CSS-hidden** on PDPs where `historical_low_price` is non-null; timestamp in CET; the line **silently drops** (never fabricated) when the low is null.
  - Verify: render a seeded deal with a known low → the proof line + timestamp appear; render one with a null low → no fabricated low.
  - Monitor: % of live PDPs where the low-price line renders (couples to T-ING-5 fill-rate; DSN-OPS-2, M4).
  - Files: src/app/[locale]/deal/[slug]/page.tsx

- [ ] T-SEO-4: Verify per-deal canonical + 13-locale `hreflang` + `x-default` on PDPs. _(v3.1 status: **implemented merged-on-branch** — PDP `generateMetadata` emits canonical + 13-locale hreflang + `x-default` with 404-in-metadata, `deal/[slug]/page.tsx:25-46`. Keep unticked: the 14-alternate-tag Verify and the GSC hreflang check remain; hreflang hosts inherit the `.eu` fallback until T-SEO-1 lands.)_
  - Traces: DSN-SEO-4 / FR-SEO-4 / OBJ-5
  - Type: DETERMINISTIC (coded `generateMetadata`; category-page hreflang is deferred to M2 via url-slug C7).
  - Acceptance: view-source shows a per-page canonical + **14** alternate tags on deal pages; GSC International Targeting = 0 hreflang errors.
  - Verify: assert 14 `alternate` link tags per deal page.
  - Monitor: GSC hreflang-error count (DSN-OPS-2, M4).
  - Files: src/app/[locale]/deal/[slug]/page.tsx

- [ ] T-MON-1: Verify outbound subID decoration is lossless and network-correct on every CTA.
  - Traces: DSN-MON-1 / FR-MON-1, NFR-PRIV-1 / OBJ-3 (feeds OBJ-1)
  - Type: DETERMINISTIC (a fixed subID grammar; pure, tested functions).
  - Acceptance: a sampled outbound `href` carries the correct per-network param (Kelkoo `custom1` / AWIN `clickref` / Tradedoubler `epi`) + the encoded `productId`; `decodeSubId(buildSubId(x)) === x`; _(v3.1)_ **every `decorateAffiliateUrl` call site** passes `(shopUrl, source, country, category, productId)` — the test enumerates call sites — OR country/category/productId are refactored into one options object so the arg-order class of bug is impossible. _(The hex round-trip layer is built + unit-tested and the alert-email CTA is correctly decorated; but the dead modal passes `productId` in the COUNTRY slot (`DealDetailModal.tsx:35`) → subid `dealradar_<productId>_gen_`, `decodeSubId → productId:null` — total attribution loss if ever wired. Fix or delete, see T-PDP-6.)_
  - Verify: `pnpm test` `affiliate.test.ts` round-trip + per-network param-map cases green; call-site enumeration test green.
  - Monitor: % of outbound clicks carrying a `dealradar_` subID via network click reports (DSN-OPS-2, M4).
  - Files: src/lib/utils/affiliate.ts, src/components/deals/DealDetailModal.tsx (fix or delete)

- [ ] T-MON-2: Harden the postback webhook — add an HMAC body signature + replay guard beyond the query-param secret.
  - Traces: DSN-MON-2 / FR-MON-2, NFR-SEC-1, NFR-SEC-4 / OBJ-3 (feeds OBJ-1)
  - Type: DETERMINISTIC (timing-safe secret + status-enum normalize + `commission≥0` + subID→`product_id` + FK-null fallback + HMAC/replay + idempotent upsert).
  - Acceptance: valid secret+signature → `{persisted:true}` + row; wrong secret → 401; tampered/replayed body → rejected; negative commission → 400; unknown status → `pending`; repeated `transaction_id` → idempotent.
  - Verify: postback-route tests per branch + HMAC/replay + idempotency; curl matrix (valid/invalid/negative).
  - Monitor: 401-rate, FK-null-fallback count, null-recovery %, rejected-postback count; alert on a spike (DSN-OPS-2, M4).
  - Files: src/app/api/postbacks/route.ts, src/lib/utils/crypto.ts, src/app/api/postbacks/route.test.ts

- [ ] T-MON-3: Reconcile the dead attribution plumbing — drop `deals.affiliate_subid`; wire-or-drop `subid3`.
  - Traces: DSN-MON-4 / FR-MON-4 / OBJ-3
  - Type: DETERMINISTIC (a data-contract cleanup; subID is a render-time computation, never stored).
  - Acceptance: no field is written on one side and read-with-guaranteed-null on the other; `deals.affiliate_subid` dropped; `subid3` is set outbound **iff** read inbound.
  - Verify: grep — `subid3` set iff read; `affiliate_subid` has 0 readers; `pnpm build` clean after the column drop.
  - Monitor: `count(transactions.subid3 IS NOT NULL) > 0` if the field is retained (DSN-OPS-2, M4).
  - Files: src/lib/db/deals.repo.ts, src/app/api/postbacks/route.ts, supabase/schema.sql

- [ ] T-MON-4: End-to-end thin-loop drill — the first commission event persists with a recovered `product_id` (**the north-star proof**).
  - Traces: DSN-MON-2, DSN-MON-3, DSN-PDP-1, DSN-SEO-1 / FR-MON-2, FR-MON-3, FR-PDP-1 / OBJ-1
  - Type: DETERMINISTIC (a scripted staging E2E drill of the full loop).
  - Acceptance: seed one live deal → render PDP → click the decorated CTA → fire a signed test postback with that subID → a row persists in `transactions` with the recovered `product_id`; `count(*) FROM transactions WHERE product_id IS NOT NULL` ≥ 1, cross-checked against the network dashboard for the same subID.
  - Verify: `node scripts/thin-loop-drill.mjs` (render→click→postback→assert row); cross-check the subid against the persisted row.
  - Monitor: OBJ-1 daily KPI panel `commission_events/day`; **alert if commission = 0 across a rolling 30-day window** post-M1 (DSN-OPS-2, M4).
  - Files: scripts/thin-loop-drill.mjs

- [ ] T-CMP-1: ⛔ **ASK FIRST (G2)** — replace the placeholder legal identity with a real, counsel-signed Impressum before deploying legal pages to EU prod.
  - Traces: DSN-CMP-2 / FR-CMP-2 / OBJ-8 (launch-blocker, RSK-10)
  - Type: HUMAN-GATED (G2) — binding legal copy needs counsel sign-off; a machine cannot assume liability.
  - Acceptance: the Imprint carries the **real** company name/VAT/registered address + a `@dealradar.me` contact; `grep` for `BE 0123.456.789` / `dealradar.eu` in prod = 0; identity signed off.
  - Verify: grep the placeholder VAT / stale domain in prod source = 0; human sign-off recorded on the PR.
  - Monitor: alert if placeholder strings reappear in prod output (DSN-OPS-2, M4).
  - Files: src/app/[locale]/imprint/page.tsx, src/messages/*.json

- [ ] T-CMP-2: Verify localized legal-page key-parity across all 13 locales.
  - Traces: DSN-CMP-1 / FR-CMP-1 / OBJ-8
  - Type: DETERMINISTIC (rendering; the copy is G2-gated via T-CMP-1).
  - Acceptance: the key-parity script exits **0** (0 missing/empty keys across 13 locales); each footer link routes to the localized Imprint/Privacy/Terms; _(v3.1)_ `check-i18n.mjs` gains a **code-usage scan** — every key referenced by `t(...)` in code exists in all 13 locale files (cross-locale parity alone cannot catch a key missing from ALL locales equally: `deal.priceNote` renders as a literal string on every `DealCard` today, `DealCard.tsx:102` — add the key to all 13 files or remove both call sites).
  - Verify: `node scripts/check-i18n.mjs` → exit 0; a locale switch renders translated legal copy; the usage-scan fails on a seeded missing key.
  - Monitor: compliance watch runs parity periodically; alert on a parity break (DSN-OPS-2, M4).
  - Files: scripts/check-i18n.mjs, src/messages/*.json

- [ ] T-CMP-3: Add a test enforcing the affiliate disclosure badge adjacent to **every** outbound CTA.
  - Traces: DSN-CMP-3 / FR-CMP-3 / OBJ-8
  - Type: DETERMINISTIC (a component rendered per CTA, enforced by test not convention).
  - Acceptance: a test asserts a **visible** (not `sr-only`, not footer-only) "Sponsored/Werbung" badge renders adjacent to each CTA on `DealCard` + PDP; footer disclosure present on all pages; _(v3.1)_ the badge-presence test **enumerates ALL components calling `decorateAffiliateUrl`** (incl. `DealDetailModal` if retained — its monetized CTA has no badge today; a latent counterexample the moment the modal is wired — cross-ref T-PDP-6).
  - Verify: `pnpm test` badge-presence test green on `DealCard` + PDP (+ the call-site enumeration).
  - Monitor: periodic badge-presence check; alert on a regression (DSN-OPS-2, M4).
  - Files: src/components/deals/DealCard.tsx, src/app/[locale]/deal/[slug]/page.tsx, src/components/deals/DealCard.test.tsx

- [ ] T-CMP-4: Verify opt-in cookie consent sets **0** non-essential cookies pre-consent, with equal-weight + withdrawal.
  - Traces: DSN-CMP-4 / FR-CMP-4, NFR-PRIV-3 / OBJ-8
  - Type: DETERMINISTIC (a rule-based consent component).
  - Acceptance: DevTools on first incognito load = **0** non-essential cookies; equal-weight Accept/Reject (EDPB); the footer control re-opens the modal (Art 7(3)); preference persists on refresh.
  - Verify: incognito visit → 0 pre-consent cookies; re-open + refresh confirmed.
  - Monitor: cookie audit; alert on a pre-consent cookie or a missing withdrawal control (DSN-OPS-2, M4).
  - Files: src/components/consent/CookieConsent.tsx

- [ ] T-CMP-5: Verify one-click unsubscribe (GET+POST, RFC 8058) + HMAC erasure + the daily GDPR retention sweep. _(v3.1 status: **substantially built merged-on-branch** — timing-safe HMAC failing closed in prod, idempotent delete + localized noindex GET page, RFC 8058 POST, `List-Unsubscribe(-Post)` headers, daily 05:00 purge workflow. Keep unticked: both-verb Verify + raw-email inspection still to run; live Resend/secrets unverified.)_
  - Traces: DSN-CMP-5, DSN-CMP-6 / FR-CMP-5, FR-CMP-6, NFR-PRIV-2 / OBJ-8
  - Type: DETERMINISTIC (HMAC verify + delete; scheduled SQL sweep; live deliverability depends on A-16 Resend domain).
  - Acceptance: valid token (either verb) → 200 + `price_alerts` row deleted; invalid → error; repeat → idempotent; `List-Unsubscribe`/`-Post` headers present; the daily purge returns `{deleted:N}`; `price_alerts.created_at < now()-365d` = 0; _(v3.1)_ the unsubscribe link host = `NEXT_PUBLIC_APP_URL` with a `dealradar.me` fallback — **no `.eu` literal** (today `alerts.repo.ts:100` falls back to `dealradar.eu`); the GET verb renders a **one-button confirmation page whose button POSTs** (today GET is state-changing — a mail-scanner prefetch silently unsubscribes, `unsubscribe/route.ts:43-55`; keep the RFC 8058 POST as-is).
  - Verify: both-verb unsubscribe tests + idempotency; seed a stale row → the sweep deletes it; inspect a raw email for the link + headers; a GET without the confirming POST deletes nothing.
  - Monitor: unsubscribe POST 200-rate + retention-job success; alert on a purge no-op (DSN-OPS-2/INF-5, M4).
  - Files: src/app/api/alerts/unsubscribe/route.ts, src/app/api/purge-alerts/route.ts

- [ ] T-CMP-7: Verify the live-path price-drop alert fires and delivers exactly one email per qualifying drop (v2 U-3 / remediation GAP-2 P0). _(v3.1 status: the implementation exists **merged-on-branch** — see FR-CMP-8; the seeded-drop Verify has not been run; the hidden-deal leak and the dead incompatible unsubscribe module are open. Keep unticked.)_
  - Traces: DSN-CMP-8 / FR-CMP-8 / OBJ-8 (drives OBJ-1 return traffic)
  - Type: DETERMINISTIC (threshold check on `sale_price` drop → single dispatch on the live refresh-alerts path; live deliverability depends on A-16 Resend domain).
  - Acceptance: a seeded `sale_price` drop below a subscriber's threshold triggers `refresh-alerts` and dispatches **exactly one** email (with the `List-Unsubscribe` header) within one cycle; no email when the price does not cross the threshold; a raw-email inspection shows the unsubscribe link + headers; _(v3.1)_ the **`hidden=false` filter** is asserted (mirror `dealsByIds`, `deals.repo.ts:234`) and **a deal hidden by the verifier in the same window produces 0 dispatches** (hiding bumps `last_updated`, `verify-awin.cjs:200`); subtask: **delete `src/lib/email/unsubscribe.ts`** (dead, incompatible, unused import at `alerts.repo.ts:14`) after moving its `siteOrigin()` — the one correct `dealradar.me` fallback — to a shared util (couples to T-SEO-1's `baseUrl()`); _(v3.1, audit P2-I)_ the **per-email alert cap is enforced in the DB** (trigger or guarded-insert RPC — concurrent POSTs cannot exceed the cap; today `alerts/route.ts:49-52` is a check-then-insert race) **OR** the accepted overshoot is documented; the IP limiter's **fail-open-without-Upstash** behavior (`redis.ts:78,83-85`) is documented; **double-opt-in** recorded as a deferred product decision (mirrored in FR-CMP-8).
  - Verify: an integration test against `src/app/api/refresh-alerts/route.ts` — seed a qualifying drop → assert exactly one dispatch; a non-qualifying change → 0 dispatch; a hidden deal → 0 dispatch; inspect a raw email.
  - Monitor: alerts-sent count vs qualifying-drop count; **alert on 0 sends while qualifying drops exist** (silent-alert-failure, couples to DSN-OPS-2, M4).
  - Files: src/app/api/refresh-alerts/route.ts, src/lib/db/alerts.repo.ts, src/lib/db/deals.repo.ts (the hidden filter lives there), src/lib/email/unsubscribe.ts (delete)

- [ ] T-INF-5: Add security response headers / CSP for the prod launch.
  - Traces: DSN-INF-7 / FR-INF-7, NFR-SEC-3 / OBJ-6
  - Type: DETERMINISTIC (static header config).
  - Acceptance: `curl -I` on a deployed page shows HSTS + CSP + `X-Frame-Options` + `X-Content-Type-Options`; securityheaders.com grade ≥ **A**.
  - Verify: a header snapshot test; `curl -I https://dealradar.me/`.
  - Monitor: periodic header-presence check; alert on absence (DSN-OPS-2, M4).
  - Files: next.config.mjs

- [ ] T-INF-6: Verify the edge-geo middleware defaults unsupported countries to DE and sanitizes untrusted input.
  - Traces: DSN-INF-4 / FR-INF-4, NFR-SEC-5, NFR-PRIV-4 / OBJ-6 (feeds OBJ-2)
  - Type: DETERMINISTIC (header read + default rule + sanitize; geo coords never persisted).
  - Acceptance: a first visit sets `dr_location`; an unsupported-country header → `dr_location=DE`; an injected city payload is neutralized; no lat/long column exists.
  - Verify: middleware unit — supported header sets the country, unsupported → DE; a city-injection unit test.
  - Monitor: unsupported-country default-rate + error-rate on the geo path (DSN-OPS-2, M4).
  - Files: src/middleware.ts

- [ ] T-INF-7: Extend atomic sliding-window rate limiting to the write/expensive endpoints + a named fail-open warning.
  - Traces: DSN-INF-8 / FR-INF-8, NFR-SEC-6 / OBJ-6
  - Type: DETERMINISTIC (coded limiter; makes the fail-open state visible instead of silent).
  - Acceptance: the (N+1)th request in the window → **429** on `/api/refresh`, `/api/postbacks`, `/api/search`, `/api/deals`; a "rate-limiter unconfigured" warning is emitted when Upstash is unset.
  - Verify: a rate-limit integration test per endpoint; an unset-Upstash run logs the named warning.
  - Monitor: 429-rate + "limiter unconfigured" warning count; alert if fail-open in prod (DSN-OPS-2, M4).
  - Files: src/lib/cache/redis.ts, src/app/api/postbacks/route.ts, src/app/api/refresh/route.ts, src/app/api/search/route.ts, src/app/api/deals/route.ts

- [ ] T-SEO-5: Submit the launch-country sitemap to GSC and confirm the first PDPs get indexed (0 → > 0). **⛔ v3.1 dependency: BLOCKED until the sitemap is per-request/ISR (FR-SEO-6 edit) and `getAllDealSlugs` filters `hidden` + paginates** — the current sitemap is a static prerender, so deals ingested after the build never appear (verified-live: the prod sitemap has ZERO deal URLs); submitting it to GSC would index nothing.
  - Traces: DSN-SEO-6, DSN-SEO-9 / FR-SEO-6, FR-SEO-12, NFR-SEO-1 / OBJ-5 (feeds OBJ-1)
  - Type: DETERMINISTIC (sitemap serve + manual first submit; poller automation lands in M2, T-SEO-8).
  - Acceptance: `/sitemap.xml` returns valid XML with launch-country deal slugs on host `dealradar.me`; GSC accepts the sitemap; **≥ 1** PDP moves to "Indexed" within the crawl window (from 0 today); _(v3.1)_ **a deal ingested AFTER the last deploy appears in `/sitemap.xml` without a redeploy**.
  - Verify: `GET https://dealradar.me/sitemap.xml` → 200 valid; submit in GSC; URL Inspection shows a PDP indexed.
  - Monitor: weekly GSC index-coverage delta; alert if indexed stays 0 while PDPs are live (DSN-SEO-9/OPS-2, M4).
  - Files: src/app/sitemap.ts, src/lib/db/deals.repo.ts

---

## Milestone M2 — Organic Growth Engine

> **Goal:** turn the one earning loop into indexed scale. **Critical path (OBJ-5).**
> **Exit criterion (gate):** **0 → ≥ 1,000 (A-10)** indexed URLs within 90 d; **0 errors** across the audited canonical/hreflang/host sample; expired-deal returns **200 + `OutOfStock`**; **≥ 1** AI-engine citation observed (SC6).

- [ ] T-SEO-6: Land the url-slug workstream (recovered todo B1–E2) as the M2 URL/indexing foundation.
  - Traces: DSN-SEO-1, DSN-SEO-4 (category), DSN-SEO-5, DSN-SEO-6, DSN-SEO-7 / FR-SEO-1, FR-SEO-4, FR-SEO-5, FR-SEO-6, FR-SEO-7, FR-SEO-9, NFR-SCALE-2 / OBJ-5 (feeds OBJ-1)
  - Type: DETERMINISTIC (routing/redirect/status + sharded sitemap + category metadata + `/search` noindex, per the APPROVED spec). **Do NOT re-plan — this task tracks the workstream's completion.** Its D3 (expiry cron) is itself ⛔ **ASK FIRST** before prod.
  - **Dependency manifest (external vehicle, A-19 — updated after EVENT 3 + the `b53bb3e` restore):** the original files (`docs/specs/2026-07-08_url-slug-structure_v1.md`, `docs/specs/url-structure/2026-07-08_v2/` incl. HANDOFF.md, `tasks/plan.md`, `tasks/todo.md`) were destroyed by the 2026-07-09 pull, then **restored and COMMITTED at `b53bb3e`**. Point at the committed package: `/Users/danielmanzela/DealRadar/docs/specs/url-structure/2026-07-08_v2/` (HANDOFF.md entry point; spec.md; plan.md; tasks.md; **redteam-register.md — the 49→25 register — + redteam-adjudication-full.json**; v1-superseded.md) and `tasks/plan.md`+`tasks/todo.md` — B1–E2 tracking derives from those. _Fidelity caveat: restoration from session context + workflow journals (per commit `b53bb3e`) — **verify restoration fidelity** by cross-checking against the secondary `docs/recovered/2026-07-09/url-slug-spec-RECONSTRUCTION.md` (12 locked decisions) + `tasks-todo.md`, **then use the restored register**; no re-red-team or plan re-derivation is required._ The **authoritative acceptance is first-class** — `DSN-SEO-1/4(category)/5/6/7` + `FR-SEO-1/4/5/6/7/9/11` — so this task traces to resolvable v3.1 IDs regardless. **Precondition: T-INF-12 (commit the recovered docs) first.** Dependency chain: **T-DB-0 (schema P0) → B1 (`content_changed_at` etc., re-baselined on the post-merge schema) → C2 (resolver live BEFORE the slug-format churn — the sitemap now consumes DB slugs) → the T-ING-6 ingest re-merge (stale-hide setter, else "active-only" has no setter for feed-dropped deals) → T-SEO-6 → E1/E2.** Note: the merged `sitemap.ts` is a **replacement target, not a foundation** — D8 is violated by current code (unsharded, build-frozen, `new Date()` lastmod, changefreq/priority present, hidden-blind, `.eu` fallback), i.e. net-new work; KEEP its hreflang-alternates helper + category entries.
  - Acceptance: deal URL matches `^/{locale}/deal/[a-z0-9-]+-d[0-9a-f]{12}$`; a renamed product keeps its 200 URL + old URL 308s once; an expired **or hidden** deal → **200 + `OutOfStock` JSON-LD** (hidden ≠ expired; see the FR-SEO-1 design note); sitemap sharded @10k with `content_changed_at` `lastmod` (paginated past the PostgREST 1000-row cap, active-only, per-request/ISR); category `generateMetadata` (canonical + 13 hreflang + `x-default`); `/search` emits `noindex`; the generated category routes (T-PDP-2) are emitted into the sitemap index alongside the deal shards; writers stop composing slugs (D11 is **actively violated** today at five sites: `deals.repo.ts:19,:38,:321`, `ingest-awin.cjs:136`, `DealCard.tsx:27` — removal of `toRow`'s slug composition belongs to the restored todo items).
  - Verify: **extend `scripts/smoke-spine.mjs` with the URL-spec spine assertions** (308 one-hop, publicId route, expired/hidden 200+`OutOfStock`, sitemap sample all-200) — it currently tests NONE of them (greps 0 hits for `308|publicId|legacy`; it is the old audit-P0 smoke, and its header example still says `staging.dealradar.eu`); then E1 curl matrix on `dealradar.me`; E2 RRT 0 errors on a live AND a hidden deal.
  - Monitor: `/deal/*` 404-rate + redirect-hop count + sitemap-URL vs active-deal gap; index-coverage delta (DSN-OPS-2, M4).
  - Files: (tracked via the committed tasks/todo.md + docs/specs/url-structure/2026-07-08_v2/ — the spec workstream; smoke-spine.mjs extension excepted)

- [ ] T-PDP-2: Generate the leaf category tree as real crawlable routes (not `/search?…` query links).
  - Traces: DSN-PDP-3 / FR-PDP-3, FR-SEO-8, FR-SEO-11 / OBJ-4 (enables OBJ-5 scale)
  - Type: DETERMINISTIC (templated pages from the fixed `categories.ts` taxonomy).
  - Acceptance: each of ~300 leaf terms resolves to a **real route** (200 + a filtered `DealGrid`), not a `/search` redirect; the count of crawlable non-deal category URLs = taxonomy size (≫ today's ~10); each generated category route is included in the sitemap index (via T-SEO-6 / DSN-SEO-6), not left orphaned.
  - Verify: `generateStaticParams` enumerates the taxonomy leaf count; a leaf term → 200 list route (not a redirect).
  - Monitor: GSC indexed category-URL count vs the taxonomy inventory (DSN-OPS-2, M4).
  - Files: src/app/[locale]/category/[...slug]/page.tsx, src/lib/categories.ts

- [ ] T-PDP-3: Build the editorial/curation overlay table + read-path join that survives ingestion upserts.
  - Traces: DSN-PDP-2 / FR-PDP-2 / OBJ-4 (mitigates thin-content, RSK-5)
  - Type: DETERMINISTIC join/persistence — ingest **never** writes `deal_curation`; the PDP LEFT JOINs it at SSR time keyed on `product_id`.
  - Acceptance: rename a product's feed name → run a refresh → the editorial copy is **unchanged** (join-time, not overwritten by `onConflict product_id`); a curation row renders **only** when `legal_ok=true`.
  - Verify: staging — rename + refresh, assert the overlay survived; SQL confirms `deal_curation` was untouched by the upsert.
  - Monitor: count of deals with persistent human-authored copy > 0; alert if a refresh wipes overlay rows (DSN-OPS-2, M4).
  - Files: supabase/schema.sql, src/lib/db/deals.repo.ts, src/app/[locale]/deal/[slug]/page.tsx

- [ ] T-PDP-4: Author non-thin PDP content (specs/comparison/FAQ) via an off-request-path worker with a human `legal_ok` gate.
  - Traces: DSN-PDP-2, DSN-PDP-4 / FR-PDP-4 / OBJ-4 (AEO/GEO extraction quality)
  - Type: AGENTIC copy generation (deterministic templating; ⛔ **ASK FIRST**-adjacent — the **human `legal_ok` gate** blocks any price/health/legal claim from rendering); fallback = the PDP renders the deterministic templated blocks only.
  - Acceptance: curated PDPs carry `specs` + ≥ 1 multi-merchant `comparison` + `faq` blocks **in-source** (not `display:none`); GSC does not flag thin content; a `legal_ok=false` row is not rendered.
  - Verify: render a curated deal → the enriched blocks present in view-source; a `legal_ok=false` fixture does not render.
  - Monitor: GSC "crawled — not indexed" / thin-content signal; alert on a spike (DSN-OPS-2, M4).
  - Files: scripts/author-curation.mjs, src/app/[locale]/deal/[slug]/page.tsx

- [ ] T-PDP-5: Retire the dead synthetic detail modules so dead-code can't masquerade as content capability. _(v3.1 status: the honesty-gutting **largely happened merged-on-branch** — `product-details.ts` −122 lines, `productSpecs`/`otherStoreOffers`/fake model codes gone — but the acceptance fails as written: the dead `DealDetailModal` imports `productSizes`/`productGallery` (`DealDetailModal.tsx:20,32-33`), and `productSizes` still fabricates seeded stock. Keep unticked.)_
  - Traces: DSN-PDP-5 / FR-PDP-6 / OBJ-4 (content-honesty / maintainability)
  - Type: DETERMINISTIC (code removal + a grep gate; real content now comes from T-PDP-3/4 + T-PDP-6).
  - Acceptance: _(updated v3.1 to the post-gutting reality)_ the `productSizes` seeded-availability fabrication ("never let a product look fully sold out", `product-details.ts:44-62,:57-60`) is **deleted** (or returns null until real stock data exists); `productGallery` is retained as a **real-data helper with a live consumer** (the PDP, via T-PDP-6); grep importers of the removed modules = **0** (no dead-code-importing-dead-code: `DealDetailModal` → `productSizes`); build + lint clean; no orphan export remains.
  - Verify: `pnpm build` + ESLint clean after the removal; the importer grep.
  - Monitor: CI grep-gate on the retired-module imports (build-health signal, NFR-REL-5 / T-INF-4) — the build fails if a dead import reappears.
  - Files: src/lib/utils/product-details.ts (coupled to T-PDP-6's wire-or-delete of the modal)

- [ ] T-PDP-6: _(new v3.1)_ Render the real gallery + feed description + 90-day price cardiogram on the SSR PDP; **wire-or-delete** the `DealDetailModal` (⛔ human gate on the choice).
  - Traces: DSN-PDP-7, DSN-ING-6 (data) / FR-PDP-7, FR-PDP-5, FR-SEO-2 (JSON-LD description) / OBJ-4, OBJ-5
  - Type: DETERMINISTIC (SSR rendering of existing DB columns + the day-ordered `price_history` read; the wire-or-delete decision is a small **human gate** — fix the modal's `decorateAffiliateUrl` arg-order bug, add a `SponsoredBadge` + a real `priceNote` key, and wire it from a secondary affordance, OR delete the file).
  - Acceptance: the SSR PDP renders `gallery` (real feed data), `description` (also fed into JSON-LD `description`), and the 90-day cardiogram from `price_history` via `price-history.repo.ts`/`/api/price-history`; `PriceHeatBar`'s series prop is reachable from product code; the modal is either imported by live UI (with the T-MON-1/T-CMP-3 fixes) or the file is deleted; card image/title links to the SSR PDP are preserved either way (the modal may only open from a secondary affordance — the SEO surface stays the SSR page).
  - Verify: view-source on a seeded PDP shows gallery + description + cardiogram markup (not CSS-hidden); `/api/price-history` returns the day-ordered series; grep the modal's importers = live-UI-or-absent.
  - Monitor: PDP thin-content signal (GSC) + `/api/price-history` error rate (DSN-OPS-2, M4).
  - Files: src/app/[locale]/deal/[slug]/page.tsx, src/components/deals/PriceHeatBar.tsx, src/components/deals/DealDetailModal.tsx, src/lib/db/price-history.repo.ts

- [ ] T-SEO-11: _(new v3.1)_ Kill the seed crawl-trap — stabilize/remove `seed` from crawlable hrefs; point the homepage CTA at a stable URL.
  - Traces: DSN-SEO-12 / FR-SEO-15, FR-SEO-11 / OBJ-5
  - Type: DETERMINISTIC (derive a daily deterministic seed or strip the param; pure rendering change).
  - Acceptance: no per-request-minted `seed` appears in any crawlable href on search **or** category pages (`search/page.tsx:43,74`, category page `:42,74` — each uncached request currently mints a fresh `Math.random` seed baked into every pagination href); the HeroDeals "View all deals" CTA (`HeroDeals.tsx:71`) targets a stable URL (not `/search?sort=random`); the numbered Pagination itself (real `<a>` hrefs, clean page-1 URL, `aria-current`) is conformant and unchanged; the homepage per-request unseeded shuffle (`HeroDeals.tsx:18-25`) is either fixed in the same pass or explicitly recorded as accepted-churn.
  - Verify: grep pagination hrefs for `seed` = deterministic-or-absent; two consecutive crawls of a paginated listing yield identical hrefs; view-source `/search` shows `noindex` (couples to the FR-SEO-11 half owned by url-slug C7).
  - Monitor: crawl-budget watch — GSC crawl stats on `/search?` URL variants trending to 0 (DSN-OPS-2, M4).
  - Files: src/components/search/Pagination.tsx, src/app/[locale]/search/page.tsx, src/app/[locale]/category/[slug]/page.tsx, src/components/home/HeroDeals.tsx

- [ ] T-SEO-7: Build the PDP internal-link graph (related deals, same-category, breadcrumb).
  - Traces: DSN-SEO-8 / FR-SEO-10 / OBJ-5
  - Type: DETERMINISTIC (templated links from the taxonomy + DB).
  - Acceptance: avg internal outlinks per PDP ≥ **8** (today ~1); related + same-category + breadcrumb links render; the expired-state page links to **live** same-category alternatives.
  - Verify: render a PDP → related / same-category / breadcrumb links present.
  - Monitor: internal-link distribution; alert if PDPs regress to ~1 outlink (DSN-OPS-2, M4).
  - Files: src/app/[locale]/deal/[slug]/page.tsx, src/components/deals/RelatedDeals.tsx, src/lib/db/deals.repo.ts

- [ ] T-SEO-8: Automate indexing submission + GSC/IndexNow coverage polling.
  - Traces: DSN-SEO-9 / FR-SEO-12, NFR-SEO-1 / OBJ-5
  - Type: DETERMINISTIC (scheduled API poll on a GH Action cron).
  - Acceptance: a scheduled job retrieves the GSC "Indexed" count each cycle + resubmits the sitemap on change; `pollCoverage()` writes `{indexed:int}` to the signal store.
  - Verify: a staging drill — `pollCoverage()` returns a number; sitemap resubmit on change.
  - Monitor: weekly GSC index-coverage delta; feeds the index-stall alert (DSN-OPS-2, M4).
  - Files: scripts/poll-index-coverage.mjs, .github/workflows/index-poll.yml

- [ ] T-SEO-9: Add the AI-engine citation probe for a seeded query set.
  - Traces: DSN-SEO-10 / FR-SEO-13, NFR-SEO-4 / OBJ-5 (GEO success signal)
  - Type: DETERMINISTIC (scripted probe + deterministic contains-match over the seeded query set; no agentic step — keeps the sanctioned agentic set at exactly 4).
  - Acceptance: `probeCitations(queries)` records **≥ 1** observed DealRadar citation on ChatGPT/Perplexity/Gemini/AI-Overviews within the M2 window.
  - Verify: a scripted citation probe returns a recorded `{cited, engine, query}`.
  - Monitor: citation-probe log + AI-bot fetch logs; alert if citations stay 0 while coverage grows (DSN-OPS-2, M4).
  - Files: scripts/probe-citations.mjs, .github/workflows/citation-probe.yml

- [ ] T-SEO-10: Pull GSC Search Analytics (avg position + CTR per query/page) into the signal store so the Operator's rank/CTR thresholds have a real feed.
  - Traces: DSN-SEO-11 / FR-SEO-14 / OBJ-5 (feeds OBJ-7)
  - Type: DETERMINISTIC (scheduled Search Analytics API pull on the same GH-Action cron as the coverage poll, T-SEO-8).
  - Acceptance: the index-poll cron writes **rank + CTR rows** (avg position, impressions, clicks per query/page) into `operator_signals`; without this feed the T-OPS-1/T-OPS-2 rank/CTR thresholds (§8.2) have no data source.
  - Verify: a staging Search Analytics fetch → `operator_signals` contains non-null `rank`/`ctr` rows; the poll is idempotent per window.
  - Monitor: rank/CTR row freshness; alert if the Search Analytics feed goes dark (DSN-OPS-2, M4).
  - Files: scripts/poll-index-coverage.mjs, .github/workflows/index-poll.yml

- [ ] T-CMP-6: Add the server-side consent audit log (Art 5(2) accountability, no PII).
  - Traces: DSN-CMP-7 / FR-CMP-7, NFR-PRIV-3 / OBJ-8
  - Type: DETERMINISTIC (an append-only audit write wired to the consent choice).
  - Acceptance: a consent choice produces **exactly one** `consent_audit` row `{choice, analytics, policy_version, ts}` with no PII.
  - Verify: a consent event writes one audit row; a PII-column lint on the table = 0.
  - Monitor: consent-audit write success; alert if consent events stop being logged (DSN-OPS-2, M4).
  - Files: src/app/api/consent/route.ts, src/components/consent/CookieConsent.tsx, supabase/schema.sql

- [ ] T-INF-8: Add the DB hot-path index posture + an `EXPLAIN` CI gate for the growth surface.
  - Traces: DSN-INF-10 / NFR-PERF-3, NFR-SCALE-3 / OBJ-6
  - Type: DETERMINISTIC (index DDL + an `EXPLAIN` assertion).
  - Acceptance: `EXPLAIN` on the deal/search/`public_id`/`ean` hot paths shows **index use, no seq-scan**; `deals_public_id_idx`/`deals_ean_idx`/`deals_active_fresh_idx` present.
  - Verify: an `EXPLAIN` assertion in CI on the hot-path queries.
  - Monitor: slow-query watch + DB-size trend vs the scale-up trigger (DSN-OPS-2, M4).
  - Files: supabase/schema.sql, scripts/explain-gate.mjs

---

## Milestone M3 — Breadth

> **Goal:** widen — more countries/locales/providers, cross-network value, revenue-maximizing dedup, reconciliation.
> **Exit criterion (gate):** ≥ **4 (A-13)** countries live with non-mock deals; cross-network EAN dedup collapses ≥ **10% (A-13, provisional)**; the highest-expected-commission source is chosen on a tie; the reconciliation job flags ≥ 1 aging/dispute case in a drill (SC7).

- [ ] T-ING-7: Re-enable all 13 locales / 16 countries across the ingestion + routing surface.
  - Traces: DSN-ING-9, DSN-INF-4 / FR-ING-1, FR-INF-4 / OBJ-2
  - Type: DETERMINISTIC (config expansion of the fan-out + locale set, still chunked within the verified ceiling).
  - Acceptance: ≥ **4 (A-13)** countries return non-mock deals; all 13 locales render PDPs; the full-matrix fan-out stays within the verified ceiling (no timeout).
  - Verify: a full-matrix refresh logs `upserted N>0` per country without timeout; a locale switch renders each of the 13.
  - Monitor: per-country `upserted` count + fan-out duration p95 (DSN-OPS-2, M4).
  - Files: src/lib/providers/registry.ts, src/app/api/refresh/route.ts, src/i18n/routing.ts

- [ ] T-ING-8: Fold the AWIN bulk feed into the dedup path for cross-network EAN collapse (RSK-7).
  - Traces: DSN-ING-3, DSN-ING-10 / FR-ING-4 / OBJ-2 (feeds OBJ-1)
  - Type: DETERMINISTIC (EAN key derivation + a set-reconciliation query across AWIN-written + per-query rows).
  - Acceptance: an AWIN row + a Kelkoo row sharing an EAN collapse to **one** survivor; the EAN-key collapse count > 0 once the live feed is on.
  - Verify: an integration fixture (AWIN + Kelkoo, same EAN) → one survivor; SQL reports EAN-key vs name-key collapse counts.
  - Monitor: EAN-key vs name-key collapse counts; alert if EAN-key collapse stays 0 after a live feed (dead-branch regression, RSK-7; DSN-OPS-2, M4).
  - Files: src/lib/providers/registry.ts, scripts/ingest-awin.cjs, src/lib/db/deals.repo.ts

- [ ] T-ING-9: Build the merchant-commission model + highest-commission-wins selector (blocked on A-17).
  - Traces: DSN-ING-7 / FR-ING-9 / OBJ-2 (directly serves OBJ-1 revenue)
  - Type: DETERMINISTIC (a comparison metric once the rate datum exists; degrades to price-only, with a signal, if the rate feed is null).
  - Acceptance: on a duplicate/tie, the persisted survivor is `max(rate × price)`, not merely `min(price)`; a null rate feed degrades to price-only and emits a signal.
  - Verify: a unit fixture — two sources, same product, differing commission → the higher-expected-commission source is persisted.
  - Monitor: % of duplicate resolutions where the higher-commission source won; alert if the rate feed goes null (RSK-6; DSN-OPS-2, M4).
  - Files: supabase/schema.sql, src/lib/providers/registry.ts, src/lib/providers/types.ts

- [ ] T-MON-5: Build the commission reconciliation job (ledger vs network totals + aging) with agentic dispute triage.
  - Traces: DSN-MON-5 / FR-MON-5 / OBJ-3 (protects OBJ-1 integrity)
  - Type: DETERMINISTIC compare/aging + AGENTIC dispute triage of novel discrepancies (fallback: escalate the flagged row unresolved).
  - Acceptance: a reconcile run flags **≥ 1** aging/dispute case in a seeded drill; the `pending → approved → paid` status transitions are monotonic; `reconciliation` rows are written.
  - Verify: a unit fixture — a stuck `pending` row past the aging window is flagged; an amount mismatch vs a mock network total surfaces.
  - Monitor: reconcile-run success + flagged/aging/disputed counts; alert on a reconcile failure or a dispute spike (DSN-OPS-2, M4).
  - Files: scripts/reconcile.mjs, .github/workflows/reconcile.yml, supabase/schema.sql

- [ ] T-MON-6: ⛔ **ASK FIRST (G3)** — expose the read-only payout-ready ledger view; disbursement stays out of scope until an entity + banking KYC exist.
  - Traces: DSN-MON-6 / FR-MON-6 / OBJ-1 (revenue realization)
  - Type: HUMAN-GATED (G3) for disbursement — payout/banking KYC + liability cannot be automated (A-15); the read-only view itself is deterministic. **No disbursement code ships pre-entity.**
  - Acceptance: `view payout_ready = SUM(commission) WHERE status='approved'` grouped by network; grep confirms **no** disbursement/banking code path exists.
  - Verify: SQL — `payout_ready` returns the payable sum; grep confirms no disbursement path shipped.
  - Monitor: the Operator reports cleared-vs-paid totals for a human at gate G3 (DSN-OPS-2, M4).
  - Files: supabase/schema.sql

---

## Milestone M4 — The Autonomous Operator _(last)_

> **Goal:** operate at breadth without babysitting. The 3-layer pipeline — deterministic monitors → agentic triage → thin human lane — built **last**, gated on the observability substrate (T-OPS-1) landing first.
> **Exit criterion (gate):** the Operator detects & correctly actions **≥ 90%** of injected fault-drills within **MTTA ≤ 15 min / MTTR ≤ 60 min (NFR-AUTON-1)**; the **dead-man's switch fires** if the Operator goes silent; false-positive rate = **0** on a clean run (SC8).

- [ ] T-OPS-1: Land the observability substrate — `operator_signals` + `operator_incidents` + an error tracker + an uptime probe + in-app instrumentation (**the prerequisite for all of S6**).
  - Traces: DSN-OPS-1 / FR-OPS-1, NFR-OBS-1, NFR-OBS-2, NFR-REL-1 / OBJ-7 (and OBJ-6 substrate)
  - Type: DETERMINISTIC (structured emission + storage; the Monitor hook every earlier task deferred to "M4" lands here).
  - Acceptance: every named signal (per-provider feed health, dedup ratio, 404-rate, JSON-LD validity, index coverage, rank, CTR, postback 401/FK-null/commission, cost) is queryable in `operator_signals`; an induced error appears in the tracker; the uptime probe records availability ≥ 99.5%/mo.
  - Verify: an instrumentation test asserts each signal is emitted on its code path; a thrown error is captured; a missing-signal check alerts if a stream goes dark.
  - Monitor: the substrate **is** the monitor; a missing-signal check.
  - Files: supabase/schema.sql, src/lib/observability/emit.ts, netlify/functions/uptime-probe.mts

- [ ] T-INF-9: Build cost guardrails + the named A-09 scale-up trigger.
  - Traces: DSN-INF-9 / FR-INF-9, NFR-COST-1, NFR-COST-2, NFR-COST-3, NFR-SCALE-3 / OBJ-6
  - Type: DETERMINISTIC (threshold checks; all bracketed numbers PLACEHOLDER until A-09 confirmed).
  - Acceptance: `checkBudgets()` flags a synthetic over-budget scenario (rows > **5,000,000** OR GH-Action fn-minutes > **2,000/mo** OR AWIN egress > **350 MB/run** OR Vertex/LLM token spend > **20M tokens/mo** (the 4 agentic crons) — all A-09 provisional defaults until confirmed); provider-console spend ≤ the declared cap; each agentic cron carries a max-iteration guard so it cannot loop unbounded.
  - Verify: the guardrail script flags an over-budget scenario; the trigger is documented.
  - Monitor: cost signals to the Operator cost-watch; alert on a threshold breach (RSK-12).
  - Files: scripts/check-budgets.mjs, .github/workflows/cost-guardrail.yml

- [ ] T-INF-10: Add a cron heartbeat + alarm-on-silent-no-op across all scheduled work.
  - Traces: DSN-INF-5 / FR-INF-5, NFR-OBS-3 / OBJ-6
  - Type: DETERMINISTIC (cron/CI pipelines that emit a heartbeat and alarm on a missing secret instead of echo-and-exit).
  - Acceptance: each cron writes a `cron_heartbeat` signal; a cron run with an unset secret emits an **alarm** (not a silent exit).
  - Verify: run a cron with an unset secret → the alarm fires (not exit-0-silent).
  - Monitor: cron-heartbeat panel; alert if a cron goes silent or no-ops on a missing secret.
  - Files: netlify/functions/refresh-deals.mts, .github/workflows/*.yml, src/lib/observability/emit.ts

- [ ] T-OPS-2: Build the deterministic monitor suite (L1 thresholds over `operator_signals`).
  - Traces: DSN-OPS-2 / FR-OPS-2, FR-OPS-3, FR-OPS-4, FR-OPS-5, FR-OPS-6, FR-OPS-7, NFR-OBS-3 / OBJ-7
  - Type: DETERMINISTIC (numeric thresholds on emitted metrics).
  - Acceptance: `runMonitors()` returns a `Breach[]` for each §8.2 threshold (mock-rows > 0, `upserted`=0, staleness > 26 h, 404-spike, JSON-LD drop, index stall, postback 401/FK-null, commission=0 for 30 d, cost breach, cron silent); false-positive rate = **0** on a clean run.
  - Verify: feed synthetic signals crossing each threshold → the matching breach fires; clean signals → 0 breaches.
  - Monitor: the operator-tick logs detections; each breach routes to a playbook (T-OPS-3) or triage (T-OPS-4).
  - Files: src/lib/operator/monitors.ts, netlify/functions/operator-tick.mts

- [ ] T-OPS-3: Build the self-heal playbook runner for known fault classes.
  - Traces: DSN-OPS-3 / FR-OPS-2, FR-OPS-3, FR-OPS-4 / OBJ-7
  - Type: DETERMINISTIC playbook (pre-scripted per fault class; ≤ 2 attempts then escalate).
  - Acceptance: `heal(faultClass)` re-runs refresh / purges mock rows / resubmits sitemap / re-renders; it resolves the injected known-fault drills or escalates after 2 failed attempts.
  - Verify: the drill harness (T-OPS-6) asserts the expected self-heal per known fault class.
  - Monitor: the Operator logs detection + action + outcome; alert if self-heal fails twice.
  - Files: src/lib/operator/playbooks.ts

- [ ] T-OPS-4: Build the agentic triage + single-escalation-summary composer for novel incidents.
  - Traces: DSN-OPS-4 / FR-OPS-8, NFR-AUTON-2 / OBJ-7
  - Type: AGENTIC — cross-signal root-cause reasoning is genuine judgment (fallback: escalate the raw signal bundle); runs off the request path (Vertex via a GH Action).
  - Acceptance: for a novel injected fault, `triage(signalBundle)` names the affected subsystem + a suggested action in **one** actionable summary (not a firehose).
  - Verify: the drill harness scores triage correctness on a novel fault set; false-positive rate = 0 on a clean run.
  - Monitor: escalation-quality log + human acknowledgement rate.
  - Files: scripts/operator-triage.mjs, .github/workflows/operator-triage.yml

- [ ] T-OPS-5: Build escalation delivery + the dead-man's-switch heartbeat watchdog.
  - Traces: DSN-OPS-5 / FR-OPS-9, NFR-AUTON-3 / OBJ-7
  - Type: DETERMINISTIC (delivery + a heartbeat watchdog on an **independent** cron so it outlives a dead Operator).
  - Acceptance: `escalate(summary)` delivers to a human channel + returns an ack; suppressing the Operator heartbeat fires the dead-man's switch; **0** false positives on a clean run.
  - Verify: a drill — suppress the heartbeat → the switch fires; deliver an escalation → the ack is recorded.
  - Monitor: Operator meta-health (heartbeat, delivery-ack, FP-rate); alert if the Operator is silent.
  - Files: src/lib/operator/escalate.ts, netlify/functions/deadman-watchdog.mts

- [ ] T-OPS-6: Build the fault-drill (game-day) harness covering the 8 fault classes — the verification vehicle for all of S6.
  - Traces: DSN-OPS-6 / FR-OPS-10, NFR-AUTON-1, NFR-REL-6 / OBJ-7
  - Type: DETERMINISTIC (scripted injection + assertions; run quarterly against staging).
  - Acceptance: `injectFault(type)` for {feed-down, mock-pollution, 404-spike, index-drop, postback-anomaly, cost-spike, cron-no-op, **db-restore** (data-loss/corruption → restore-drill, DSN-INF-11)}; the Operator detects & correctly actions **≥ 90%** within **MTTA ≤ 15 min / MTTR ≤ 60 min (NFR-AUTON-1)**; false-positive rate = **0** on a clean run.
  - Verify: each fault type has a scripted injection + an asserted expected action; pass-rate ≥ 90%; MTTA/MTTR read from `operator_incidents`.
  - Monitor: drill pass-rate + MTTA/MTTR panel (quarterly).
  - Files: scripts/game-day.mjs, .github/workflows/game-day.yml

---

## 7. Traceability Note — every DSN has ≥ 1 task; deferrals are explicit

### 7.1 DSN → Task coverage (all 61 components)

| DSN | Task(s) | DSN | Task(s) |
|---|---|---|---|
| DSN-ING-1 | T-ING-2, T-ING-4 | DSN-SEO-1 | T-SEO-6, T-MON-4 |
| DSN-ING-2 | T-ING-4 | DSN-SEO-2 | T-SEO-2 |
| DSN-ING-3 | T-ING-4, T-ING-8 | DSN-SEO-3 | T-SEO-3 |
| DSN-ING-4 | T-ING-1 | DSN-SEO-4 | T-SEO-4 (deal), T-SEO-6 (category) |
| DSN-ING-5 | T-ING-4 | DSN-SEO-5 | T-SEO-1, T-SEO-6 |
| DSN-ING-6 | **T-DB-0** _(v3.1)_, T-INF-1, T-ING-5, T-PDP-6 (data) | DSN-SEO-6 | T-SEO-5, T-SEO-6 |
| DSN-ING-7 | T-ING-9 | DSN-SEO-7 | T-SEO-1 (host + AI-bot groups), T-SEO-6 (noindex) |
| DSN-ING-8 | T-ING-2, T-ING-3 | DSN-SEO-8 | T-SEO-7 |
| DSN-ING-9 | T-INF-3, T-ING-7 | DSN-SEO-9 | T-SEO-5, T-SEO-8 |
| DSN-ING-10 | T-ING-6, T-ING-8 | DSN-SEO-10 | T-SEO-9 |
| DSN-MON-1 | T-MON-1 | DSN-INF-1 | T-INF-2 |
| DSN-MON-2 | T-MON-2, T-MON-4 | DSN-INF-2 | T-INF-3 |
| DSN-MON-3 | T-INF-1, T-MON-4 | DSN-INF-3 | T-INF-4 |
| DSN-MON-4 | T-MON-3 | DSN-INF-4 | T-INF-6, T-ING-7 |
| DSN-MON-5 | T-MON-5 | DSN-INF-5 | T-INF-10 |
| DSN-MON-6 | T-MON-6 | DSN-INF-6 | T-INF-1 |
| DSN-PDP-1 | T-PDP-1, T-MON-4 | DSN-INF-7 | T-INF-5 |
| DSN-PDP-2 | T-PDP-3, T-PDP-4 | DSN-INF-8 | T-INF-7 |
| DSN-PDP-3 | T-PDP-2 | DSN-INF-9 | T-INF-9 |
| DSN-PDP-4 | T-PDP-4 | DSN-INF-10 | T-INF-1 (indexes), T-INF-8 (EXPLAIN) |
| DSN-PDP-5 | T-PDP-5 | DSN-OPS-1 | T-OPS-1 |
| DSN-CMP-1 | T-CMP-2 | DSN-OPS-2 | T-OPS-2 |
| DSN-CMP-2 | T-CMP-1 | DSN-OPS-3 | T-OPS-3 |
| DSN-CMP-3 | T-CMP-3 | DSN-OPS-4 | T-OPS-4 |
| DSN-CMP-4 | T-CMP-4 | DSN-OPS-5 | T-OPS-5 |
| DSN-CMP-5 | T-CMP-5 | DSN-OPS-6 | T-OPS-6 |
| DSN-CMP-6 | T-CMP-5 | DSN-SEO-11 | T-SEO-10 |
| DSN-CMP-7 | T-CMP-6 | DSN-INF-11 | T-INF-11 |
| DSN-CMP-8 | T-CMP-7 | DSN-ING-11 _(v3.1)_ | T-ING-10 |
| DSN-ING-12 _(v3.1)_ | T-ING-11, T-ING-6 (flag re-wire) | DSN-PDP-7 _(v3.1)_ | T-PDP-6 |
| DSN-SEO-12 _(v3.1)_ | T-SEO-11 | | |

**Result:** all **61** DSN components (design.md §3: ING-1..12, MON-1..6, PDP-1..5 + PDP-7 [PDP-6 reserved for a11y], SEO-1..12, INF-1..11, OPS-1..6, CMP-1..8) have ≥ 1 task. Every task above cites its DSN + FR/NFR + OBJ; design.md §7.1 gives the reverse FR/NFR→DSN matrix — no orphans in either direction. Documented exceptions: **T-DB-0** (out-of-area P0 hotfix ID, maps to DSN-ING-6) and **T-INF-12** (process task, traces to RSK-13, no DSN).

### 7.2 Intentional deferrals (design present, build sequenced later — not orphaned)

| Deferral | Where | Why deferred |
|---|---|---|
| **Payout disbursement** (DSN-MON-6) | T-MON-6 builds only the read-only `payout_ready` view | ⛔ G3 (banking KYC + liability, A-15); disbursement is out of scope until a real entity exists (PRD §6.3). |
| **Highest-commission-wins** (DSN-ING-7) | T-ING-9 (M3) | Blocked on A-17 — no provider emits a commission rate today; dedup optimizes consumer price until then (RSK-6). |
| **AWIN-into-dedup** (DSN-ING-3/10 cross-network) | T-ING-8 (M3) | The highest-value dedup case; requires a live feed + breadth before it pays off (RSK-7). |
| **Reconciliation** (DSN-MON-5) | T-MON-5 (M3) | Capture-only ledger is sufficient for the M1 thin loop; reconciliation matters once volume exists. |
| **The whole Operator** (DSN-OPS-1…6) + **cost guardrails** (DSN-INF-9) | T-OPS-1…6, T-INF-9 (M4) | Can only monitor signals that exist — sequenced **last** per PRD §8; building it earlier is monitoring an empty system (RSK-9). |
| **url-slug rework** (DSN-SEO-1/4-cat/5/6/7) | T-SEO-6 (M2) tracks B1–E2 via the **committed** package (`docs/specs/url-structure/2026-07-08_v2/` incl. the 49→25 red-team register + `tasks/plan.md`/`tasks/todo.md`, restored at `b53bb3e`); secondary cross-check: `docs/recovered/2026-07-09/` | APPROVED spec whose original files were destroyed 2026-07-09 (RSK-13) and restored + committed at `b53bb3e`; **referenced, not re-planned or clobbered** (A-19 prerequisite for M2 scale); verify restoration fidelity against the reconstruction, then use the restored register — no re-red-team required. |

### 7.3 Human gates (permanent — never automated)

| Gate | Task | Marker |
|---|---|---|
| **G1** provider/brand approval + KYC | T-ING-2 (M1) | ⛔ ASK FIRST — the true M1 revenue blocker (A-05). |
| **G2** legal copy sign-off | T-CMP-1 (M1) | ⛔ ASK FIRST — blocks M1 prod launch (A-14, RSK-10). |
| **G3** payout/banking KYC | T-MON-6 (M3) | ⛔ ASK FIRST — ledger view only; no disbursement (A-15). |
| _(destructive prod cron)_ | url-slug D3 expiry cron, tracked by T-SEO-6 | ⛔ ASK FIRST before enabling in prod (mirrors D3 in the committed `tasks/todo.md`, restored at `b53bb3e`). _v3.1 note: D3 needs lifecycle-unification first — the verifier's `hidden` (DSN-ING-11/12) and main's stale-hide (restored by T-ING-6) already cover much of the 48h-expiry intent; decide whether stale-hide subsumes the pg_cron before building it; keep the never-DELETE CI grep guard._ |

---

_End of v3.1 Tasks. Executors: run each task's **Verify** before ticking it; never conflate merged-on-branch / deployed-to-prod / verified-live (several tasks above are marked "implemented merged-on-branch" and remain UNTICKED until their Verify runs against `dealradar.me`); never promise a literal 100% (PRD §1.2); do not edit anything under `docs/recovered/2026-07-09/` or the frozen `docs/ground_source_of_truth/2026-07-08_v3/` — T-SEO-6 only tracks the url-slug workstream's completion via the committed `docs/specs/url-structure/2026-07-08_v2/` package (restored at `b53bb3e`)._
