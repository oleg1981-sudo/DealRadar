# CHANGELOG — v3 (2026-07-08, `91140c9`) → v3.1 (2026-07-09, code tree `155cf06`; branch HEAD `b53bb3e`, docs-only)

Every edit against the frozen `2026-07-08_v3/` suite, as applied in this `2026-07-09_v3.1/` copy. Driving-finding IDs reference the 2026-07-09 consolidated audit (`/Users/danielmanzela/DealRadar/audit/2026-07-09_consolidation/{findings,audit-plan}.md`) and the two enrichment passes ("v3-invalidation mapper" = INV, "spec-conformance" = SPEC).

## All docs

| doc | anchor/ID | change | driving finding |
|---|---|---|---|
| all 5 | title/header | Retitled "Version 3.1", Date 2026-07-09, provenance line "v3.1 — post-merge reconciliation of the 91140c9..155cf06 code delta + the 2026-07-09 data-loss event; supersedes 2026-07-08_v3; authored 2026-07-09"; DRAFT status kept | work order (b) |
| all 5 | sibling links | `file:///…/2026-07-08_v3/…` → `…/2026-07-09_v3.1/…` | mechanical |

## prd.md

| doc | anchor/ID | change | driving finding |
|---|---|---|---|
| prd | §1.3 three-state | Prod deployment state marked UNKNOWN (verified-live 2026-07-09: old-format sitemap, zero /deal/ URLs); prod DB shape UNKNOWN — probe first | rule 4 / INV "PRD §2 rows" |
| prd | §2 "Zero indexed URLs" | Evidence refreshed: verified-live 2026-07-09 sitemap facts (143 entries, uniform lastmod); row kept | INV (still-valid) |
| prd | §2 "Prod build lags branch" | Evidence → deployed SHA ≠ `155cf06`; deploy BLOCKED by two P0s (schema dup; ingest revert) → RSK-14/T-DB-0/T-ING-6/T-INF-1 | INV (stale-evidence) |
| prd | §2 "Stale host strings" | Rewritten: three live `.eu` call sites + `robots.ts` `process.env.URL` + shadowed `public/robots.txt`; fixed helper only in dead code | INV (stale-evidence) |
| prd | §2 "Thin PDP content" | Rewritten: gallery/description/merchant_url columns exist but rendered by no reachable surface (dead modal); ingest doesn't populate them; cross-ref FR-PDP-7 | INV (stale-evidence) |
| prd | A-02 | Amended: HEAD `155cf06`; deploy/merge preconditions (T-DB-0 + T-ING-6); db-migrate auto-apply hazard | INV A-02 |
| prd | A-19 | Repointed to `docs/recovered/2026-07-09/` (RECONSTRUCTION lossy + tasks-todo verbatim); red-team register (49→25) + trap list recorded LOST; re-red-team or accept 12 locked decisions; v3.1 acceptance = only complete statement | INV A-19 / EVENT 3 |
| prd | OBJ-2 | Evaluate += verifier-corrections survive ingest + 3-day stale-hide; Monitor += clobber-within-24h count | INV OBJ-2 |
| prd | SC5 | Extended: "AND availability truthful — no hidden=true deal emits InStock" + penalty-vector note | INV SC5 (new-defect-blocks-it) |
| prd | §8 heading + RSK-2 | Heading → RSK-1…RSK-14; RSK-2 mitigation → shared `baseUrl()` (throw in prod) + CI grep on `.eu/.app` AND `process.env.URL` outside netlify fns | INV RSK-2 |
| prd | RSK-5 | Mitigation amended: render existing gallery/description + description-into-JSON-LD (T-PDP-6) as cheaper first step; overlay stays durable fix; owner += T-PDP-6 | INV RSK-5 |
| prd | RSK-13 (new) | Untracked-doc destruction (ALREADY OCCURRED 2026-07-09); mitigation commit + CI/pre-pull check; owner T-INF-12 | INV RSK-13 / P0-A |
| prd | RSK-14 (new) | Ours-biased merge regressions (occurred at `155cf06`: ingest revert + SQL dup); post-merge diff review + single-definition CI guard; owners T-ING-6, T-DB-0/T-INF-1 | INV RSK-14 / P0-B/C |
| prd | §8.2 | Four new threshold rows: verifier errors/done > 80%; price_history rows = 0/day while visible deals > 0; sitemap contains hidden slug; verifier-corrected price clobbered within 24 h — each adopts DSN-OPS-2 (M4), manual-daily until then | INV §8.2 |
| prd | footer | RSK range → 14; three-state reminder | mechanical |

