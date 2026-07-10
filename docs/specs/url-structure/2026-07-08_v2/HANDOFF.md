# HANDOFF — deal URL & slug structure, v2 (2026-07-08)

**For:** the next agent/session picking this work up. Read this file first; it is the map.
**State in one line:** design is APPROVED and adversarially verified; **zero implementation exists** — the next action is task A2 (read-only pre-flight probes), then B1 (schema migration).

## Read in this order

1. This file (context + traps).
2. [spec.md](spec.md) — the canonical design. All 5 decisions are locked in its header table; do not re-litigate them.
3. `tasks/plan.md` + `tasks/todo.md` at repo root — the **live working copies** (check boxes there as you go). [plan.md](plan.md) / [tasks.md](tasks.md) here are frozen snapshots of the same content as of hand-off.
4. [redteam-register.md](redteam-register.md) — 25 verified findings that turned v1 into v2. Consult before "simplifying" anything: most simplifications were already tried in v1 and shot down with evidence.
5. [v1-superseded.md](v1-superseded.md) — only for archaeology; do not implement from it.

## What this is and why it exists

DealRadar (Next.js 14 App Router, next-intl 13 locales, Supabase, Netlify) had no SEO-viable product URLs. Verified live on 2026-07-08 at **https://dealradar.me** (that is the real prod host — repo docs saying `dealradar.eu`/`dealradar.app` are stale): deal cards open a modal, the sitemap holds only 13 homepages + 130 category pages, `/en/deal/*` 404s. **Nothing is indexed — there is no legacy index to protect**, which is why the redesign is cheap right now. The branch `feat/tier1-remediation-2026-06-28` already contains SSR deal pages with a defective slug scheme (slug regenerates from product name on every upsert → renames silently move URLs; provider IDs leak into slugs; no redirect infra).

**The approved design:** `/{locale}/deal/{slug_base}-d{12hex}` — a frozen md5-derived `public_id` as routing key, cosmetic brand-prefixed slug frozen at first mint, a resolver ladder that 308s drifted/legacy URLs one hop to canonical and never 404s an emitted URL, an active/expired/gone lifecycle instead of row deletion, 256 hex-prefix sitemap shards under a hand-built index route, and country folded into `product_id` at every provider boundary.

## How it was produced (provenance)

- **Session:** Claude Code, 2026-07-08, branch `feat/tier1-remediation-2026-06-28` (work is planning-only, uncommitted at hand-off unless a commit landed after this file was written — check `git status`).
- **Evidence gathering:** live Playwright probe of dealradar.me; 4 parallel reader agents over the data layer / SEO infra / prior audits (`audit/findings.md`, `docs/remediation_plan/2026-06-28_v1/`, `docs/ground_source_of_truth/2026-06-23_v2/`); web research with **live-verified** competitor behavior (hotukdeals + dealabs wrong-slug → 301-to-canonical confirmed by curl; Slickdeals/Geizhals anatomy observed, drift behavior assumed).
- **Design:** 3-angle proposal panel (SEO-purist / resilience-first / AEO-first) + judge synthesis → v1.
- **Verification:** 6 hostile specialist agents + adjudicator re-verification → 49 raw findings → 25 accepted (1 blocker, 16 major, 8 minor), 1 rejected → v2. Only 1 of 49 findings failed re-verification; treat the register as reliable.
- **Reviewer decisions (human, 2026-07-08):** scheme ✔, brand prefix ✔, country-in-identity ✔, freeze-after-mint ✔, dynamic-rendering-for-launch ✔.

## Repo reality you must not assume differently (all verified, with file:line in the register)

- **Refresh cadence is ONE daily cron** (`netlify/functions/refresh-deals.mts`, `0 4 * * *`) persisting ≤100 deals per country×category; the "15-min" text in comments is aspirational fiction. AWIN ingest is a nightly GitHub Action. **There is no CI** — workflows are 3 cron jobs; `pnpm build` on Netlify is the only gate. CI is deliverable C11.
- **Writers are blind bulk upserters** (`deals.repo.ts upsertDeals` onConflict product_id; `ingest-awin.cjs` PostgREST merge-duplicates). They cannot know what changed → all change detection lives in DB triggers.
- `update_historical_lows_batch` RPC runs after every refresh and UPDATEs rows without value guards — any trigger logic keyed on "an UPDATE happened" is wrong; the discriminator is `last_updated` (writers always send it, cron/RPC never touch it).
- The shared `[locale]/layout.tsx` calls `cookies()` → **every page under it is dynamically rendered**; `revalidate` on those routes is dead config (metadata routes like sitemap.ts are separate and DO take revalidate).
- Next 14 `generateSitemaps()` emits **no sitemap index** and kills `/sitemap.xml`; dev serves shards at a different path than prod (`next start` to verify).
- next-intl `Link` (localePrefix 'always') auto-prefixes locale — feed it locale-less hrefs (`dealHref`), never `/${locale}/…`.
- PostgREST caps responses at `max-rows` (likely 1000) regardless of `.range()` size — page every bulk read.
- Deal-page 404s must be thrown in `generateMetadata` (pre-stream) — R-RTE-1 is a REGRESSION-class requirement from the prior audit cycle.

