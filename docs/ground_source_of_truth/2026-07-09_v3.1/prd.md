# Product Requirements — Version 3.1 (Platform Scope) — DRAFT
## Project: DealRadar — Autonomous, Geo-Located, Multilingual Affiliate Deals Platform for Europe

* **Status:** DRAFT — canonical once the human confirmations in §4 (Assumptions Block, OBJ target numbers, gates G1/G2/G3) are signed off.
* **Version:** **v3.1 — post-merge reconciliation of the `91140c9..155cf06` code delta + the 2026-07-09 data-loss event; supersedes `2026-07-08_v3`; authored 2026-07-09.** _Grounding SHAs: the code delta is grounded on `155cf06` (the merge commit, unchanged code tree); the current branch HEAD is `b53bb3e` (docs-only restore commit, 2026-07-09 10:56 — restores the url-slug spec package; see A-19/RSK-13)._ Also supersedes the `2026-06-23_v2/` ground-source-of-truth suite **and** folds in the `2026-06-28` Tier-1 remediation plan (`docs/remediation_plan/2026-06-28_v1/`). Where v2 self-reported "all findings RESOLVED," this suite honors the **code-grounded** status instead. New in v3.1: **RSK-13/RSK-14**, four new §8.2 threshold rows, refreshed §2 evidence, amended A-02/A-19, extended OBJ-2/SC5.
* **Date:** 2026-07-09
* **Sibling docs:** [requirements.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/requirements.md) (`FR-*`/`NFR-*`), [design.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/design.md) (`DSN-*`), [tasks.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/tasks.md) (`T-*`).
* **Traceability contract:** every `FR-*`/`NFR-*` in requirements.md cites the `OBJ-*` it serves; every `DSN-*` cites the `FR/NFR` it satisfies; every `T-*` cites its `DSN` + `FR/NFR` + `OBJ`. No orphans.

---

## 1. Vision & Framing

### 1.1 Vision
DealRadar is a programmatic, geo-located, multilingual (13 locales / 16 countries) price-comparison and deals aggregator for Europe. It earns **affiliate commission** on transactions it refers to multi-channel affiliate platforms (Awin, Tradedoubler, Kelkoo, planned Strackr, aggregator sub-networks). **Traffic is ORGANIC ONLY** — SEO (search engines) + AEO (answer engines) + GEO (being cited by ChatGPT/Perplexity/Gemini). No paid acquisition.

Success = commission. Commission requires transactions. Transactions require referral clicks. Clicks require **indexed pages**. **Zero deal URLs are indexed in production today** — that is the critical-path blocker this document is organized around.

### 1.2 Framing rule — no literal 100% (load-bearing)
"100% autonomous / reliable / successful" is the **ambition**, not an engineering target. This document NEVER states a literal 100% target. Concretely:
* **(a) Autonomous OPERATIONS with a thin human escalation lane.** Three permanent human gates remain: **G1** affiliate/brand approval (KYC), **G2** legally-binding copy sign-off, **G3** payout/banking KYC.
* **(b) Reliability = defended SLOs + graceful degradation + self-healing**, never a literal 100%. Every reliability claim is an SLO with a measurement method and a degradation path.
* **(c) Success = commission**, which requires indexed pages — the current blocker.

### 1.3 Three-state honesty (mandatory in every current-state claim)
`merged-on-branch` ≠ `deployed-to-prod` ≠ `verified-live`. Almost every remediation below is merged-on-branch only; prod (`https://dealradar.me`) deployment state is **UNKNOWN today** — on 2026-07-09 it still served an old-format sitemap with zero `/deal/` URLs, so at minimum it lags the branch (code tree `155cf06`; branch HEAD `b53bb3e`, docs-only), and zero URLs are indexed. The prod **DB shape is also UNKNOWN** (probe before any schema apply). Provider feeds are credential-gated — with no key each falls back to mock and reports `isMock:true`, so nothing monetizable runs in prod today.

### 1.4 Agentic-vs-deterministic rule
Every automation is classified **DETERMINISTIC** (repeated, predictable → coded pipeline/cron/SQL/pure fn — the default), **AGENTIC** (genuine judgment/ambiguity → LLM agent, only the 4 sanctioned cases: provider field-mapping, editorial copy, commission-dispute triage, novel-incident triage), or **HUMAN-GATED** (legal/KYC/approval — G1/G2/G3). Prefer deterministic; reach for agentic only where judgment is genuinely required.