## requirements.md

| doc | anchor/ID | change | driving finding |
|---|---|---|---|
| req | FR-ING-7 | REWRITTEN to the day-keyed model (PK product_id+day, currency NOT NULL, no FK; writers = single trigger + snapshot); acceptance += exactly-once grep, successful upsert, prosrc probe; ⛔ P0 note (T-DB-0, delete `:249-270`) | INV FR-ING-7 / EVENT 2 |
| req | FR-ING-12 (new) | Live-shop verifier requirement (market currency, hide/unhide, incremental flush, fail > 80% errors) + defect list + status merged-on-branch | INV FR-ING-12 |
| req | FR-ING-13 (new) | hidden/homepage_hidden lifecycle across all read surfaces + automated flag re-sync; today's three blind read paths cited | INV FR-ING-13 |
| req | FR-MON-1 | Acceptance += every-call-site arg-order enumeration (or options-object refactor); modal country-slot bug cited | INV FR-MON-1 |
| req | FR-PDP-1 | Acceptance += rendering-strategy declaration + no-404-minting DealCard href; modal-never-replaces-navigation note | INV FR-PDP-1 / SPEC D4/C4 |
| req | FR-PDP-6 | Acceptance narrowed to post-gutting reality (specs/otherStoreOffers DONE; productSizes fabrication open; productGallery survives to PDP); kept OPEN | INV FR-PDP-6 |
| req | FR-PDP-7 (new) | Gallery + description (incl. JSON-LD) + 90-day cardiogram on SSR PDP; modal wire-or-delete | INV FR-PDP-7 |
| req | FR-SEO-1 | Design note added: hidden → 200+OutOfStock+disabled CTA+out-of-sitemap NOW; hidden ≠ expired; D6 reconciliation | INV FR-SEO-1 / SPEC D6 |
| req | FR-SEO-2 | Acceptance += availability derives from state (never constant) + description from deal.description; richer-than-v3 status noted | INV FR-SEO-2 |
| req | FR-SEO-6 | Status: DB-driven+hreflang landed via main (NOT the A-19 spec); acceptance += per-request/ISR, hidden excluded, honest lastmod, `.range()` pagination | INV FR-SEO-6 / SPEC D8 |
| req | FR-SEO-7 | Status: robots.ts exists (verified-live), AI groups + host var MISSING; acceptance += three AI groups in rules[], BASE=NEXT_PUBLIC_APP_URL, public/robots.txt deleted | INV FR-SEO-7 / SPEC D9 |
| req | FR-SEO-8 | Acceptance += cookie-independent crawler content; PDP metadata pattern named as template | INV FR-SEO-8 / SPEC D10 |
| req | FR-SEO-11 | Extended: no per-request seed in crawlable hrefs + stable homepage CTA; crawl-trap evidence | INV FR-SEO-11 / SPEC C7 |
| req | FR-SEO-15 (new) | Crawlable pagination + seed hygiene (Pagination.tsx conformant; seed propagation the hazard) | INV FR-SEO-15 |
| req | FR-CMP-1 | Acceptance += code-usage↔messages cross-check; `deal.priceNote` missing-key defect | INV FR-CMP-1 |
| req | FR-CMP-3 | Acceptance += enumerate ALL decorateAffiliateUrl callers (incl. modal, badge-less today) | INV FR-CMP-3 |
| req | FR-CMP-8 | Status: built merged-on-branch, verified-live pending; acceptance += no-alert-on-hidden; honest ~24 h latency | INV FR-CMP-8 |
| req | §3 coverage | OBJ lists += new FRs; new FR→DSN→T chains listed | mechanical recount |

