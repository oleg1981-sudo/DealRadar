# DealRadar Remediation — Spec

> Planning artifact produced per `planning_agent_base_prompt.md` (idea→implementation pipeline). Source of scope = the ground-truth code audit in `audit/findings.md` + `audit/audit-plan.md`. This document set turns those findings into an executable, machine-verifiable plan: **Spec → Requirements (EARS) → Design → Tasks**, validated by `validate_plan.mjs` (Tier A).

## Step 0 — Intake & product-class

**Idea (restated):** Bring DealRadar to *true* completion of the `docs/ground_source_of_truth/2026-06-23_v2` scope at Tier-1 standards by remediating every gap the ground-truth audit surfaced — fixing the four production-breaking defects, closing the GEO/SEO, compliance, i18n, and security gaps, and locking already-correct behavior behind regression gates. The `.md` spec suite claims "ALL 19 FINDINGS RESOLVED"; the code disproves that in material ways, so this plan is grounded in code reality, not self-report.

**Product class:** EU-targeted, multi-locale (13 locales), server-rendered **affiliate price-comparison web app** — Next.js 14 App Router + Supabase (Postgres) + next-intl + Upstash Redis + Resend, deployed on Netlify, positioned for GDPR compliance and AEO/GEO (AI-answer-engine) discoverability. Headless ingestion from affiliate networks (AWIN feed + Kelkoo/Tradedoubler APIs; Strackr to be added per Decision A).

**User decisions baked in (this revision):** A = implement real Strackr provider · B = adopt FOSS `vanilla-cookieconsent@3.1.0` (MIT, verified) · C = scaffold legal i18n + machine-translate all 13 locales, flag binding copy for legal sign-off · Scope = everything (P0+P1+P2).

## Step 1 — Domain-baseline checklist (the completeness yardstick)

A competent product of this class is expected to cover the capability blocks below. The audit + this plan force **every** baseline item to map to ≥1 requirement (full mapping = coverage matrix in `requirements.md`; **51/51 MAPPED**, machine-checked). Authority tiers are labeled per principle 6 (standards/regulatory vs. domain vs. first-principles/ASSUMED).

| Block | Baseline items | Authority |
|---|---|---|
| Ingestion | live feed, typed normalization, dedup, price history, mock fallback, bounded refresh | domain / first-principles |
| Monetization | subID decoration, postback ingestion, attribution integrity | domain |
| Pages | SSR detail by slug, 404/notFound, list→detail nav | first-principles |
| SEO/AEO | schema.org rich results, sitemap+hreflang, robots, AI-proof content, canonical/alternates, rel=sponsored | **standard** (schema.org/Google/sitemaps.org) + emerging (AEO) |
| i18n | all strings localized, locale routing/detection, localized legal text | first-principles + **regulatory** (GDPR Art. 12) |
| Geolocation | edge+fallback country resolution, deterministic default | first-principles |
| Legal | imprint, privacy (Art.13/14), terms, cookie consent (opt-in/withdrawable/equal-weight), affiliate disclosure | **regulatory** (TMG §5, GDPR/ePrivacy/TTDSG/EDPB, UWG/EU 2005/29/EC) |
| Email | alert dispatch, visible+List-Unsubscribe (RFC 8058), one-click POST, erasure (Art.17), retention (Art.5(1)(e)), rate limit | **standard** (RFC 8058) + **regulatory** |
| Security | endpoint authn, secrets mgmt, RLS, injection prevention, timing-safe compare, data minimization | **standard** (OWASP) + first-principles |
| Performance | response caching (TTL), indexed hot paths, bounded long jobs | first-principles |
| Ops | reproducible migrations, structured degradation logs, scheduled/CI automation | first-principles |
| Testing | unit tests for pure logic, build/type gate, lint configured | first-principles |
| UX | empty/loading/error states, WCAG 2.1 AA basics | first-principles + **standard** |

51 baseline items total. Items derived from first principles (not an external standard) are marked accordingly in `plan.json.baseline[].authority`; none are presented as authoritative beyond their tier.

## Step 2 — Spec

### Problem statement
DealRadar compiles cleanly and *looks* complete, but the live data path is broken (deal pages 404, alerts never fire), EU-compliance surfaces are English-only or missing withdrawal paths, the GEO/AEO thesis is under-implemented (no AggregateOffer/itemCondition, no proof fields, broken sitemap), and several security hardening items are open. The product cannot be credibly called "done" or launched until these are closed.