### 1.5 Measurability rule
Every objective, requirement, and task carries a MEASURABLE acceptance signal answering all three: **how success/failure is evaluated**, **how the built feature is verified/tested**, and **how it is MONITORED in production** (the observability hook for the agentic-SDLC). Vague verbs ("improve","optimize","robust") are banned unless paired with a number + a measurement method.

---

## 2. Problem Statement

| Pain point | Evidence (code-grounded) | Impact |
|---|---|---|
| Zero indexed URLs | GSC coverage = 0; **verified-live 2026-07-09:** prod `sitemap.xml` has zero `/deal/` URLs and a uniform build-time lastmod (143 old-format entries, `2026-07-07T12:19:31Z`) | No organic traffic → no clicks → **no commission** |
| Prod build lags branch | Prod = `dealradar.me`, deployed SHA ≠ the branch (**code tree `155cf06`**; branch HEAD `b53bb3e`, docs-only); prod still served the older sitemap format on 2026-07-09. **Deploying HEAD as-is is now BLOCKED by two P0s** (schema.sql duplicate `record_price_history`; reverted `ingest-awin`) — see RSK-14 / T-DB-0 / T-ING-6 / T-INF-1 | Remediations are invisible to users/crawlers |
| Stale host strings | The `.eu` fallback survives at **new call sites**: `src/app/sitemap.ts:6`, `src/app/[locale]/deal/[slug]/page.tsx:20`, `src/lib/db/alerts.repo.ts:100` (alert emails); `.next/server/app/sitemap.xml.body` proves the fallback fires; `src/app/robots.ts:3` adds a DIFFERENT host bug (`process.env.URL`, not `NEXT_PUBLIC_APP_URL` — previews advertise preview sitemaps); `public/robots.txt:18` still carries a `dealradar.eu` Sitemap line (shadowed dead weight); the corrected `dealradar.me` fallback landed only in the dead module `src/lib/email/unsubscribe.ts:28-30` | Canonical/hreflang/JSON-LD point at the wrong host → index poisoning |
| No monetizable feed live | All revenue providers credential-gated → mock fallback | Nothing earns; mock rows can pollute prod |
| Highest-commission-wins absent | dedup keeps LOWEST price; no `commission_rate` datum exists | Revenue left on the table on every duplicate |
| No observability / Operator | Only `console.*`; subsystem 6 greenfield | Feed/index/postback anomalies undetected; no self-heal |
| Placeholder legal identity | `imprint` VAT `BE 0123.456.789`, `contact@dealradar.eu` | EU launch-blocker until counsel sign-off (G2) |
| Thin PDP content | `gallery`/`description`/`merchant_url` columns now EXIST (`schema.sql:6-36`) but are rendered by **no reachable surface** (the 211-line `DealDetailModal` is dead code, zero importers); the SSR PDP still renders name/price/shop/image only; the reverted ingest doesn't populate the columns for new rows — cross-ref **FR-PDP-7** | Weak AEO/GEO extraction; thin-content risk at scale |

---

## 3. Scope — the 7 subsystems

| # | Subsystem | Primary OBJ |
|---|---|---|
| 1 | Catalog Ingestion (multi-source, normalize, dedup incl. EAN + highest-commission-wins, freshness) | OBJ-2 |
| 2 | Monetization & Attribution (subID → click → postback → ledger → reconciliation → payout) | OBJ-3 |
| 3 | PDP & Content Quality (real data, editorial overlay surviving upserts, category tree) | OBJ-4 |
| 4 | Organic Growth Engine SEO/AEO/GEO (URLs, JSON-LD, AI-proof fields, hreflang, sitemaps, indexing, programmatic scale, internal linking, freshness) | OBJ-5 |
| 5 | Infra, Scale & Reliability (serverless limits, caching, DB scale, cron orchestration, cost) | OBJ-6 |
| 6 | The Autonomous Operator (monitor → self-heal → escalate; thin human lane) | OBJ-7 |
| 7 | Compliance & Trust (GDPR, affiliate disclosure, cookie consent, legal/Impressum) | OBJ-8 |

Revenue realization (OBJ-1) is the cross-cutting north star that all seven serve.

---

## 4. Assumptions Block (A-01 … A-19)

Each assumption is a **human confirmation** the machine cannot self-authorize. Tasks and requirements cite these by ID; a bracketed target in tasks.md resolves to the value here.