## design.md

| doc | anchor/ID | change | driving finding |
|---|---|---|---|
| design | §1 diagram cron list | += verify-awin + snapshot-prices (05:00) with cadence labels | INV FR-ING-12 |
| design | §2 price_history row | Redesigned day-keyed model + second writer; FR-PDP-7 added | INV DSN-ING-6 |
| design | §2 new deals-columns row | hidden/homepage_hidden/gallery/description/merchant_url | INV FR-ING-13/PDP-7 |
| design | §2 P0 note (new) | Duplicate `record_price_history` byte-level facts + db-migrate auto-apply + create-if-not-exists shape hazard + probe-first | EVENT 2 / INV T-INF-1 |
| design | DSN-ING-6 | Updated to day-keyed + single trigger + snapshot writer; seams re-cited | INV DSN-ING-6 |
| design | DSN-ING-10 | Annotated: authoritative version = main's; stale-hide + price-preservation added to responsibilities; FR-ING-13 added | INV DSN-ING-10 |
| design | DSN-ING-11 (new) | Verifier component, DETERMINISTIC, defect list → T-ING-10 | INV FR-ING-12 |
| design | DSN-ING-12 (new) | hidden lifecycle component → T-ING-11 | INV FR-ING-13 |
| design | DSN-PDP-5 | Status note (largely done; fabrication + dead-modal chain remain) | INV FR-PDP-6 |
| design | DSN-PDP-6 (new reserved row) | Explicitly reserved for a11y per v3 README — number never reused | INV FR-PDP-7 numbering |
| design | DSN-PDP-7 (new) | Cardiogram + real-content surface → T-PDP-6 | INV FR-PDP-7 |
| design | DSN-SEO-6 | Rewritten: sitemap EXISTS (build-frozen…); remaining work = D8 conformance as replacement-diff; KEEP hreflang helper + category entries | INV DSN-SEO-6 / SPEC D8/C5 |
| design | DSN-SEO-7 | Split status: robots.ts shipped-partial; /search noindex NOT built (+ seed trap xref) | INV DSN-SEO-7 |
| design | DSN-SEO-12 (new) | Pagination + seed hygiene → T-SEO-11 | INV FR-SEO-15 |
| design | DSN-CMP-8 | Seam widened (alerts.repo notifyPriceDrops/notifyPendingAlerts + refresh-deals.mts + ingest-awin.yml step + unsubscribe machinery); responsibility += never alert on hidden | INV DSN-CMP-8 |
| design | §4 url-slug note | Data-loss paragraph: repointed to recovered copies; register LOST; hidden-vs-D6 reconciliation | INV A-19 / SPEC D6 / EVENT 3 |
| design | §5 | Note: agentic set stays exactly 4; all delta components DETERMINISTIC | work order (c) |
| design | §7.1 | += FR-ING-12→ING-11, FR-ING-13→ING-12+ING-10, FR-PDP-7→PDP-7+ING-6, FR-SEO-15→SEO-12; result note += DSN-PDP-6 reserved | mechanical recount |
| design | §7.2 | 57 → **61** components; new DSN→T mappings listed | mechanical recount |

## tasks.md

