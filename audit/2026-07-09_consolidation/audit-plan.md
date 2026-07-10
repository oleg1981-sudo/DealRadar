# DealRadar consolidation audit — fix plan (2026-07-09, pass 2)

**Date:** 2026-07-09
**Baseline:** branch `feat/tier1-remediation-2026-06-28`, HEAD `155cf06`; delta audited `91140c9..155cf06`.
**Companion:** `/Users/danielmanzela/DealRadar/audit/2026-07-09_consolidation/findings.md` (defect IDs P0-x/P1-x/P2-x refer to its register).
**Framing:** merged-on-branch ≠ deployed-to-prod ≠ verified-live; prod DB/deploy state UNKNOWN. v3 IDs below are **exact**, taken from the pass-2 invalidation map (`findings.md` §5) and spec-conformance map (§6); IDs marked *(new)* have verified next-free numbers. All v3.1 doc edits land ONLY under `docs/ground_source_of_truth/2026-07-09_v3.1/`; the frozen v3, recovered, and 2026-06-23 trees are never edited.

Effort: S (< 1h), M (half-day), L (1+ day).

---

## P0 — do first, in this order

### P0-A. ✅ EXECUTED (`7f0ffa9`, 2026-07-09) — Commit the at-risk docs (data-loss prevention) — findings P0-3
- **Status update (2026-07-09):** partially delivered at `b53bb3e` — `docs/specs/url-structure/2026-07-08_v2/` + `tasks/plan.md`/`tasks/todo.md` are committed. **Completed at `7f0ffa9`** — both gsot suites, `docs/recovered/`, and this audit directory committed; `grep -E '^\?\? (docs|tasks|audit)/'` → empty.
- **What:** `git add` + commit `docs/ground_source_of_truth/2026-07-08_v3/` **and `2026-07-09_v3.1/`**, `docs/recovered/2026-07-09/`, and this `audit/2026-07-09_consolidation/` directory on the current branch. No content edits to the frozen/recovered trees — commit as-is.
- **Why:** these are the only surviving copies of the ground-source-of-truth and the reconstructed spec; a second pull can destroy them exactly as EVENT 3 did. Cheapest, highest-leverage action in the whole plan.
- **Where:** `/Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-08_v3/`, `/Users/danielmanzela/DealRadar/docs/recovered/2026-07-09/` (fidelity notes in its `README.md`), `/Users/danielmanzela/DealRadar/audit/2026-07-09_consolidation/`.
- **Effort:** S
- **v3 IDs:** **RSK-13** *(new — untracked-doc destruction, already occurred)*, owned by **T-INF-12** *(new, M0, FIRST task executed)*; enriches A-19 (repointed to the recovered docs). T-INF-12 acceptance: `git status` shows no untracked files under `docs/` or `tasks/`; the v3.1 suite is committed in the same change; >5-file rule waived/noted for a docs-only commit.

### P0-B. ✅ EXECUTED on-disk (`c2d9794`, 2026-07-09; prod probes pending) — Fix the duplicate `record_price_history()` in schema.sql — findings P0-1 (EVENT 2)
- **What:** delete the second definition + trigger block at `/Users/danielmanzela/DealRadar/supabase/schema.sql:248-270`; if the remediation's NULL-safe `IS DISTINCT FROM` comparison and the narrower `after insert or update of sale_price` trigger are wanted, fold them into def#1 (`:146-164`) instead of keeping two definitions. Before AND after any apply, verify the live DB: `select prosrc from pg_proc where proname='record_price_history';` and check the actual `price_history` shape (`day`/`currency` columns present?).
- **Why:** def#2 wins under last-definition-wins execution and inserts without `day` (NOT NULL, PK) and `currency` (NOT NULL) → every deals INSERT / sale_price UPDATE aborts → ingest (500-row batches, `scripts/ingest-awin.cjs:226-237`), `/api/refresh` persists (`src/lib/db/deals.repo.ts:65`), and verifier price corrections (`scripts/verify-awin.cjs:196-203`) all break. `.github/workflows/db-migrate.yml:11-17,38-46` auto-applies the file on push to main, so the break self-deploys on merge.
- **Where:** `supabase/schema.sql:146-164` (keep) vs `:248-270` (remove/merge); `db-migrate.yml`.
- **Effort:** S (fix) + S (live-DB verification, needs prod credentials — three-state: on-disk fix ≠ prod fixed).
- **v3 IDs:** **FR-ING-7** (rewritten to the day-keyed model), **DSN-ING-6** (redesigned seams), **T-ING-5** + **T-INF-1** (both new-defect-blocked; T-INF-1 gains the ⛔ "do NOT merge schema.sql to main until :249-270 is deleted" note + single-definition acceptance), **RSK-14** *(new — ours-biased merge regressions)*, **M0 exit gate** (adds `record_price_history` count = 1). In the url-slug track this is **T-DB-0** *(new)*, sequenced ahead of todo B1.