| ID | Assumption | Confirm-by | Bound / value |
|---|---|---|---|
| **A-01** | Production domain is `https://dealradar.me`; `.eu`/`.app` are stale and must be purged from source. | Ops | host literal |
| **A-02** | The `feat/tier1-remediation-2026-06-28` branch is the intended prod build to deploy — at branch HEAD (**`b53bb3e` at authoring; `155cf06` is the code tree** — the extra commit is docs-only). **PRECONDITION before deploy/merge-to-main:** fix the `schema.sql:249-270` duplicate `record_price_history` (T-DB-0) and restore main's `ingest-awin.cjs`/`.yml` (T-ING-6); `db-migrate.yml` **auto-applies** `schema.sql` on any push to main touching it — the break would self-deploy. | Ops | branch = deploy source |
| **A-03** | The M1 launch country + its single live provider is **DE via AWIN _or_ Kelkoo** (one, not both). | Business | 1 country, 1 provider |
| **A-04** | Netlify is the prod host; no always-on worker — always-on work runs on GH Actions cron / Netlify Scheduled Functions / external. | Ops | serverless-only |
| **A-05** | Affiliate/brand approval + credentials (G1) are obtainable for the A-03 provider. **This is the true M1 revenue blocker.** | Business (G1) | KYC gate |
| **A-06** | Supabase Postgres remains the single system of record for deals/transactions/price_history/price_alerts. | Ops | one DB |
| **A-07** | The 2026-06-28 remediation migration may be applied to the **prod** DB via the idempotent `db-migrate` runner. | Ops | prod DB mutation OK |
| **A-08** | Upstash Redis + the free tiers of Supabase/Netlify/GH Actions are the launch cost envelope. | Ops | free-tier launch |
| **A-09** | The monthly cost ceiling / scale-up trigger. **Provisional default until confirmed:** Supabase rows > 5,000,000 **OR** GH Actions > 2,000 min/mo **OR** AWIN egress > 350 MB/run **OR** Vertex/LLM token spend > 20M tokens/mo (the 4 agentic crons). | Ops | provisional numbers |
| **A-10** | The M2 indexing target: **≥ 1,000 indexed URLs within 90 days** of go-live (from 0 today). | Growth | 1,000 / 90 d |
| **A-11** | `historical_low_price` coverage target: **≥ 60%** of active deals after ~30 refresh cycles. | Growth | 60% |
| **A-12** | The CWV budget for PDPs: LCP < 2.5 s, CLS ≈ 0. | Growth | Core Web Vitals |
| **A-13** | The M3 breadth target: **≥ 4 countries** live with non-mock deals; cross-network EAN collapse **≥ 10%** (provisional). | Business | 4 / 10% |
| **A-14** | Binding legal copy (Impressum/Privacy/Terms) requires **counsel sign-off (G2)** before EU prod deploy. | Legal (G2) | KYC/legal gate |
| **A-15** | Payout disbursement requires a real entity + banking KYC **(G3)**; disbursement is out of scope until then (see §6.3). | Legal/Finance (G3) | KYC gate |
| **A-16** | Live email deliverability depends on a verified Resend (or equiv.) sending domain. | Ops | mail domain |
| **A-17** | A per-merchant/network **commission-rate datum** can be sourced to enable highest-commission-wins. No provider emits it today. | Business | rate feed |
| **A-18** | The only stored PII is `price_alerts.email` (no account/user table, no PII store). Therefore **GDPR Art 15 access & Art 17 erasure are satisfied** by one-click unsubscribe (self-service delete) + the automated retention purge; no separate DSAR handler is required. Measurable: a lint proving no other PII column exists on any table. | Legal | PII scope |
| **A-19** | The APPROVED, in-flight **url-slug rework** (public_id-stable URLs, redirect ladder, expired-state, sitemap sharding, category metadata, `/search` noindex) is the prerequisite implementation vehicle for M2 scale. Its authoritative acceptance in v3.1 is `DSN-SEO-1/4/5/6/7` (design.md §4). **2026-07-09 data loss (EVENT 3) — since RESTORED:** the human-approved spec package was destroyed by a git pull (untracked, never committed), then restored and **COMMITTED at `b53bb3e`** (2026-07-09 10:56): `/Users/danielmanzela/DealRadar/docs/specs/url-structure/2026-07-08_v2/` (HANDOFF.md, spec.md, plan.md, tasks.md, v1-superseded.md, **redteam-register.md — the 49→25 register: 25 accepted findings — plus redteam-adjudication-full.json**, 280 lines of per-finding evidence) and `tasks/plan.md` + `tasks/todo.md`. **That committed package is the authoritative spec + red-team reference.** _Fidelity caveat: it is a restoration from the authoring session's context + workflow journals (per commit `b53bb3e`), not a byte-provable copy of the destroyed originals — spot-check it against the secondary reference `docs/recovered/2026-07-09/url-slug-spec-RECONSTRUCTION.md` (lossy; 12 locked decisions + acceptance criteria) rather than blind-trust; no re-red-team is required._ The v3.1 acceptance (`DSN-SEO-1/4/5/6/7`) remains the in-suite statement of the rework; the committed package carries the full detail. | Growth | M2 prerequisite |