| doc | anchor/ID | change | driving finding |
|---|---|---|---|
| tasks | header | Counts 54 → **60**; T-ING-6 elevation flagged; destroyed-files note + recovered paths; T-DB-0/T-INF-12 ID exceptions documented | work order / EVENT 3 |
| tasks | §0.2.6 | "mirrors tasks/todo.md D3" → recovered todo path | EVENT 3 |
| tasks | M0 header/gate | v3.1 pre-gate order (T-INF-12 → T-DB-0 + T-ING-6, before T-INF-1/2); gate += single-definition + empty-or-superset diff + no-untracked-docs | INV M0 |
| tasks | T-INF-12 (new, M0 first) | Commit at-risk doc trees; porcelain-grep verify; >5-file docs exception | INV T-INF-12 / RSK-13 / P0-A |
| tasks | T-DB-0 (new, M0) | Schema dedup P0 with byte-level acceptance, before/after prosrc probes, single-definition CI guard, do-not-merge warning | EVENT 2 / P0-B / SPEC B1 |
| tasks | T-ING-6 (rewritten, moved M1→M0) | Restore-from-main acceptance prepended (extraction, price preservation, stale-hide, flag+snapshot steps); live-feed clauses kept, gated M1/G1 | INV T-ING-6 / P0-C / RSK-14 |
| tasks | T-SEO-1 | Acceptance += robots.ts env var, shared baseUrl(), public/robots.txt removal, process.env.URL grep class; Files → the 4 live call sites + delete target | INV T-SEO-1 / SPEC D9/C6 |
| tasks | T-INF-1 | ⛔ T-DB-0 precondition + db-migrate self-deploy warning; acceptance += exactly-once, prosrc content, guarded old→new migration (not IF-NOT-EXISTS); verify += before/after probes | INV T-INF-1 |
| tasks | T-INF-2 | ⛔ A-02 precondition note (blocked by the two P0s); HEAD named | INV A-02 |
| tasks | T-INF-3 | Verify += refresh-deals.mts "15 min" grep + documented 03:00/05:00/06:00 cron ordering | INV FR-INF-2 |
| tasks | T-ING-5 | Acceptance: pre-req single definition + guarded shape migration + snapshot 2xx; Files += snapshot-prices.cjs, verify-awin.yml; verify += prosrc | INV T-ING-5 |
| tasks | T-ING-10 (new, M1) | Verifier hardening (incremental flush, deadline, non-zero exit, escaping) | INV FR-ING-12 |
| tasks | T-ING-11 (new, M1) | Three missing hidden filters + honest PDP state + flag re-wire | INV FR-ING-13 |
| tasks | T-SEO-2 | Acceptance += state-derived availability + description (SC5 carry) | INV SC5/FR-SEO-2 |
| tasks | T-SEO-3, T-SEO-4 | Annotated "implemented merged-on-branch at 155cf06; Verify still to run" — boxes NOT ticked | INV T-SEO-3/4 (now-done) |
| tasks | T-MON-1 | Acceptance += call-site enumeration / options-object; Files += DealDetailModal (fix or delete) | INV FR-MON-1 |
| tasks | T-CMP-2 | Acceptance += usage-scan addition to check-i18n.mjs (priceNote) | INV FR-CMP-1 |
| tasks | T-CMP-3 | Acceptance += decorateAffiliateUrl caller enumeration | INV FR-CMP-3 |
| tasks | T-CMP-5 | Status merged-on-branch; acceptance += no-.eu unsubscribe host + GET-renders-confirmation-page (POST does the delete) | INV T-CMP-5 |
| tasks | T-CMP-7 | Kept unticked; acceptance += hidden=false assertion + same-window-hidden → 0 dispatches; subtask delete src/lib/email/unsubscribe.ts after salvaging siteOrigin(); Files += deals.repo.ts | INV T-CMP-7 |
| tasks | T-SEO-5 | ⛔ BLOCKED-until-per-request/ISR dependency; acceptance += post-deploy-ingested deal appears without redeploy | INV T-SEO-5 |
| tasks | T-SEO-6 | Dependency manifest rewritten to recovered files + LOST register + T-INF-12 precondition + chain T-DB-0 → B1 → C2 → ingest re-merge → T-SEO-6 → E1/E2; sitemap = replacement target (keep hreflang+category entries); acceptance += hidden→OutOfStock + the five slug-composition sites (D11 actively violated); verify = extend smoke-spine.mjs (currently tests none of the spine; stale header host) | INV T-SEO-6 / SPEC D1/D2/D8/D11/D12/C5/C8 |
| tasks | T-PDP-5 | Status note; acceptance updated to post-gutting reality (delete productSizes fabrication; productGallery keeps a live consumer) | INV T-PDP-5 |
| tasks | T-PDP-6 (new, M2) | Gallery+description+cardiogram on SSR PDP; modal wire-or-delete (human gate) | INV FR-PDP-7 / audit P1-F |
| tasks | T-SEO-11 (new, M2) | Seed-trap kill + stable homepage CTA; homepage shuffle fixed-or-accepted-churn | INV FR-SEO-15 / audit P1-D |
| tasks | §7.1 | Matrix += 4 new DSN rows + T-DB-0 under DSN-ING-6; count 57 → 61; exceptions note | mechanical recount |
| tasks | §7.2 | url-slug deferral row repointed to recovered files + re-red-team caveat | EVENT 3 |
| tasks | §7.3 | D3 row += lifecycle-unification note (verifier hidden + stale-hide may subsume the 48h pg_cron; ASK-FIRST kept) | SPEC D3 |
| tasks | footer | Updated: recovered-docs edit ban; merged-on-branch-unticked reminder | rules 2/4 |

