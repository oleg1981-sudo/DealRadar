# Design — Version 3.1 (Platform Scope) — DRAFT
## Project: DealRadar — Autonomous, Geo-Located, Multilingual Affiliate Deals Platform for Europe

* **Status:** DRAFT — canonical once the prd.md human confirmations are signed off.
* **Version:** **v3.1 — post-merge reconciliation of the `91140c9..155cf06` code delta + the 2026-07-09 data-loss event; supersedes `2026-07-08_v3`; authored 2026-07-09.** _Grounding SHAs: code delta grounded on `155cf06` (the code tree); current branch HEAD is `b53bb3e` (docs-only restore commit)._ Also supersedes `2026-06-23_v2/design.md` and the `2026-06-28` remediation component inventory (`C-*`), re-expressed as `DSN-*` on the v3 AREA set. New in v3.1: **DSN-ING-11/12, DSN-PDP-7, DSN-SEO-12** (**61** components, up from 57); DSN-ING-6/10, DSN-SEO-6/7, DSN-CMP-8 re-grounded on the post-merge code; DSN-PDP-6 stays reserved for the deferred a11y set.
* **Date:** 2026-07-09
* **Sibling docs:** [prd.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/prd.md) (`OBJ-*`), [requirements.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/requirements.md) (`FR-*`/`NFR-*`), [tasks.md](file:///Users/danielmanzela/DealRadar/docs/ground_source_of_truth/2026-07-09_v3.1/tasks.md) (`T-*`).
* **Traceability:** every `DSN-<AREA>-<n>` cites the `FR/NFR` it satisfies. §7 gives the reverse matrices (FR/NFR → DSN, and DSN → Task via tasks.md §7.1) so orphan detection runs in both directions.

---

## 1. Architecture overview

```
                        ORGANIC TRAFFIC (SEO / AEO / GEO)  ← the only inflow
                                     │
   Crawlers / users / AI answer-engines                 GSC + AI-citation probes
                                     │                             │
                         ┌───────────▼───────────┐                 │
                         │  Next.js 14 App Router │                 │
                         │  (Netlify serverless)  │                 │
   PDP  /[locale]/deal/[public_id]  ── SSR ──►  Supabase Postgres ◄─┼─ price_history trigger
   Category /[locale]/category/[...]           (deals, price_history,│   + hist-low RPC
   sitemap.ts / robots.ts                        transactions,       │
                         │  JSON-LD AggregateOffer  price_alerts,     │
                         │  hreflang / canonical    deal_curation,    │
                         │  affiliate CTA (subID)   consent_audit,    │
                         └───────────┬───────────┘  operator_*)       │
                                     │                                │
   Outbound click (subID) ──► Affiliate network ──► POST /api/postbacks ──► transactions ledger
                                     │                                        │
   Cron / scheduled (NO daemon):    │                              reconciliation (M3)
     • /api/refresh (fan-out)  • ingest-awin GH Action (03:00)  • purge-alerts (05:00)
     • verify-awin live-shop verifier + snapshot-prices (05:00, v3.1)  • refresh-alerts (06:00)
     • db-migrate  • index-poll  • citation-probe  • reconcile  • cost-guardrail
                                     │
                      ┌──────────────▼──────────────┐
                      │  THE OPERATOR (M4, last)     │  operator_signals / operator_incidents
                      │  L1 deterministic monitors → │  → self-heal playbooks → agentic triage
                      │  → escalation + dead-man's   │  → thin human lane (G1/G2/G3)
                      └──────────────────────────────┘
```

**Key design decisions.**
* **Serverless-only (A-04):** no always-on worker. Always-on work is GH Actions cron / Netlify Scheduled Functions / external. Agentic steps run off the request path (Vertex via a GH Action), never a daemon.
* **DB is the single source of truth (A-06):** hand-written repo layer, no ORM; RLS on all tables; service-role key server-side only.
* **Deterministic by default (PRD §1.4):** only 4 sanctioned agentic components (DSN-ING-8 field-map, DSN-PDP-4 editorial copy, DSN-MON-5 dispute triage, DSN-OPS-4 novel-incident triage). Each has a deterministic fallback.
* **The Operator is built LAST (RSK-9):** it can only monitor signals that exist; DSN-OPS-1 (the substrate) is the prerequisite every earlier task's `Monitor` hook adopts.

---

## 2. Data-model changes (grounded in `supabase/schema.sql`)

| Change | Purpose | FR/NFR |
|---|---|---|
| `transactions` FK ON DELETE SET NULL + `commission ≥ 0` CHECK + status-enum CHECK + `subid3`/`raw_payload`/`received_at` | ledger integrity | FR-MON-3, NFR-SEC-1 |
| `deals` `slug NOT NULL`; `public_id`/`legacy_slug`/`slug_base`/`expired_at`/`content_changed_at` (url-slug) | stable URLs, expired-state, freshness lastmod | FR-ING-6, FR-SEO-1/9 |
| _(redesigned v3.1)_ **day-keyed `price_history`** — PK `(product_id, day)`, `currency NOT NULL`, no FK — + the **single** day-based trigger + the daily post-verify snapshot writer (`snapshot-prices.cjs`) + `update_historical_lows_batch` RPC | proof field + cardiogram data | FR-ING-7, FR-PDP-5, FR-PDP-7 |
| _(new v3.1, via main)_ `deals` gains `hidden`, `homepage_hidden`, `gallery text[]`, `description`, `merchant_url` (`schema.sql:6-36`) | verifier lifecycle + real PDP content | FR-ING-12, FR-ING-13, FR-PDP-7 |
| `deal_curation` (overlay; LEFT JOIN at SSR, never upserted by ingest) | editorial survives upserts | FR-PDP-2 |
| `merchant_commission` (rate per merchant/network) | highest-commission-wins | FR-ING-9 |
| `reconciliation` | ledger vs network totals + aging | FR-MON-5 |
| `payout_ready` view (read-only) | payable sum by network (no disbursement) | FR-MON-6 |
| `consent_audit` (no PII) | Art 5(2) accountability | FR-CMP-7 |
| `operator_signals` / `operator_incidents` | observability substrate | FR-OPS-1 |
| hot-path indexes: `deals_public_id_idx`/`deals_ean_idx`/`deals_active_fresh_idx` | no seq-scan | NFR-PERF-3, NFR-SCALE-3 |

**⛔ P0 (2026-07-09, T-DB-0):** the on-disk `supabase/schema.sql` defines `record_price_history()` **TWICE** — def#1 (`:146-159`) is the correct day-based version; def#2 (`:250-265`, the remediation section) REPLACES it and inserts WITHOUT `day` (PK member, NOT NULL) and WITHOUT `currency` (NOT NULL); trigger#2 (`:267-270`) also wins. Applied to the new-shape table, every deal INSERT / `sale_price` UPDATE → 23502 → the whole upsert aborts → the ingest pipeline breaks. `db-migrate.yml` auto-applies `schema.sql` on push to main. This is the ON-DISK schema; whether the prod DB already has it applied is UNKNOWN — probe first. Also note `price_history` uses `create table IF NOT EXISTS` (`:118`), so a prod DB holding the remediation-era shape silently keeps it (then `snapshot-prices` 400s and `/api/price-history` 500s) — an explicit guarded old→new migration is required, not create-if-not-exists reliance.

---

## 3. Component inventory (DSN-*) — each cites the FR/NFR it satisfies

### 3.1 Ingestion (DSN-ING-*)
| DSN | Component | Satisfies | Evidence / seam |
|---|---|---|---|
| **DSN-ING-1** | Provider registry + priority routing + fall-through merge | FR-ING-1 | `src/lib/providers/registry.ts` |
| **DSN-ING-2** | Normalize → `NormalizedDeal` + clamped discount guard | FR-ING-2 | `providers/types.ts`, `category-map.ts` |
| **DSN-ING-3** | Hybrid dedup (EAN else name+shop; cross-network via AWIN fold) | FR-ING-3, FR-ING-4 | `registry.ts` dedup + `ingest-awin.cjs` |
| **DSN-ING-4** | Mock-pollution pre-upsert write gate (`isMock` + prod detection) | FR-ING-5 | `deals.repo.ts`, `refresh/route.ts` |
| **DSN-ING-5** | Non-null-slug guarantee on ingest | FR-ING-6 | `deals.repo.ts` (later moves to trigger via url-slug) |
| **DSN-ING-6** | _(updated v3.1)_ Day-keyed `price_history` (PK `product_id`+`day`, `currency`) + **single** day-based trigger + daily post-verify snapshot writer + 90-day historical-low RPC (`update_historical_lows_batch` works against both shapes). Also feeds the FR-PDP-7 cardiogram. | FR-ING-7, FR-PDP-5, FR-PDP-7 | `schema.sql:118-178` (single trigger def — see the §2 P0), `scripts/snapshot-prices.cjs`, `verify-awin.yml` |
| **DSN-ING-7** | Merchant-commission model + highest-commission-wins selector | FR-ING-9 | new `merchant_commission` + `registry.ts` selector |
| **DSN-ING-8** | Provider field-map verification (**AGENTIC**, deterministic fallback) | FR-ING-10 | `scripts/verify-provider-mapping.mjs` |
| **DSN-ING-9** | Bounded fan-out (country × category × locale) within the ceiling | FR-ING-11, FR-ING-1, FR-INF-4 | `registry.ts`, `refresh/route.ts` |
| **DSN-ING-10** | AWIN bulk feed (CSV stream parse → REST upsert, egress cap) + _(v3.1)_ merchant_url/gallery/description extraction, **verified-price preservation** (never clobber a verifier correction), and **stale-hide** (feed-dropped 3+ days → hidden). _Authoritative version = **main's** `ingest-awin.cjs`; HEAD carries the reverted `91140c9` body pending the T-ING-6 restore (RSK-14)._ | FR-ING-2, FR-ING-6, FR-ING-4, FR-ING-13, NFR-COST-2 | `scripts/ingest-awin.cjs`, `ingest-awin.yml` (both to be re-merged from main) |
| **DSN-ING-11** | _(new v3.1)_ Live-shop price **verifier** — daily 05:00 UTC; reads live merchant prices in the deal's market currency (Shopify `.js`/`.json` + `?country=CC`), hides gone/sold-out/undiscounted deals, unhides on return, heartbeat-touches unchanged deals. **DETERMINISTIC** (scripted crawl + rules — not one of the 4 agentic components). Known defects to fix (T-ING-10): writes deferred past a 30-min timeout lose everything; exit 0 at 100% errors; unescaped quotes in the `in.()` filter; heartbeat consumer (stale-hide) missing until T-ING-6. | FR-ING-12 | `scripts/verify-awin.cjs` (~307 lines), `.github/workflows/verify-awin.yml` |
| **DSN-ING-12** | _(new v3.1)_ `hidden`/`homepage_hidden` **lifecycle** — one coherent state model across all read surfaces: list/search/brands filter `hidden` (done); sitemap slugs, SSR PDP (honest OutOfStock state), and alert reconciliation must too (today blind); `flag-homepage-hidden.cjs` re-synced by an automated post-ingest step (today: no scheduled caller on HEAD). | FR-ING-13 | `src/lib/db/deals.repo.ts`, `scripts/flag-homepage-hidden.cjs`, `verify-awin.cjs` setters |

### 3.2 Monetization (DSN-MON-*)
| DSN | Component | Satisfies | Evidence / seam |
|---|---|---|---|
| **DSN-MON-1** | Outbound subID decoration (lossless hex round-trip) | FR-MON-1, NFR-PRIV-1 | `src/lib/utils/affiliate.ts` |
| **DSN-MON-2** | Hardened postback webhook (timing-safe secret + HMAC + replay + idempotent) | FR-MON-2, NFR-SEC-1, NFR-SEC-4 | `api/postbacks/route.ts`, `utils/crypto.ts` |
| **DSN-MON-3** | Ledger-integrity schema (FK/CHECKs) | FR-MON-3 | `schema.sql` transactions |
| **DSN-MON-4** | Attribution-plumbing cleanup (drop `affiliate_subid`; pair `subid3`) | FR-MON-4 | `deals.repo.ts`, `postbacks/route.ts` |
| **DSN-MON-5** | Reconciliation job (compare/aging + **AGENTIC** dispute triage) | FR-MON-5 | `scripts/reconcile.mjs`, `reconciliation` |
| **DSN-MON-6** | Read-only `payout_ready` view (no disbursement, G3) | FR-MON-6 | `schema.sql` view |

### 3.3 PDP & Content (DSN-PDP-*)
| DSN | Component | Satisfies | Evidence / seam |
|---|---|---|---|
| **DSN-PDP-1** | SSR PDP (real data, 200/404, CWV budget) | FR-PDP-1, NFR-PERF-2 | `[locale]/deal/[slug]/page.tsx` |
| **DSN-PDP-2** | `deal_curation` overlay table + SSR LEFT JOIN (survives upserts) | FR-PDP-2, FR-PDP-4 | `schema.sql`, `deals.repo.ts`, PDP page |
| **DSN-PDP-3** | Leaf category tree as real crawlable routes | FR-PDP-3 | `[locale]/category/[...slug]/page.tsx`, `categories.ts` |
| **DSN-PDP-4** | Editorial authoring worker (**AGENTIC** copy, human `legal_ok` gate) | FR-PDP-4 | `scripts/author-curation.mjs` |
| **DSN-PDP-5** | Dead synthetic-module retirement + grep gate _(v3.1: largely done merged-on-branch — specs/otherStoreOffers gone; `productSizes` fabrication + the dead-modal importer chain remain, see FR-PDP-6)_ | FR-PDP-6 | `src/lib/utils/product-details.ts` |
| _DSN-PDP-6_ | _(reserved — held for the deferred a11y set (WCAG/axe), per README "Not covered yet". Do not reuse the number.)_ | — | — |
| **DSN-PDP-7** | _(new v3.1)_ Cardiogram + real-content surface — 90-day price cardiogram (day-ordered read, regex-validated Redis-cached API), gallery + feed description on the SSR PDP; `DealDetailModal` wire-or-delete (today the richest presentation sits ONLY in the dead modal, with an arg-order CTA bug and no badge; `PriceHeatBar`'s series prop is unreachable from product code). | FR-PDP-7, FR-PDP-5 | `src/lib/db/price-history.repo.ts`, `/api/price-history`, `src/components/deals/PriceHeatBar.tsx`, PDP page |

### 3.4 Organic Growth (DSN-SEO-*)
| DSN | Component | Satisfies | Evidence / seam |
|---|---|---|---|
| **DSN-SEO-1** | `public_id`-stable URLs + one-hop 308 + expired-state 200 (url-slug) | FR-SEO-1 | url-slug vehicle (A-19); PDP routing |
| **DSN-SEO-2** | `Product`+`AggregateOffer` JSON-LD | FR-SEO-2, NFR-SEO-3 | PDP page JSON-LD block |
| **DSN-SEO-3** | AI-proof visible fields (90-day low, verified-at CET) | FR-SEO-3 | PDP page |
| **DSN-SEO-4** | Canonical + 13-locale hreflang (deal **and** category) | FR-SEO-4, FR-SEO-8 | PDP `generateMetadata`; category metadata (url-slug) |
| **DSN-SEO-5** | Host correctness (`NEXT_PUBLIC_APP_URL` derives all hosts) | FR-SEO-5, NFR-SEO-2 | `page.tsx`, `sitemap.ts`, env pin |
| **DSN-SEO-6** | _(updated v3.1)_ A DB-driven hreflang sitemap now **EXISTS** (build-frozen, unsharded, `.eu`-fallbacked, hidden-blind; `new Date()` lastmod on home/legal/category entries only — deal entries carry real `last_updated`, `sitemap.ts:46-51`, frozen solely by the static build); remaining work = **D8 conformance as a replacement-diff**: `generateSitemaps` @10k, active-only (`hidden=false`), `content_changed_at` lastmod, per-request/ISR generation, drop changefreq/priority from deal entries — **keep** the merged hreflang-alternates helper + category entries (net-new value). | FR-SEO-6, FR-SEO-9, NFR-SCALE-2 | `src/app/sitemap.ts`, `src/lib/db/deals.repo.ts` (`getAllDealSlugs`) |
| **DSN-SEO-7** | _(split status v3.1)_ Host-aware `robots.ts` + `/search` noindex — `robots.ts` **shipped-partial** (exists, verified-live; port the AI-bot groups from the shadowed `public/robots.txt`, fix `process.env.URL` → `NEXT_PUBLIC_APP_URL`, delete `public/robots.txt`); `/search` noindex **NOT built** (and see the seed crawl-trap, FR-SEO-11). | FR-SEO-7, FR-SEO-11 | `src/app/robots.ts`, `public/robots.txt` (delete), category/search meta |
| **DSN-SEO-8** | PDP internal-link graph (related/same-category/breadcrumb) | FR-SEO-10 | `RelatedDeals.tsx`, PDP page |
| **DSN-SEO-9** | Index submission + GSC/IndexNow coverage poll | FR-SEO-12, NFR-SEO-1 | `scripts/poll-index-coverage.mjs`, `index-poll.yml` |
| **DSN-SEO-10** | AI-engine citation probe | FR-SEO-13, NFR-SEO-4 | `scripts/probe-citations.mjs` |
| **DSN-SEO-11** | GSC Search Analytics rank/CTR feed → `operator_signals` | FR-SEO-14 | `poll-index-coverage.mjs` (Search Analytics call) |
| **DSN-SEO-12** | _(new v3.1)_ Crawlable numbered **pagination** (real next-intl `<a>` hrefs, clean page-1 URL, `aria-current`) with seed hygiene — no per-request-minted params in crawlable hrefs; stable homepage CTA target. | FR-SEO-15, FR-SEO-11 | `src/components/search/Pagination.tsx`, search/category pages, `HeroDeals.tsx` |

### 3.5 Infra & Reliability (DSN-INF-*)
| DSN | Component | Satisfies | Evidence / seam |
|---|---|---|---|
| **DSN-INF-1** | Netlify branch deploy (merged≠deployed close) | FR-INF-1, NFR-REL-1 | `netlify.toml` |
| **DSN-INF-2** | Function-ceiling measure + chunk/offload | FR-INF-2, NFR-SCALE-1 | `refresh/route.ts`, `refresh-deals.mts` |
| **DSN-INF-3** | Empty-env graceful-degradation gate | FR-INF-10, NFR-REL-3, NFR-REL-5, NFR-PERF-1 | `ci.yml`, null-safe clients |
| **DSN-INF-4** | Edge-geo middleware (default DE + sanitize, no geo persist) | FR-INF-4, NFR-SEC-5, NFR-PRIV-4 | `src/middleware.ts` |
| **DSN-INF-5** | Cron heartbeat + alarm-on-silent-no-op | FR-INF-5, NFR-OBS-3 | `refresh-deals.mts`, `.github/workflows/*` |
| **DSN-INF-6** | Idempotent migration runner + CI | FR-INF-6, NFR-SEC-2 | `apply-schema.mjs`, `db-migrate.yml` |
| **DSN-INF-7** | Security response headers / CSP | FR-INF-7, NFR-SEC-3 | `next.config.mjs` |
| **DSN-INF-8** | Atomic sliding-window rate limiting + fail-open warning | FR-INF-8, NFR-SEC-6 | `src/lib/cache/redis.ts`, route call-sites |
| **DSN-INF-9** | Cost guardrails (DB rows / actions / egress / agentic token spend) + A-09 scale-up trigger | FR-INF-9, NFR-COST-1, NFR-COST-2, NFR-COST-3, NFR-SCALE-3 | `scripts/check-budgets.mjs`, `cost-guardrail.yml` |
| **DSN-INF-10** | Hot-path indexes + `EXPLAIN` CI gate | NFR-PERF-3, NFR-SCALE-3 | `schema.sql`, `scripts/explain-gate.mjs` |
| **DSN-INF-11** | Backup/PITR + migration-rollback convention + restore drill | FR-INF-12, NFR-REL-6 | Supabase PITR; `db-migrate` rollback note; `db-restore` drill |

### 3.6 The Operator (DSN-OPS-*)
| DSN | Component | Satisfies | Evidence / seam |
|---|---|---|---|
| **DSN-OPS-1** | Observability substrate (`operator_signals`/`_incidents` + tracker + uptime + emit) | FR-OPS-1, NFR-OBS-1, NFR-OBS-2, NFR-REL-1 | `src/lib/observability/emit.ts`, `uptime-probe.mts` |
| **DSN-OPS-2** | Deterministic L1 monitor suite (§8.2 thresholds) | FR-OPS-2, FR-OPS-3, FR-OPS-4, FR-OPS-5, FR-OPS-6, FR-OPS-7, NFR-OBS-3 | `src/lib/operator/monitors.ts`, `operator-tick.mts` |
| **DSN-OPS-3** | Self-heal playbook runner (≤ 2 attempts → escalate) | FR-OPS-2, FR-OPS-3, FR-OPS-4 | `src/lib/operator/playbooks.ts` |
| **DSN-OPS-4** | Agentic triage + single-escalation composer (**AGENTIC**) | FR-OPS-8, NFR-AUTON-2 | `scripts/operator-triage.mjs` |
| **DSN-OPS-5** | Escalation delivery + dead-man's-switch watchdog (independent cron) | FR-OPS-9, NFR-AUTON-3 | `operator/escalate.ts`, `deadman-watchdog.mts` |
| **DSN-OPS-6** | Fault-drill (game-day) harness (8 fault classes) | FR-OPS-10, NFR-AUTON-1 | `scripts/game-day.mjs`, `game-day.yml` |

### 3.7 Compliance & Trust (DSN-CMP-*)
| DSN | Component | Satisfies | Evidence / seam |
|---|---|---|---|
| **DSN-CMP-1** | Localized legal pages + key-parity check | FR-CMP-1 | `scripts/check-i18n.mjs`, `messages/*.json` |
| **DSN-CMP-2** | Impressum identity (G2 counsel-signed) | FR-CMP-2 | `[locale]/imprint/page.tsx` |
| **DSN-CMP-3** | Affiliate-disclosure badge adjacent to every CTA | FR-CMP-3 | `SponsoredBadge`, `DealCard`, PDP |
| **DSN-CMP-4** | Opt-in cookie consent (equal-weight + withdrawal) | FR-CMP-4, NFR-PRIV-3 | `consent/CookieConsent.tsx` |
| **DSN-CMP-5** | One-click unsubscribe (GET+POST) + HMAC erasure | FR-CMP-5, NFR-PRIV-2 | `api/alerts/unsubscribe/route.ts` |
| **DSN-CMP-6** | Daily GDPR retention sweep (satisfies Art 15/17 per A-18) | FR-CMP-6 | `api/purge-alerts/route.ts`, `purge-alerts.yml` |
| **DSN-CMP-7** | Server-side consent audit log (no PII) | FR-CMP-7, NFR-PRIV-3 | `api/consent/route.ts`, `consent_audit` |
| **DSN-CMP-8** | Live-path price-drop alert dispatch (exactly-once/email) + _(v3.1)_ **never alert on `hidden` deals** | FR-CMP-8 | _(seam widened v3.1)_ `src/app/api/refresh-alerts/route.ts` + `src/lib/db/alerts.repo.ts` (`notifyPriceDrops`/`notifyPendingAlerts`) + `netlify/functions/refresh-deals.mts` (06:00) + `.github/workflows/ingest-awin.yml` alert step + the revived unsubscribe machinery |

---

## 4. url-slug design note (A-19, first-class in v3)

The APPROVED, in-flight url-slug rework is the **implementation vehicle** for `DSN-SEO-1`, `DSN-SEO-4` (category), `DSN-SEO-5`, `DSN-SEO-6`, `DSN-SEO-7`. These DSN components are **first-class** here — their acceptance is defined by their FR rows in requirements.md, so `T-SEO-6` traces to resolvable v3.1 IDs regardless of external files.

**2026-07-09 data-loss update (EVENT 3, RSK-13) — since RESTORED:** the external files v3 referenced (`docs/specs/url-structure/2026-07-08_v2/` incl. HANDOFF.md + the 49→25 red-team register, `tasks/plan.md`, `tasks/todo.md`) were destroyed by a git pull, then restored and **COMMITTED at `b53bb3e`** (2026-07-09 10:56). **Authoritative reference: the committed `/Users/danielmanzela/DealRadar/docs/specs/url-structure/2026-07-08_v2/` package** — HANDOFF.md (entry point), spec.md, plan.md, tasks.md, **redteam-register.md (the 49→25 register: 25 accepted findings) + redteam-adjudication-full.json (280 lines)** — plus the committed `tasks/plan.md`+`tasks/todo.md`. _Fidelity caveat: restored from session context + workflow journals (per commit `b53bb3e`); spot-check against the secondary `docs/recovered/2026-07-09/url-slug-spec-RECONSTRUCTION.md` (lossy; 12 locked decisions) rather than blind-trust._ The workstream is still referenced, not re-planned — B1–E2 tracking derives from the committed plan/todo (tasks.md T-SEO-6); no re-red-team is required. The verifier `hidden` lifecycle must be reconciled with D6's expired-state semantics (FR-SEO-1 design note: hidden → 200 + `OutOfStock` + disabled CTA + out of sitemap NOW; `expired_at` lands with T-SEO-6; hidden ≠ expired).

---

## 5. Agentic components (the only 4)

| DSN | Why agentic | Deterministic fallback |
|---|---|---|
| DSN-ING-8 | mapping an undocumented provider payload is a one-time judgment | provider stays mock-gated + 0-yield alert |
| DSN-PDP-4 | editorial copy needs natural-language judgment | render deterministic templated blocks only |
| DSN-MON-5 | novel commission-dispute triage needs reasoning | escalate the flagged row unresolved |
| DSN-OPS-4 | cross-signal root-cause on a novel fault needs judgment | escalate the raw signal bundle |

_v3.1 note: the sanctioned agentic set stays at exactly these **4**. The new delta components are all DETERMINISTIC — the live-shop verifier (DSN-ING-11) is a scripted crawl + fixed rules, the snapshot writer and hidden-lifecycle filters are SQL/config, and pagination/seed hygiene is pure rendering._

---

## 6. Environment variables (design contract)

`NEXT_PUBLIC_APP_URL=https://dealradar.me` (A-01) · `CRON_SECRET` · `WEBHOOK_SECRET` (dedicated, no fallback) · `SUPABASE_SERVICE_ROLE_KEY` (server-only) · `UPSTASH_REDIS_*` · provider creds (`AWIN_FEED_URL`, `KELKOO_API_TOKEN`, `TRADEDOUBLER_TOKEN`, `STRACKR_API_ID/KEY`) · `RESEND_*` (A-16) · `GSC_*` (Search Analytics, DSN-SEO-11). Every one is null-safe: absence degrades gracefully (DSN-INF-3), never crashes.

---

## 7. Traceability matrices (both directions)

### 7.1 FR/NFR → DSN (downward — proves no requirement is orphaned)
| FR/NFR | DSN | FR/NFR | DSN |
|---|---|---|---|
| FR-ING-1 | ING-1, ING-9 | FR-SEO-1 | SEO-1 |
| FR-ING-2 | ING-2, ING-10 | FR-SEO-2 | SEO-2 |
| FR-ING-3 | ING-3 | FR-SEO-3 | SEO-3 |
| FR-ING-4 | ING-3, ING-10 | FR-SEO-4 | SEO-4 |
| FR-ING-5 | ING-4 | FR-SEO-5 | SEO-5 |
| FR-ING-6 | ING-5, ING-10 | FR-SEO-6 | SEO-6 |
| FR-ING-7 | ING-6 | FR-SEO-7 | SEO-7 |
| FR-ING-9 | ING-7 | FR-SEO-8 | SEO-4 |
| FR-ING-10 | ING-8 | FR-SEO-9 | SEO-6 |
| FR-ING-11 | ING-9 | FR-SEO-10 | SEO-8 |
| FR-MON-1 | MON-1 | FR-SEO-11 | SEO-7, SEO-12 |
| FR-MON-2 | MON-2 | FR-SEO-12 | SEO-9 |
| FR-MON-3 | MON-3 | FR-SEO-13 | SEO-10 |
| FR-MON-4 | MON-4 | FR-SEO-14 | SEO-11 |
| FR-MON-5 | MON-5 | FR-INF-1 | INF-1 |
| FR-MON-6 | MON-6 | FR-INF-2 | INF-2 |
| FR-PDP-1 | PDP-1 | FR-INF-4 | INF-4, ING-9 |
| FR-PDP-2 | PDP-2 | FR-INF-5 | INF-5 |
| FR-PDP-3 | PDP-3 | FR-INF-6 | INF-6 |
| FR-PDP-4 | PDP-2, PDP-4 | FR-INF-7 | INF-7 |
| FR-PDP-5 | ING-6, PDP-7 | FR-INF-8 | INF-8 |
| FR-PDP-6 | PDP-5 | FR-INF-9 | INF-9 |
| FR-CMP-1 | CMP-1 | FR-INF-10 | INF-3 |
| FR-CMP-2 | CMP-2 | FR-INF-12 | INF-11 |
| FR-CMP-3 | CMP-3 | FR-OPS-1 | OPS-1 |
| FR-CMP-4 | CMP-4 | FR-OPS-2..7 | OPS-2 (+OPS-3 for 2/3/4) |
| FR-CMP-5 | CMP-5 | FR-OPS-8 | OPS-4 |
| FR-CMP-6 | CMP-6 | FR-OPS-9 | OPS-5 |
| FR-CMP-7 | CMP-7 | FR-OPS-10 | OPS-6 |
| FR-CMP-8 | CMP-8 | NFR-PERF-1 | INF-3 |
| NFR-PERF-2 | PDP-1 | NFR-PERF-3 | INF-10 |
| NFR-REL-1 | INF-1, OPS-1 | NFR-REL-3/5 | INF-3 |
| NFR-REL-6 | INF-11 | NFR-SEC-1/4 | MON-2 |
| NFR-SEC-2 | INF-6 | NFR-SEC-3 | INF-7 |
| NFR-SEC-5 | INF-4 | NFR-SEC-6 | INF-8 |
| NFR-PRIV-1 | MON-1 | NFR-PRIV-2 | CMP-5 |
| NFR-PRIV-3 | CMP-4, CMP-7 | NFR-PRIV-4 | INF-4 |
| NFR-SEO-1 | SEO-9 | NFR-SEO-2 | SEO-5 |
| NFR-SEO-3 | SEO-2 | NFR-SEO-4 | SEO-10 |
| NFR-COST-1/2/3 | INF-9, ING-10 | NFR-OBS-1/2 | OPS-1 |
| NFR-OBS-3 | INF-5, OPS-2 | NFR-SCALE-1 | INF-2 |
| NFR-SCALE-2 | SEO-6 | NFR-SCALE-3 | INF-9, INF-10 |
| NFR-AUTON-1 | OPS-6 | NFR-AUTON-2 | OPS-4 |
| NFR-AUTON-3 | OPS-5 | FR-ING-12 _(new v3.1)_ | ING-11 |
| FR-ING-13 _(new v3.1)_ | ING-12, ING-10 (stale-hide) | FR-PDP-7 _(new v3.1)_ | PDP-7, ING-6 (data) |
| FR-SEO-15 _(new v3.1)_ | SEO-12 | | |

**Result:** every defined FR/NFR maps to ≥ 1 DSN. Reserved numbers (FR-ING-8, FR-INF-3, NFR-REL-2/4) are folded by design and intentionally carry no DSN; DSN-PDP-6 is reserved for the deferred a11y set.

### 7.2 DSN → Task (upward — proves no component is un-built)
The **61** DSN components (ING-1..12, MON-1..6, PDP-1..5 + PDP-7 [PDP-6 reserved], SEO-1..12, INF-1..11, OPS-1..6, CMP-1..8) each map to ≥ 1 `T-*` in **tasks.md §7.1**. New v3.1 mappings: DSN-ING-11 → T-ING-10, DSN-ING-12 → T-ING-11 (+ T-ING-6 for the flag re-wire), DSN-PDP-7 → T-PDP-6, DSN-SEO-12 → T-SEO-11. Prior additions: DSN-SEO-11 → T-SEO-10, DSN-INF-11 → T-INF-11, DSN-CMP-8 → T-CMP-7.

---

_End of v3.1 Design. Every DSN cites the FR/NFR it satisfies; §7 gives both-direction matrices so orphan detection runs upward (DSN→Task) and downward (FR/NFR→DSN). Never promise a literal 100% (PRD §1.2); merged-on-branch ≠ deployed-to-prod ≠ verified-live._