### P0-C. ✅ EXECUTED (`3ed5859`, 2026-07-09; one-cycle re-verification pending) — Restore main's ingest script + workflow — findings P0-2
- **What:** `git checkout main -- scripts/ingest-awin.cjs .github/workflows/ingest-awin.yml`, then diff-review to confirm the remediation guards (slug parity, guarded discount) survive — both versions already carry them — and that the restored workflow steps (post-ingest snapshot, flag-homepage-hidden sync) point at the right scripts. Fixes findings P1-7 as a side effect.
- **Why:** merge `155cf06` silently reverted both files to 91140c9, destroying: merchant_url/gallery/description extraction (new deals permanently skipped by the verifier, which selects `merchant_url=not.is.null`); verified-price preservation (feed clobbers verifier-corrected prices daily 03:00-05:00, re-opening Kuishi GBP-as-EUR); stale-hide (feed-dropped deals visible forever; verifier heartbeat write-only); the flag-homepage-hidden + snapshot workflow steps.
- **Where:** `/Users/danielmanzela/DealRadar/scripts/ingest-awin.cjs` (HEAD `:139-162,240-299` vs main `:138-161,245-256,326-338`), `/Users/danielmanzela/DealRadar/.github/workflows/ingest-awin.yml`.
- **Effort:** S (restore) + M (re-verification of one full ingest+verify cycle).
- **v3 IDs:** **T-ING-6** (ELEVATED to M0 — its two files are exactly the reverted ones), **DSN-ING-10** (authoritative version = main's), **OBJ-2** (Evaluate/Monitor additions), **RSK-14** *(new)*, **M0 exit gate** (adds `git diff main..HEAD -- scripts/ingest-awin.cjs` empty-or-superset). Side effect: unblocks **FR-ING-13/T-ING-11** *(new — hidden lifecycle)* by restoring the flag-homepage-hidden + snapshot workflow steps. Note: todo D2 (slug de-composition) must be applied AFTER this re-merge, since it patches the version that will actually run.

### P0-D. ✅ RESOLVED (2026-07-09, same day) — recover the destroyed spec package — findings P0-3 / EVENT 3
- **Resolution:** the authoring session restored the package byte-faithfully from its own context + workflow journals and **committed it as `b53bb3e`** (2026-07-09 10:56): `docs/specs/url-structure/2026-07-08_v2/` (HANDOFF.md, spec.md, plan.md, tasks.md, v1-superseded.md, **`redteam-register.md` — the 49→25 register — + `redteam-adjudication-full.json`**) plus live `tasks/plan.md` + `tasks/todo.md`. No Time Machine needed. The lossy `url-slug-spec-RECONSTRUCTION.md` is superseded (audit-trail only).
- **Residual actions:** (1) fidelity spot-check of the findings-§6 conformance mapping against the committed `spec.md` + register (code-side verdicts unaffected — they cite code, not spec text); (2) the 2026-06-28 `audit/audit-plan.md` remains the one unrecovered casualty (accept the loss; its findings companion is recovered verbatim).
- **v3 IDs (as landed in v3.1):** **A-19** + **T-SEO-6** manifest point at the committed package as authoritative; **RSK-13** marked partially remediated at `b53bb3e`; **T-INF-12** owns the remaining untracked trees (P0-A).

---

## P1 — next

### P1-A. ✅ MOOT (2026-07-10 prod probe) — `price_history` old→new migration guard — findings P1-1
> **Probe result (findings §7):** prod `price_history` is **already day-keyed** (`(product_id, day)` PK + `currency NOT NULL`); no remediation-shape table exists anywhere. There is no old→new migration to perform and the ALTER-vs-rename human gate dissolves. The guarded-migration clauses in T-ING-5/T-INF-1 become no-ops to be verified, not built. Original item kept below for the record.
- **What:** add an explicit guarded migration to schema.sql: if `price_history` lacks the `day` column, either ALTER in place (add `day date default (recorded_at::date)`, add `currency`, backfill, dedupe to one row per product/day, swap PK) or rename the old table aside and create the new shape. Determine the prod DB's actual shape FIRST (blocked on P0-B's verification query).
- **Why:** `create table if not exists` (schema.sql:118-126) silently keeps a remediation-shape DB → `snapshot-prices.cjs:53-60` 400s every batch and `/api/price-history` 500s (`price-history.repo.ts:23-28`) while workflows look green.
- **Where:** `supabase/schema.sql:118-126`; old shape at `91140c9:supabase/schema.sql`.
- **Effort:** M
- **v3 IDs:** **T-ING-5** + **T-INF-1** (both gain the guarded-migration acceptance), **FR-ING-7**, **DSN-ING-6**; url-slug todo **B1** (re-baselined on the post-merge schema, after T-DB-0/P0-B). **Candidate human gate (v3.1):** migration path choice — ALTER-in-place vs rename-aside — decided only after the prod shape probe.