## README.md

| doc | anchor/ID | change | driving finding |
|---|---|---|---|
| README | whole file | Rewritten: v3.1 provenance chain (v2 → v3 frozen → v3.1), what-changed summary (P0s, data loss, 5 new chains, delivered-on-branch notes), counts 61 DSN / 60 T / +4 FR, M0 gate additions, three-state + 4-agentic reaffirmation, CHANGELOG link, open items | STEP 3 |

## Consciously NOT changed (and why)

| delta item | why left out of v3.1 |
|---|---|
| Ticking any checkbox for delta-delivered work (T-SEO-3/4, T-CMP-5/7, parts of T-PDP-5) | Three-state honesty: implementations are merged-on-branch only; every Verify must run against `dealradar.me` post-deploy. Status notes added instead. |
| A new FR/DSN for the daily snapshot job as its own component | Folded into the rewritten FR-ING-7/DSN-ING-6 (second sanctioned writer) — a separate ID would double-count one data model. |
| An a11y requirement set (`NFR-A11Y-*`, DSN-PDP-6) | Still deferred pending the quality-bar sign-off, exactly as v3's README stated; DSN-PDP-6 explicitly held reserved so the number is never repurposed. |
| Renumbering or re-milestoning any existing v3 ID | ID discipline: area-scoped and stable; only T-ING-6 moved milestone (M1→M0) while keeping its number, flagged in both places. |
| A v3.1 rewrite of the v2→v3 crosswalk (prd §9) | No counting-system change in the delta touches it; the v3.1 additions are already enumerated in each doc's header. |
| The imprint email `contact@dealradar.eu` purge decision | Deliberately left as a T-SEO-1-adjacent open question (it may be a real mailbox) — flagged in the audit, owned by G2/T-CMP-1 copy sign-off, not a mechanical grep kill. |
| Homepage per-request unseeded shuffle (`HeroDeals.tsx:18-25`) | Not forced into acceptance: recorded inside T-SEO-11 as "fix in the same pass OR explicitly accept churn" — a product choice, not a defect verdict. |
| Netlify env / PostgREST max-rows / prod DB shape / GSC facts | Unknowable from the repo (needs user/prod access); carried as probes (T-INF-1/T-DB-0 verify steps, url-slug A2) with PLAUSIBLE labels where relevant. |
| The remediation's **daily-fill trigger semantics** (one `price_history` row per fed product per day even when the price is unchanged, via its `not exists … current_date` clause) | **Deliberately inverted, not lost:** T-DB-0 keeps the day-based def#1 (change-only trigger) and assigns daily-fill to `snapshot-prices.cjs` (one row/visible deal/UTC day). Trade-off: daily-fill now depends on the snapshot cron rather than every upsert; the §8.2 "daily price snapshot" threshold + T-ING-6's restored post-ingest step cover the failure mode. Recorded here because the semantic changed relative to the remediation, and silence would read as an accident. |