## Top traps for the implementer (each cost v1 a blocker/major)

1. **Never ship the resolver without the live-slug rung** (Step B rung 1: exact `.eq(slug, raw)` → 200). Without it, the Phase C window self-308-loops every URL on the site.
2. **Mint triggers belong in Phase B**, and the `public_id` freeze must be NULL-safe (`COALESCE(OLD.public_id, …)`) — otherwise rows created between backfill and flip are stranded NULL and Phase D's rewrite violates NOT NULL, wedging nightly ingest.
3. **Phase D order:** delta backfill → count-zero gate → trigger flip → slug rewrite → **immediate deploy/purgeCache()** (a DB-only flip leaves Netlify serving stale cached responses).
4. Expiry is **set-difference vs the last successful ingest run**, never naive wall-clock at the fictional cadence; keep the >10% tripwire.
5. `deal_slug_base` is **STABLE** with schema-qualified `extensions.unaccent` — marking it IMMUTABLE is a latent index-corruption footgun; SQL is the only slug authority (TS `slugify()` NFD-deletes ß/ø/æ — parity is snapshot-based).

## Working agreements

- Follow the spec's Boundaries section (Always / Ask-first / Never) — notably: never DELETE from `deals`; writers never send `status`/`expired_at`/`content_changed_at`; prod schema changes and cron enablement are ask-first.
- Keep `tasks/todo.md` checkboxes current; it is the cross-session state. If a design decision must change, update `spec.md` FIRST (and note it in this folder as a new dated version — copy the folder pattern `docs/specs/url-structure/<date>_v<N>/`), then implement.
- Verification gates: `pnpm typecheck && pnpm test && node scripts/check-i18n.mjs`; `node scripts/smoke-spine.mjs` against a deploy preview; empty-env `pnpm build` must stay green (mock/dev mode is a supported first-class path).
- Prior-audit traceability IDs to cite in commits/PRs: FR-RTE-1/2, R-RTE-1/2, R-GEO-4/5, GAP-1, P1-4, SC2, SC5.

## ⚠ Addendum (2026-07-08, end of authoring session): merge-in-progress discovered

At hand-off time the branch has an **unresolved merge in progress** (MERGE_HEAD `619a3ae` — "Merge upstream/main, preserving local Tier 1 architecture additions"), started outside this session, with conflicts in files this plan owns: `supabase/schema.sql`, `src/lib/db/deals.repo.ts`, `src/components/deals/DealCard.tsx`, `src/app/sitemap.ts` (both-added), `scripts/ingest-awin.cjs`, all 13 message files, and more. The incoming side also ADDS `src/app/robots.ts` and `src/components/search/Pagination.tsx` — overlapping tasks C5/C6/C7 — and a new spec suite exists at `docs/ground_source_of_truth/2026-07-08_v3/` (prd/requirements/design, same date, authored elsewhere).

**Before starting ANY task here:** (1) resolve or abort the merge with whoever owns it; (2) diff the incoming robots.ts/sitemap.ts/Pagination against C5–C7 and mark those tasks partially-done or amend them; (3) re-verify the spec's file:line citations post-merge (behavioral claims were verified pre-merge); (4) check `docs/ground_source_of_truth/2026-07-08_v3/` for overlapping or conflicting requirements and reconcile IDs. This package's design decisions are unaffected — but the task list's file-level assumptions may be stale after the merge lands.

## Immediate next actions

1. **A2 pre-flights** (read-only; 5 probes listed in spec "Pre-flight items") — needs prod Supabase access + Netlify env view; paste answers into spec.md.
2. **B1** schema migration per todo (single file: `supabase/schema.sql`; `pnpm db:migrate`).
3. Then C1 → C11 per `tasks/todo.md`; C-deploy soaks ≥1 week before Phase D.
4. Recommend committing this planning package on the current branch before implementation starts, referencing this folder in the PR description.

## 🔄 Restoration note (2026-07-09)

This package was **destroyed on 2026-07-09** — it was untracked, and a git pull replaced the working tree — and **restored byte-faithfully the same day** from the authoring session's context plus surviving workflow journals (`~/.claude/projects/-Users-danielmanzela-DealRadar/0a89582f-…/subagents/workflows/wf_21307966-092/`). What changed since authoring:

- The merge flagged in the addendum above has **landed** (`155cf06` — "Merge main into feat/tier1-remediation-2026-06-28, keeping local architectures intact"). The addendum's steps 2–4 (diff incoming `robots.ts`/`sitemap.ts`/`Pagination` against C5–C7; re-verify file:line citations post-merge; reconcile `docs/ground_source_of_truth/2026-07-08_v3/`) **still apply** — step 1 is done.
- A lossy reconstruction produced during the loss window exists at `docs/recovered/2026-07-09/` — **this package supersedes it**; keep the recovered folder for audit only.
- The full red-team adjudication (including per-finding evidence fields, which the register's title/claim/fix format omits) is additionally archived here as [redteam-adjudication-full.json](redteam-adjudication-full.json).
- **This package is now committed to git.** The loss happened because it wasn't (that failure mode is tracked as RSK-13 in the v3 spec suite). Any future spec version must be committed in the same session it is written.