### P1-B. Filter `hidden` on PDP, sitemap, and alert-dispatch reads — findings P1-2, P2-5
- **What:** add `.eq('hidden', false)` to `getAllDealSlugs` and `getRecentlyUpdatedDeals`; for `getDealBySlug`, return the row with its `hidden` flag and render an honest expired state per locked decision D6 (keep 200, availability `schema.org/OutOfStock`, disabled CTA, localized banner) instead of hardcoded `InStock`.
- **Why:** verifier-hidden (gone/sold-out) deals currently serve 200 + `InStock` JSON-LD, stay in the sitemap, and can trigger alert emails to dead offers — breaking the verifier's promise on exactly the SEO/AEO-critical surfaces.
- **Where:** `src/lib/db/deals.repo.ts:283-291,298-311,318-333` (pattern at `:106,:234`); `src/app/[locale]/deal/[slug]/page.tsx:73,79`.
- **Effort:** M
- **v3 IDs:** **FR-ING-13 / DSN-ING-12 / T-ING-11** *(all new — the hidden lifecycle chain)*, **SC5** (availability-truthful extension), **FR-SEO-2** (availability derives from deal state; use `deal.description`), **FR-CMP-8 / T-CMP-7** (no-alert-for-hidden), **FR-SEO-1 / DSN-SEO-1** (reconciliation note: hidden ≠ expired; hidden → 200 + OutOfStock + disabled CTA + out of sitemap NOW, cheap and pre-url-slug; D6's expired_at machinery lands with T-SEO-6). Locked decision **D6 is ALTERED, not just carried** (findings §6.1).

### P1-C. Sitemap: dynamic, sharded, honest lastmod, hidden-filtered — findings P1-3
- **What:** implement locked decision D8: `generateSitemaps()` sharded (@10k), active-only (`hidden=false`), lastmod from a real content-change timestamp (fallback `last_updated`; never `new Date()`), drop changefreq/priority from deal entries, paginate past the PostgREST row cap with `.range()`, and make generation per-request or ISR so the sitemap tracks ingest, not deploys. Replace the `dealradar.eu` fallback (see P2-B).
- **Why:** the current static metadata route is prerendered once at build — *verified-live*: dealradar.me/sitemap.xml has ZERO /deal/ URLs and uniform build-time lastmod; new deals never enter it between deploys; likely silent 1000-row truncation.
- **Where:** `src/app/sitemap.ts:6,23,34-54`; `src/lib/db/deals.repo.ts:318-333`.
- **Effort:** M-L
- **v3 IDs:** **FR-SEO-6** (acceptance additions), **FR-SEO-9** (sharding), **DSN-SEO-6** (rewritten description), **T-SEO-5** (blocked until per-request/ISR; acceptance: a post-deploy-ingested deal appears without redeploy); url-slug **C5 / T-SEO-6** — reframed as **REPLACE the merged sitemap.ts, not extend it** (it violates every D8 clause), while explicitly PRESERVING its hreflang-alternates helper and category entries. Dependency chain: T-DB-0 → B1 → C2 → ingest re-merge → T-SEO-6 → E1/E2.

### P1-D. Kill the /search crawl trap + noindex — findings P1-4
- **What:** add `generateMetadata` with `robots:{index:false,follow:true}` to the search page; stop minting a fresh seed into crawlable pagination hrefs on BOTH search and category pages (stable daily-deterministic seed, or strip seed from hrefs — `search/page.tsx:43,74`, `category/[slug]/page.tsx:42,74`); point the homepage "View all deals" CTA at a stable URL or nofollow it.
- **Why:** unbounded near-duplicate URL space on a force-dynamic route, funnel-fed by the homepage, on a site whose entire acquisition thesis is organic crawl budget. Violates D10.
- **Where:** `src/app/[locale]/search/page.tsx:43,74`; `src/components/home/HeroDeals.tsx:71`.
- **Effort:** S-M
- **v3 IDs:** **FR-SEO-11** (extended: no per-request seed in any crawlable href), **FR-SEO-15 / DSN-SEO-12 / T-SEO-11** *(all new — pagination + seed hygiene; also decides the unseeded homepage shuffle as accepted-churn or fix)*; url-slug **C7b / decision D10** (contradicted — escalated from P2-polish to P1 by the pass-2 conformance map).

### P1-E. Category page metadata — findings P1-5
- **What:** add `generateMetadata` to `category/[slug]/page.tsx`: localized title from the categories namespace, canonical `NEXT_PUBLIC_APP_URL/{locale}/category/{slug}`, 13-locale hreflang + x-default (reuse the PDP pattern at `deal/[slug]/page.tsx:35-43`). Decide crawler-visible inventory policy for the cookie-driven country variance (documented DEFAULT_COUNTRY view).
- **Why:** the mid-tail crawlable surface (13 locales x 11 categories) currently has a generic shared title, no canonical, no hreflang. Violates D10.
- **Where:** `src/app/[locale]/category/[slug]/page.tsx` (`:34-36` cookie); `src/app/[locale]/layout.tsx:22-25`.
- **Effort:** M
- **v3 IDs:** **FR-SEO-8** (acceptance adds cookie-independent crawler content); url-slug **C7a / decision D10**. Strategic note for v3.1: the entire mega-menu routes mid-tail terms to `/search?q=` (`categories.ts:14-17`) — add an FR to either accept that (noindexed) or introduce indexable sub-category URLs later; T-PDP-2 (real category routes) is load-bearing for D10.

### P1-F. Fix (or fence off) the DealDetailModal attribution bug — findings P1-6, plus P2-7/P2-9/P2-10
- **What:** decide the modal's fate. If keeping: fix `decorateAffiliateUrl(deal.shopUrl, deal.source, deal.country, deal.category, deal.productId)`, add SponsoredBadge, add the `deal.priceNote` key to all 13 message files, and wire an importer. If not: delete the modal and move gallery/description rendering (and `deal.description` into JSON-LD) onto the SSR PDP — that is where SEO/AEO value accrues either way. Consider changing `decorateAffiliateUrl`'s tail params to an options object so this call-site bug class dies.
- **Why:** the modal is dead code today, but it is one import away from shipping a CTA whose postbacks cannot be attributed to a product (subid `dealradar_<id>_gen_` → `decodeSubId` productId:null) with no visible affiliate disclosure.
- **Where:** `src/components/deals/DealDetailModal.tsx:35,173-194`; `src/lib/utils/affiliate.ts:73-79`; `src/app/[locale]/deal/[slug]/page.tsx:116-125`; `src/messages/*.json`.
- **Effort:** M
- **v3 IDs:** **FR-MON-1 / T-MON-1** (acceptance: every `decorateAffiliateUrl` call site enumerated in the test, or tail params refactored into an options object), **FR-PDP-7 / DSN-PDP-7 / T-PDP-6** *(all new — gallery + description + cardiogram onto the SSR PDP; wire-or-delete the modal; DSN-PDP-6 stays reserved for a11y)*, **FR-CMP-1 / T-CMP-2** (missing `deal.priceNote` key + usage-scan), **FR-CMP-3 / T-CMP-3** (badge-presence test enumerates all CTA callers), coupling to **FR-PDP-6 / T-PDP-5**. **Candidate human gate (v3.1): modal keep-or-delete.**

---

## P2 — then

| # | What | Why / Where | Effort | v3 IDs (exact) |
|---|---|---|---|---|
| P2-A | Port AI-bot allow groups (OAI-SearchBot, PerplexityBot, Google-Extended) into `robots.ts` rules[], switch BASE to `NEXT_PUBLIC_APP_URL`, delete shadowed `public/robots.txt` — findings P2-1 | GEO/AEO thesis depends on the AI groups; *verified-live* they are absent. `src/app/robots.ts:3,7-8`; `public/robots.txt:5-18` | S | **FR-SEO-7**, **DSN-SEO-7** (split status), **T-SEO-1** (Files list rewritten); url-slug **C6 / decision D9** (partial) |
| P2-B | Centralize one `baseUrl()` helper (throw in prod when `NEXT_PUBLIC_APP_URL` unset, else fallback `https://dealradar.me`); replace all three `dealradar.eu` call sites; add CI grep guard for `dealradar\.(eu\|app)` in src/ AND `process.env.URL` outside netlify functions — findings P2-2, P2-11 | Local build artifact proves the fallback fires. `sitemap.ts:6`; `deal/[slug]/page.tsx:20`; `alerts.repo.ts:100` | S | **RSK-2** (mitigation rewritten), **T-SEO-1** (owner); **T-CMP-5** (unsubscribe link host); url-slug **C6 / decision D9** |
| P2-C | verify-awin: flush patches/heartbeats incrementally (e.g. every 50 decisions) + `--deadline` that stops crawling in time to write; raise workflow timeout — findings P2-3 | 30-min kill loses ALL of a long run's work. `verify-awin.cjs:268,287-289`; `verify-awin.yml:31` | M | **FR-ING-12 / DSN-ING-11 / T-ING-10** *(all new — verifier chain)*; new **§8.2** threshold rows |
| P2-D | verify-awin: exit non-zero / emit workflow warning when errors/done exceeds threshold (e.g. >80%) — findings P2-4 | Green check at 100% error rate = silent zero coverage. `verify-awin.cjs:251,279-285,291` | S | **T-ING-10** *(new)*; **§8.2** row "verifier errors/done > 80%" (DSN-OPS-2, M4; manual-daily until then) |
| P2-E | Escape/validate product_ids in `touchLastUpdated`'s PostgREST `in.()` filter (or reject non-`[\w:.-]` ids at ingest, matching the /api/price-history regex) — findings P2-6 | Feed is untrusted input. `verify-awin.cjs:210`; `ingest-awin.cjs:129-133` | S | **T-ING-10** *(new)* acceptance clause |
| P2-F | Make `productSizes` return null until real stock data exists; delete the seeded "never fully sold out" fallback — findings P2-8 | Fabricated availability is a trust/compliance gun; currently unreachable but one import away. `product-details.ts:44-62` | S | **FR-PDP-6 / T-PDP-5** (acceptance narrowed; productGallery survives, relocated via **T-PDP-6** *(new)*) |
| P2-G | Delete dead `src/lib/email/unsubscribe.ts` (after moving its correct `siteOrigin()` into the shared baseUrl helper of P2-B); remove unused import — findings P2-12 | Incompatible second token scheme invites always-failing tokens. `unsubscribe.ts:15-36`; `alerts.repo.ts:14` | S | **T-CMP-7** subtask (explicit in its v3.1 rewrite) |
| P2-H | Unsubscribe GET → confirmation page whose button POSTs; keep RFC 8058 POST as-is — findings P2-13 | Mail-scanner prefetch silently unsubscribes. `unsubscribe/route.ts:43-55` | S-M | **T-CMP-5** (acceptance additions: both-verb Verify + raw-email inspection still to run) |
| P2-I | Enforce per-email alert cap in the DB (trigger or guarded-insert RPC) or document the accepted overshoot; consider double-opt-in — findings P2-14 | Check-then-insert race; IP limiter fails open without Upstash. `alerts/route.ts:49-52`; `redis.ts:78,83-85` | M | **FR-CMP-8** family — no dedicated v3 node; candidate new acceptance clause on **T-CMP-7** in v3.1 |
| P2-J | Fix stale comments: `refresh-deals.mts:2` ("every 15 minutes" → daily 06:00), `snapshot-prices.cjs:3-7` ("twice a day" → once post-verify); document the deliberate cadence (03:00 ingest → 05:00 verify+snapshot+purge → 06:00 refresh) and real alert latency (up to ~24h) — findings P2-15 | Comments are claims contradicting code evidence. | S | **FR-INF-2 / T-INF-3** (Verify adds the exact grep); **FR-CMP-8** latency note |
| P2-K | Add missing `deal.priceNote` key to all 13 message files (or remove call sites) + code-usage↔messages CI cross-check (extend `scripts/check-i18n.mjs`) — findings P2-9 | Literal "deal.priceNote" renders to users in 13 locales; cross-locale parity alone cannot catch an everywhere-missing key. `DealCard.tsx:102`; `DealDetailModal.tsx:174` | S | **FR-CMP-1 / T-CMP-2** (Files + usage-scan addition) |
| P2-L | Guard the DealCard slug fallback (only link when `deal.slug` is set, or route through buildDealPath once it exists) — findings P2-16 | Minted 404 links; the fallback hrefs would still 404 under the future resolver ladder (never stored slugs). `DealCard.tsx:27` | S | **FR-PDP-1** (acceptance); url-slug **C4 / decision D5** |

---

## Sequencing notes

1. P0-A (commit docs) before anything else — it is a pure `git add`/commit with zero code risk. In v3.1 this is **T-INF-12, the first task of a re-baselined M0**.
2. P0-B and P0-C are independent of each other; both must land before the branch merges to main (db-migrate auto-apply + the daily workflows make main the blast radius). In v3.1 they become **M0 pre-gate tasks**, and the M0 exit gate gains two clauses: `record_price_history` defined exactly once; `git diff main..HEAD -- scripts/ingest-awin.cjs` empty-or-superset.
3. P1-A is blocked on the prod-DB shape check from P0-B's verification step. **Gate proposal:** migration path (ALTER-in-place vs rename-aside) is a human decision after the probe.
4. P1-B/C/D/E can proceed in parallel; P1-F needs a keep-or-delete decision on the modal first. **Gate proposal:** modal keep-or-delete is a v3.1 human gate (attribution + disclosure + i18n all hang off it).
5. **URL/slug spec chain (v3.1 milestone, not this plan's P-items):** T-DB-0 (= P0-B) → B1 (content_changed_at etc., after the prod probe) → C2 (resolver ladder live BEFORE any slug-format churn — the sitemap now consumes DB slugs, so a rewrite without the ladder 404s every indexed URL) → ingest re-merge (= P0-C; stale-hide is the "active-only" setter) → T-SEO-6 sitemap replacement → E1/E2 verification. Todo D2 (slug de-composition, five sites) applies only after the re-merge; todo D3's 48h pg_cron is REPLACED by a lifecycle-unification task (three mechanisms overlap — see findings §6.2).
6. GSC sitemap submission (E2) waits on P1-C — submitting the current zero-deal-URL sitemap is wasted motion.

## Still open (needs user/prod access)

- ~~Time Machine recovery (P0-D)~~ — **RESOLVED**: restored + committed at `b53bb3e`. Residual: fidelity spot-check of findings-§6 + re-scope P1-C/D/E against the committed `spec.md`/register where they diverge from the reconstruction (code-side verdicts unaffected).
- **Prod verification**: ~~prod DB `price_history` shape + `record_price_history` prosrc~~ + ~~PostgREST max-rows~~ — **ANSWERED 2026-07-10 (findings §7)**: no trigger/function exists in prod at all; `price_history` already day-keyed (P1-A moot); max-rows = platform default 1000; **prod schema lacks the entire remediation layer (no slug/metadata columns, NO `transactions` table) → T-INF-1 must run strictly BEFORE T-INF-2 or the branch build breaks every upsert + PDP read.** Still open: deployed commit SHA on dealradar.me (PDP/JSON-LD/hreflang spot-check); workflow secrets (APP_URL/CRON_SECRET/WEBHOOK_SECRET/RESEND_API_KEY/Supabase); Netlify cron + build env (`NEXT_PUBLIC_APP_URL` evidently unset at build — the local artifact emits `.eu`).
- **GSC read**: coverage / sitemap processing / rich-result status, before and after the P1-C sitemap replacement; RRT on both a live and a hidden deal.
- ~~v3.1 authoring itself~~ — **DONE (2026-07-09)**: the suite exists at `docs/ground_source_of_truth/2026-07-09_v3.1/` ({README,prd,requirements,design,tasks,CHANGELOG}.md), adversarially verified (3 reviewers → 5 blocker/major fixes applied → 9 minors closed in an editorial pass). It carries the full §5/§6 propagation, both-direction trace matrices (61 DSN / 60 T), and the M0 pre-gate re-baseline.

## Changes from pass 1

- Every "v3 IDs (best guess)" entry replaced with **exact** IDs from the pass-2 invalidation map (findings §5) and spec-conformance map (§6), including the five verified-new chains: FR-ING-12/DSN-ING-11/T-ING-10 (verifier hardening → P2-C/D/E), FR-ING-13/DSN-ING-12/T-ING-11 (hidden lifecycle → P1-B), FR-PDP-7/DSN-PDP-7/T-PDP-6 (PDP content/cardiogram → P1-F), FR-SEO-15/DSN-SEO-12/T-SEO-11 (pagination/seed → P1-D), T-INF-12 + RSK-13/RSK-14 (→ P0-A/B/C), and T-DB-0 in the url-slug track (→ P0-B, ahead of B1).
- P1-C reframed from "implement D8" to "**REPLACE the merged sitemap.ts**" (it violates every D8 clause) while preserving its hreflang helper + category entries; P1-D's scope extended to the category-page pagination hrefs.
- Sequencing gained the url-slug dependency chain (note 5), the M0 re-baseline with two new exit-gate clauses (note 2), two named human-gate proposals (notes 3-4), and the GSC-waits-on-P1-C rule (note 6).
- Priorities and P0/P1/P2 membership are UNCHANGED from pass 1 — enrichment confirmed the ordering (locked decision D10's violation was escalated by the conformance map, but its fixes were already P1-D/P1-E here).
- Pass-1 "To enrich" items 1-2 resolved (exact IDs; M0 gates + gate placements); items 3-5 moved to "Still open"; item 5's answer: the URL/slug implementation (D1-D7) stays a separate v3.1 milestone with the chain in note 5 — nothing in P0-P2 depends on it, but P0-B/P0-C are its prerequisites.