## Fix pass — 2026-07-09 (verified against branch HEAD `b53bb3e`)

Review findings applied after v3.1 authoring. Root cause of the first four: v3.1 was grounded one commit behind its own branch — commit `b53bb3e` ("docs(specs): restore URL/slug spec v2 hand-off package lost 2026-07-09", 2026-07-09 10:56, BEFORE v3.1 was finalized) had already restored + committed the url-slug spec package (incl. the 49→25 red-team register, 107 lines, + `redteam-adjudication-full.json`, 280 lines), `docs/specs/url-structure/README.md`, `tasks/plan.md`, and `tasks/todo.md`. All code-delta claims (`91140c9..155cf06` = 34 files, +1501/−232) are unaffected — `b53bb3e` is docs-only.

| doc | anchor/ID | change | driving finding |
|---|---|---|---|
| prd | A-19 | Rewritten: the spec package + 49→25 red-team register are RESTORED and COMMITTED at `b53bb3e` (`docs/specs/url-structure/2026-07-08_v2/` = authoritative); fidelity caveat (session-context restoration — spot-check vs `docs/recovered/2026-07-09/`); deleted "LOST"/"unrecovered"/"re-run the red-team"/"ONLY complete statement" claims | fix-pass BLOCKER (hallucination-vs-code) |
| prd | RSK-13 | Status → PARTIALLY REMEDIATED at `b53bb3e` (docs/specs/ + tasks/ committed); residual untracked set narrowed to the two ground_source_of_truth suites + docs/recovered/ + audit/2026-07-09_consolidation/; mitigation rescoped | fix-pass BLOCKER + MAJOR (untracked-set) |
| prd | Version, §1.3, §2 "Prod build lags", A-02 | Dual-SHA grounding: code tree `155cf06`, branch HEAD `b53bb3e` (docs-only); A-02/T-INF-2 no longer name `155cf06` as HEAD | fix-pass MAJOR (wrong HEAD SHA) |
| design | §4, header | Data-loss paragraph → restored-and-committed framing, authoritative committed package + fidelity caveat, "no re-red-team required"; header dual-SHA | fix-pass BLOCKER / MAJOR |
| req | header; FR-CMP-8 | Header dual-SHA; FR-CMP-8 acceptance += audit **P2-I**: DB-enforced per-email alert cap (or documented overshoot; `alerts/route.ts:49-52` race), documented limiter fail-open (`redis.ts:78,83-85`), double-opt-in deferred | fix-pass MAJOR (P2-I coverage gap) |
| tasks | header, §0.2.6, M0 gate, T-INF-2 | Dual-SHA header; destroyed→restored framing; todo/D3 references point at committed `tasks/todo.md`; M0 "no untracked" gate extended to `audit/` + marked partially satisfied at `b53bb3e` | fix-pass BLOCKER / MAJOR |
| tasks | T-INF-12 | Acceptance rewritten to the ACTUAL remaining untracked set (2026-07-08_v3/, 2026-07-09_v3.1/, docs/recovered/2026-07-09/, audit/2026-07-09_consolidation/ — the CHANGELOG provenance corpus); Verify grep → `^\?\? (docs\|tasks\|audit)/` | fix-pass MAJOR (untracked-set) |
| tasks | T-SEO-6 manifest, §7.2, §7.3, footer, Files | Repointed at the committed `docs/specs/url-structure/2026-07-08_v2/` package + `tasks/plan.md`/`todo.md`; "re-derive the plan or re-red-team before ticking" → "verify restoration fidelity, then use the restored register"; deferral row + footer updated | fix-pass BLOCKER (kills unnecessary M2-critical-path rework) |
| tasks | T-CMP-7 | Acceptance += the same P2-I clause (DB cap / fail-open doc / double-opt-in deferred), mirroring FR-CMP-8 | fix-pass MAJOR (P2-I coverage gap) |
| README | lines 5/7/12/33/51/57 | Dual-SHA grounding; item 2 → restored-and-committed; M0 gate note; A-19 sign-off item → fidelity spot-check; Time Machine open item CLOSED (restore landed; residual = fidelity spot-check) | fix-pass BLOCKER / MAJOR |
| CHANGELOG | title + this section | Title carries both SHAs; this fix-pass table records the one-commit grounding lag | fix-pass MAJOR |