### Goals
- G1 — Restore the core user loop on the **live** data path: ingest → deal page renders by slug → price-drop alert dispatches → one-click unsubscribe works.
- G2 — Reach defensible **EU legal compliance**: localized legal pages, FOSS consent with withdrawal + equal-weight, affiliate disclosure adjacent to every CTA, RFC 8058 one-click, automated retention.
- G3 — Deliver the **GEO/AEO** thesis: valid AggregateOffer+itemCondition JSON-LD, visible AI proof fields, correct hreflang sitemap, AI-bot robots directives.
- G4 — Close **security** gaps (no default signing secret, timing-safe auth, validated postbacks, spoof-resistant atomic rate limit, no filter injection) without regressing the sound fundamentals (Bearer auth, RLS, server-only service role).
- G5 — Make quality **verifiable**: unit tests for pure logic, configured lint, reproducible migrations, i18n key-parity, green build — as re-runnable gates.

### Non-goals (explicit, with rationale)
- N1 — Re-architecting the provider model. The registry/PriceProvider contract is sound; we extend (Strackr, EAN), not replace.
- N2 — Real-time (sub-daily) pricing. Refresh stays scheduled (daily) — bounded for correctness; true real-time is a future capacity/SLA decision (tracked, not built).
- N3 — Provisioning live affiliate credentials. The code path is the deliverable; activating commercial feeds (and proving real prices flow) is a launch-checklist item (Decision/Residual).
- N4 — Writing legally-binding final legal copy. We scaffold structure + machine translations; binding text + real Impressum data require professional/legal sign-off (Decision C).
- N5 — Analytics product. Consent has an analytics category, but no analytics SDK is wired (out of scope until a tool is chosen).

### In-scope
Every P0 and P1 finding from `audit/findings.md`, and the material P2 findings (correctness/robustness/hygiene/tests/a11y) — including the two harmless P2 nits the audit itself rated low (GAP-4 ingest discount-math, and the `historicalLowPrice===0` read guard), which are mapped to enforceable acceptance criteria on R-ING-4 and R-GEO-2 respectively (not left as prose). Plus the 4 user decisions (A–C + full scope).

> Two distinct count systems, kept separate to avoid confusion: **audit findings** (the 79 actionable items in `audit/findings.md`, grouped P0/P1/P2) vs. **plan requirements** (the 56 EARS requirements here, priced P0=6/P1=23/P2=13/REGRESSION=14). One requirement often consolidates several related findings; the finding→requirement mapping is the `findings` field on each requirement in `plan.json`.

### Primary users
EU bargain-hunters (multi-locale, mobile-first); price-alert subscribers; affiliate-network postback callers; AI answer engines / search crawlers; the operator (cron/ingest/CI).

### Key flows
1. Browse (geo-scoped grid) → deal card → **SSR deal page (by slug)** → outbound affiliate CTA (disclosed, rel=sponsored).
2. Subscribe to price alert → ingest detects drop → **email with working unsubscribe** → one-click POST unsubscribe.
3. Postback received → authenticated, validated, attributed → `transactions`.
4. First visit → edge geo + **consent banner** (equal-weight) → later re-open via footer Cookie Settings.

### Constraints
Next.js 14 App Router + next-intl; Supabase Postgres (service-role server-only, RLS); Upstash Redis (REST); Resend; Netlify (`@netlify/plugin-nextjs`); Node 20; FOSS-preferred (NFR-TECH-7); must run on empty `.env` with mock data.

### Success criteria (measurable)
- SC1 — `tsc --noEmit` and `next build` exit 0 with no new warnings (Tier-A; baseline already green).
- SC2 — A live-ingested deal's slug returns HTTP 200 on its deal page (0 of N sampled return 404).
- SC3 — A simulated price drop on the live path dispatches exactly 1 email and flips `notified=true`.
- SC4 — One-click unsubscribe `POST` returns 200 and deletes the row; GET path idempotent.
- SC5 — Google Rich Results Test reports 0 errors on a sample deal page (AggregateOffer + itemCondition present).
- SC6 — i18n key-parity check reports 0 missing/empty keys across all 13 locales.
- SC7 — Consent sets no non-essential cookie before Accept; Accept/Reject equal-weight; re-openable.
- SC8 — Unit suite (slug, crypto round-trip, affiliate round-trip, 3 dedup cases) exits 0; `next lint` exits 0 non-interactively.

### Verification tiers used (see `validation_and_review.md`)
Tier A (machine-checked): `validate_plan.mjs` (structure/coverage/traceability/counts), `tsc`, `next build`, dependency fact-checks via `npm view`. Tier B (reasoned, labeled UNVERIFIED): NL contradiction/vacuity analysis. Tier C (independent): a separate red-team agent audits the plan + code; union of findings merged.