---

## 5. Objectives (OBJ-1 … OBJ-8)

Each objective states an **Evaluate** (success/failure predicate), **Verify** (test method), and **Monitor** (prod observability hook). Milestone mapping: M0 baseline → M1 thin loop → M2 growth → M3 breadth → M4 operator.

### OBJ-1 — Realize commission revenue (north star)
* **Evaluate:** ≥ 1 commission event persists in `transactions` with a recovered `product_id` (M1); `commission_events/day > 0` sustained (post-M2).
* **Verify:** `scripts/thin-loop-drill.mjs` completes render→click→postback→row; cross-checked against the network dashboard.
* **Monitor:** OBJ-1 KPI panel `commission_events/day`; **alert if commission = 0 across a rolling 30-day window** post-M1.

### OBJ-2 — Live, deduped, fresh multi-source catalog
* **Evaluate:** `count(*) FROM deals WHERE source<>'mock' > 0` for live countries; 0 rows with `discount_percent NOT BETWEEN 0 AND 100`; 0 `slug IS NULL`; data staleness ≤ 26 h; _(v3.1)_ **verifier-corrected prices survive the next feed ingest** (no daily clobber window — today the reverted 03:00 ingest clobbers 05:00 verifier corrections, main's `fetchExistingPrices` absent from HEAD); **deals absent from the feed AND unverifiable for 3+ days become hidden** (stale-hide, lost in the merge).
* **Verify:** integration refresh logs `upserted N>0` + dedup ratio; `registry.test.ts` green.
* **Monitor:** per-source `upserted`, dedup-ratio drift, `max(now − last_updated)`; _(v3.1)_ **count of price rows overwritten by feed within 24 h of a verifier correction**.

### OBJ-3 — Attribution & ledger integrity
* **Evaluate:** outbound CTAs carry a lossless network-correct subID; valid signed postbacks persist idempotently with `product_id` recovered; ledger CHECK/FK constraints hold.
* **Verify:** `affiliate.test.ts` round-trip + postback-route branch tests; `pg_constraint` shows FK + `_commission_chk` + `_status_chk`.
* **Monitor:** subID-carry %, postback 401-rate, FK-null-fallback count, null-recovery %.

### OBJ-4 — PDP & content quality
* **Evaluate:** ≥ 95% of PDPs return 200 with H1 + price; editorial overlay survives a refresh; leaf category tree resolves as real routes; curated PDPs carry non-thin blocks.
* **Verify:** rename+refresh overlay-survival test; `generateStaticParams` enumerates taxonomy; view-source shows enriched blocks.
* **Monitor:** `/deal/*` 404-rate; GSC "crawled — not indexed"/thin-content signal; count of deals with persistent human copy.

### OBJ-5 — Organic growth (SEO/AEO/GEO) — critical path
* **Evaluate:** **0 → ≥ 1,000 (A-10)** indexed URLs within 90 d; 0 errors across the audited canonical/hreflang/host sample; RRT 0 errors; ≥ 1 AI-engine citation observed.
* **Verify:** GSC coverage delta; RRT on live PDPs; `scripts/probe-citations.mjs` records a citation.
* **Monitor:** weekly GSC index-coverage delta; JSON-LD validity; rank/CTR from GSC Search Analytics; AI-bot fetch logs.

### OBJ-6 — Infra, scale, reliability & cost
* **Evaluate:** prod runs the branch on the right host with the migration applied; refresh fan-out completes with no function timeout; empty-`.env` build exits 0; monthly spend ≤ the A-09 cap.
* **Verify:** prod curl 200 + deploy-SHA match; timed full-matrix refresh; clean-env `pnpm build` exit 0; `checkBudgets()` flags an over-budget scenario.
* **Monitor:** uptime probe, refresh p95/timeout count, cost signals vs the A-09 trigger.

### OBJ-7 — The Autonomous Operator
* **Evaluate:** the Operator detects & correctly actions **≥ 90%** of injected fault-drills **within MTTA ≤ 15 min / MTTR ≤ 60 min (NFR-AUTON-1)**; the dead-man's switch fires if it goes silent; false-positive rate = 0 on a clean run.
* **Verify:** `scripts/game-day.mjs` per fault class; MTTA/MTTR read from `operator_incidents`.
* **Monitor:** drill pass-rate + MTTA/MTTR panel; Operator meta-health (heartbeat, delivery-ack, FP-rate).

### OBJ-8 — Compliance & trust
* **Evaluate:** real counsel-signed Impressum (no placeholder strings in prod); 13-locale legal parity; a Sponsored badge adjacent to every CTA; 0 non-essential cookies pre-consent; one-click unsubscribe + retention purge working; consent audit logged.
* **Verify:** `grep` placeholder/stale-host in prod = 0; `check-i18n.mjs` exit 0; badge-presence test; incognito cookie inspection; unsubscribe both-verb tests.
* **Monitor:** compliance watch (parity, badge, cookie, placeholder-string), retention-job success, consent-audit write success.

---

## 6. Business Model & Monetization Scope

### 6.1 Model
B2B2C affiliate. Revenue = commission paid by affiliate platforms on successful transactions. Clicks are encoded in affiliate subIDs; conversions arrive via `POST /api/postbacks` into the `transactions` ledger.

### 6.2 Attribution chain
`subID (render-time, lossless hex) → outbound click → network postback → transactions ledger → reconciliation (M3) → payout (out of scope, §6.3)`.

### 6.3 Payout scope (bounded)
Payout **disbursement is out of scope** for v3. Only a read-only `payout_ready` ledger view (`SUM(commission) WHERE status='approved'` grouped by network) ships. Disbursement/banking code is **HUMAN-GATED (G3)** and blocked on A-15 (entity + banking KYC). No disbursement path ships pre-entity.

---

## 7. Success Criteria (SC1 … SC8)

| ID | Success criterion | Gate |
|---|---|---|
| **SC1** | Prod runs the branch on `dealradar.me`; 0 stale-host literals in prod output. | M0 |
| **SC2** | A refresh with no live creds writes **0** rows (no mock pollution). | M0 |
| **SC3** | ≥ 1 non-mock deal + ≥ 50 indexed-eligible PDPs (200 + valid JSON-LD) for the launch country. | M1 |
| **SC4** | ≥ 1 postback persists with a recovered `product_id` (the thin-loop north-star proof). | M1 |
| **SC5** | Google Rich Results Test = **0 errors** on live PDPs across ≥ 3 locales **AND availability truthful — no `hidden=true` deal emits `InStock`**. _(v3.1: today the PDP hardcodes `InStock` at both offer levels and `getDealBySlug` doesn't filter `hidden`, so verifier-hidden gone/sold-out deals serve 200 + `InStock` structured data — an RRT/price-accuracy (Merchant listings) penalty vector that can fail SC5 at scale; carried by the FR-SEO-2/T-SEO-2 edits.)_ | M1 |
| **SC6** | 0 → ≥ 1,000 (A-10) indexed URLs within 90 d; ≥ 1 AI-engine citation observed. | M2 |
| **SC7** | ≥ 4 (A-13) countries live; cross-network EAN dedup + highest-commission-wins + reconciliation operating. | M3 |
| **SC8** | Operator actions ≥ 90% of fault-drills within MTTA ≤ 15 min / MTTR ≤ 60 min; dead-man's switch fires on silence. | M4 |

---

## 8. Risks (RSK-1 … RSK-14), Sequencing & Operator Thresholds

### 8.1 Risk register

| ID | Risk | Mitigation | Owning task |
|---|---|---|---|
| **RSK-1** | Merged-on-branch mistaken for live; remediations never reach users. | Three-state honesty; prod-curl Verify on `dealradar.me`. | T-INF-2 |
| **RSK-2** | Stale `dealradar.eu`/`.app` host poisons canonical/hreflang/JSON-LD. _(Still live 2026-07-09: new `.eu` fallbacks landed via the merge — `sitemap.ts:6`, deal page `:20`, `alerts.repo.ts:100`; the local build artifact proves the fallback fires; `robots.ts` adds the `process.env.URL` preview-host variant.)_ | One shared `baseUrl()` helper (throw in prod when `NEXT_PUBLIC_APP_URL` unset) replacing ALL derivations incl. `robots.ts` `process.env.URL`; CI grep gate on `dealradar\.(eu\|app)` in `src/` AND on `process.env.URL` outside netlify functions. | T-SEO-1 |
| **RSK-3** | Migration drift — a prod constraint/trigger silently disappears. | Constraint-presence probe; idempotent re-apply. | T-INF-1 |
| **RSK-4** | Mock rows pollute the prod `deals` table when creds absent. | `isMock` pre-upsert write gate; `mock_rows_written`=0. | T-ING-1 |
| **RSK-5** | Thin PDP content → thin-content penalty / weak AEO/GEO extraction. _(Shape changed 2026-07-09: real content — gallery/description — now sits in DB columns rendered nowhere reachable, and the reverted ingest stops populating them for new products.)_ | Render the existing gallery/description columns on the SSR PDP + feed `deal.description` into JSON-LD (**T-PDP-6**) — the cheaper first step; the editorial overlay (T-PDP-3/4) remains the durable fix. | T-PDP-6, T-PDP-3/4 |
| **RSK-6** | Dedup optimizes consumer price, never revenue (no commission datum). | Highest-commission-wins selector once A-17 rate feed exists; degrade to price-only with a signal. | T-ING-9 |
| **RSK-7** | AWIN bypasses the registry dedup path → cross-network EAN collapse impossible. | Fold AWIN into the dedup path (set-reconciliation on EAN). | T-ING-8 |
| **RSK-8** | Netlify function ceiling < refresh fan-out → silent timeout. | Measure real ceiling; chunk/offload to a GH Action. | T-INF-3 |
| **RSK-9** | Building the Operator before signals exist = monitoring an empty system. | Sequence the Operator LAST; land the substrate (T-OPS-1) first. | T-OPS-1 |
| **RSK-10** | Placeholder legal identity shipped to EU prod. | G2 counsel sign-off; placeholder-string grep gate. | T-CMP-1 |
| **RSK-11** | A newly-live provider yields 0 normalized deals (masked by mock fallback). | First-activation field-map verification + 0-yield alert. | T-ING-3 |
| **RSK-12** | Cost overspend surfaces only as a provider bill. | In-repo cost guardrails + the A-09 scale-up trigger. | T-INF-9 |
| **RSK-13** | _(new v3.1)_ Untracked spec/plan artifacts are destroyed by routine git operations. **ALREADY OCCURRED 2026-07-09:** the human-approved URL-spec package + the 49→25 red-team register were lost to a pull. **PARTIALLY REMEDIATED at `b53bb3e`** (2026-07-09 10:56): `docs/specs/url-structure/2026-07-08_v2/` (incl. the register + adjudication JSON) and `tasks/plan.md`+`tasks/todo.md` were restored and committed; `docs/recovered/2026-07-09/` holds the secondary lossy reconstruction. **Still untracked today (residual risk):** `docs/ground_source_of_truth/2026-07-08_v3/`, `docs/ground_source_of_truth/2026-07-09_v3.1/`, `docs/recovered/`, `audit/2026-07-09_consolidation/`. | Commit the remaining untracked trees (`docs/ground_source_of_truth/*`, `docs/recovered/*`, `audit/2026-07-09_consolidation/*`) on the branch immediately; CI/pre-pull check for untracked files under `docs/`/`tasks/`/`audit/`. | **T-INF-12** (new) |
| **RSK-14** | _(new v3.1)_ Ours-biased merges from main silently destroy shipped behaviors or duplicate SQL objects. **Occurred at `155cf06`:** the merge ("keeping local architectures intact") reverted `scripts/ingest-awin.cjs` + `ingest-awin.yml` to `91140c9` (destroying merchant_url/gallery/description extraction, verified-price preservation, stale-hide, flag-homepage-hidden + post-ingest snapshot steps — `git diff 91140c9..HEAD -- scripts/ingest-awin.cjs` is EMPTY) and produced the duplicate `record_price_history` (kept both definitions). | Post-merge diff-vs-main review of every conflicted file; CI guard: one `CREATE OR REPLACE` per function name in `schema.sql`. | **T-ING-6** (restore), **T-DB-0**/T-INF-1 (schema) |

### 8.2 Operator monitor thresholds (the L1 deterministic breach set)
The Operator's deterministic monitor suite (T-OPS-2 / DSN-OPS-2) fires a breach when any threshold is crossed. False-positive rate must be 0 on a clean run.

| Signal | Breach threshold |
|---|---|
| `mock_rows_written` | > 0 in any cycle |
| per-source `upserted` | = 0 for a live provider in a cycle |
| data staleness | `max(now − last_updated)` > 26 h |
| `/deal/*` 404-rate | spike above the rolling baseline |
| JSON-LD validity | any drop from the prior valid count |
| index coverage | stall (no delta) while PDPs are live |
| postback 401 / FK-null | spike above baseline |
| commission | = 0 across a rolling 30-day window (post-M1) |
| cost | rows/minutes/egress over the A-09 cap |
| cron heartbeat | any cron silent or no-ops on a missing secret |
| rank / CTR (GSC Search Analytics) | material regression vs the trailing window |
| _(v3.1)_ verifier error ratio | `errors/done` > 80% in a run (today the job exits 0 even at 100% errors) |
| _(v3.1)_ daily price snapshot | `price_history` rows written = 0 for a UTC day while visible deals > 0 (a failed verify job also skips the day's only snapshot — at HEAD `snapshot-prices.cjs` is wired ONLY in `verify-awin.yml`; T-ING-6's restore re-adds main's post-ingest snapshot step, halving this exposure) |
| _(v3.1)_ sitemap honesty | sitemap contains any `hidden=true` slug |
| _(v3.1)_ verifier-vs-feed clobber | a verifier-corrected price overwritten by feed ingest within 24 h |

_The four v3.1 rows adopt DSN-OPS-2 (M4) like the rest; until then they are **manual-daily** checks per tasks.md §0.2.5._

### 8.3 Build sequencing (why the Operator is last)
M0 (deploy & data-integrity baseline) → M1 (thin revenue loop) → M2 (organic growth, the critical path) → M3 (breadth: cross-network dedup, commission-wins, reconciliation) → M4 (the Operator, built on the signals the earlier milestones emit). Building the Operator earlier monitors an empty system (RSK-9).

---

## 9. ID Crosswalk (v2 / remediation → v3)

The v3 AREA set is `{ING, MON, PDP, SEO, INF, OPS, CMP}` for FR/DSN/Task and `{PERF, REL, SEC, PRIV, SEO, COST, OBS, SCALE, AUTON}` for NFR. Prior generations used different axes; this crosswalk prevents silent traceability breaks.

| Prior | v3 mapping |
|---|---|
| v2 `FR-TRK-*` | `FR-MON-*` |
| v2 `FR-RTE-*` | `FR-PDP-*` / `FR-SEO-*` |
| v2 `FR-GEO-*` | `FR-SEO-*` |
| v2 `FR-LOC-*` | `FR-INF-*` (edge-geo) |
| v2 `FR-COMP-*` | `FR-CMP-*` |
| remediation `R-ING/MON/RTE/GEO/I18N/LOC/COMP/MAIL/SEC/PERF/OPS/TEST/UX-*` | folded into the v3 AREA set (RTE→PDP/SEO, I18N/MAIL→CMP, LOC→INF, TEST→NFR-REL, UX→NFR); `PDP`, `OPS` (Operator) and `AUTON` are **new** surface in v3 |
| v2 deliverables `U-*/P-*/V-*` | carried as provenance; each maps to a v3 FR (see requirements.md) |

**Naming hazard note:** the v2 folder's internal docs call themselves "Version 3 (Canonical)". This is the **real** v3 and supersedes BOTH the `2026-06-23_v2` suite AND the `2026-06-28` remediation. **Counting systems are distinct:** 79 audit findings ≠ 56 remediation requirements ≠ 51 baseline items ≠ 19 v2 findings ≠ this doc's OBJ/FR/NFR counts — do not conflate.

---

_End of v3.1 PRD. This document defines OBJ-1…OBJ-8, Assumptions A-01…A-19, Success Criteria SC1…SC8, Risks RSK-1…RSK-14, §6.3 payout scope, and §8.2 Operator thresholds that requirements.md, design.md, and tasks.md cite. Never promise a literal 100% (§1.2); keep three-state honesty in every status claim — prod deployment state and DB shape are UNKNOWN as of 2026-07-09._