## Minors pass — 2026-07-09 (post-verification editorial close-out)

The 9 verification minors, applied by the main session after the fix pass:

| doc | anchor/ID | change | driving finding |
|---|---|---|---|
| req + design | FR-SEO-6, DSN-SEO-6 | `new Date()` lastmod claim scoped: it governs home/legal/category entries + invalid dates; deal entries pass real `d.lastUpdated` (`sitemap.ts:46-51`) — the build-freeze is the deal-lastmod defect | minor (hallucination: overstatement) |
| design | §7.1 matrix | FR-SEO-11 → +SEO-12; FR-PDP-5 → +PDP-7 (round-trip with the new DSNs' Satisfies columns) | minor (trace drift) |
| tasks | §7.1 matrix | DSN-ING-1/-ING-2 cells trimmed to tasks' actual Traces (T-ING-7→ING-9/INF-4; rewritten T-ING-6→ING-10/ING-12); DSN-ING-6 += T-PDP-6 (data); DSN-SEO-7 cell notes T-SEO-1 owns the AI-bot groups | minor (trace drift) |
| req | FR-INF-11 | marked `_(reserved)_` per the §0 gap-marking contract (was an unmarked numbering gap inherited from v3) | minor (unmarked gap) |
| tasks | T-SEO-1 | Acceptance += port the 3 AI-bot Allow groups into `robots.ts` `rules[]` before `public/robots.txt` deletion (FR-SEO-7 had no task-level owner — a GEO-thesis gap) | minor (completeness) |
| tasks | T-PDP-1 | Acceptance/Files += the DealCard minted-404-href fallback fix (`DealCard.tsx:27`) as the pre-M2 owner | minor (completeness) |
| tasks + prd | T-ING-5 Verify, §8.2 snapshot row | stale `snapshot-prices.cjs:3` comment given a fix owner; §8.2 parenthetical future-proofed for the T-ING-6 restore | minor (completeness) |
| tasks | T-ING-5 | ⛔ ASK FIRST added: ALTER-in-place vs rename-aside migration path is a human decision post-probe (audit-plan sequencing note 3 — the second proposed human gate, previously unadopted) | minor (completeness) |
| CHANGELOG | Consciously-NOT-changed | daily-fill semantics inversion recorded (change-only trigger + snapshot-owned daily-fill vs the remediation's per-day trigger fill) | minor (completeness) |

## Execution log — 2026-07-09 (audit-plan P0-A/B/C, user-approved)

| commit | task | what landed |
|---|---|---|
| `7f0ffa9` | T-INF-12 (P0-A) | Both gsot suites + `docs/recovered/` + `audit/2026-07-09_consolidation/` committed (17 files). T-INF-12 **ticked**; only tooling files (`.agents/`, `.claude/skills/`, `.mcp.json`, `skills-lock.json`) remain untracked, out of scope. |
| `c2d9794` | T-DB-0 (P0-B), on-disk half | Duplicate `record_price_history` deleted; `IS DISTINCT FROM` + `of sale_price` folded into the single day-based definition; tombstone comment; db-migrate.yml single-definition pre-apply guard (tested pass + catch). Unticked pending staging drill + prod probes. |
| `3ed5859` | T-ING-6 (P0-C), restore half | Main's `ingest-awin.cjs` + `ingest-awin.yml` restored (`git diff main..HEAD` = empty); behaviors verified present; **finding:** main's ingest composes no deal slug (D11-conformant) → `deals_set_slug` trigger backstop is load-bearing → T-INF-1 ordering matters. Unticked pending M1 live-feed clauses (G1). |
