# DealRadar — Remediation Plan (`2026-06-23_v2` scope)

Execution-ready fix plan derived from `audit/findings.md`. Ordered by priority; grouped so shared one-line fixes land together. Effort: **S** ≤30 min · **M** ≤2 h · **L** > half-day. Each item lists the acceptance check.

> **Approval gate (per `audit` skill + global audit policy):** this plan is **not yet executed**. Three product decisions (A–C) need your call first — see bottom.

---

## P0 — Production-breaking (must land before any "complete"/launch claim)

| # | Fix | Where | Effort | Acceptance |
|---|---|---|---|---|
| P0-1 | Persist `slug` (+`ean_code`) in AWIN ingest; add DB NOT-NULL backstop + one-time backfill | `scripts/ingest-awin.cjs:116-134`, `supabase/schema.sql:88,97` | M | Live AWIN row has non-null `slug`; `/deal/<that-slug>` returns 200 (not 404); backfill sets all existing rows |
| P0-2 | Run price-drop alerts against ingested rows (post-upsert notify in ingest pipeline or `/api/refresh-alerts` called by the Action) | `scripts/ingest-awin.cjs` (or new route) + `alerts.repo.ts:53` | M | A simulated AWIN price drop below a `price_alerts.target_price` dispatches an email + flips `notified` |
| P0-3 | Add `POST` handler to unsubscribe route (shared verify+delete helper with GET) | `src/app/api/alerts/unsubscribe/route.ts` | S | `curl -X POST '<unsub-url>'` → 200 and row deleted; GET still works; idempotent |
| P0-4 | Localize legal pages: add `legal.*` namespaces + `getTranslations`/`setRequestLocale` refactor; complete privacy to 6 sections; real Impressum data | `imprint/privacy/terms/page.tsx`, `src/messages/*.json` | L | `/de/privacy` renders German; all 13 locales keyed; privacy has 6 sections. **Legal copy = professional/legal review (Decision C)** |

## P1 — High (GEO/SEO thesis, compliance, security)

| # | Fix | Where | Effort | Acceptance |
|---|---|---|---|---|
| P1-1 | JSON-LD → `AggregateOffer` + `itemCondition:NewCondition` (+`lowPrice/highPrice/offerCount/priceSpecification`) | `deal/[slug]/page.tsx:35-53` | S | Rich Results Test passes; `itemCondition` + `AggregateOffer` present |
| P1-2 | Render visible AI proof fields (90-day-low text + "Verified at … CET"), localized | `deal/[slug]/page.tsx` | M | Both strings visible in page source (no `sr-only`); driven by `historicalLowPrice`/`lastUpdated` |
| P1-3..5 | Sitemap: `import LOCALES` (fixes `se→sv`), source slug from Supabase (fixes 404s), emit `alternates.languages`+`x-default` | `src/app/sitemap.ts` | M | No `/se/*`; deal URLs resolve 200; each page one entry with hreflang graph |
| P1-6 | robots.txt explicit AI-bot `Allow` groups | `public/robots.txt` | S | `OAI-SearchBot`/`PerplexityBot`/`Google-Extended` groups present; `Disallow: /api/` kept |
| P1-7 | Deal-page CTA `rel="noopener noreferrer nofollow sponsored"` | `deal/[slug]/page.tsx:116` | S | Outbound link has `nofollow sponsored` |
| P1-8 | Deal page chrome + metadata via `getTranslations('deal')`; add `deal.backToDeals` | `deal/[slug]/page.tsx` | M | `/de/deal/...` chrome is German |
| P1-9 | Wire `SponsoredBadge` (fix namespace `deals→deal`) adjacent to CTA on every card; localize deal-page label | `DealCard.tsx:90`, `SponsoredBadge.tsx` | S | Visible localized "Werbung/Sponsored" badge by every CTA |
| P1-10/11 | Cookie: "Cookie Settings" footer control re-opens consent + granular toggle; equal-weight Accept/Reject | `Footer.tsx`, `CookieBanner.tsx` (or FOSS lib) | M | Consent re-openable after first choice; buttons equal weight. **Depends on Decision B** |
| P1-12 | Throw on missing `CRON_SECRET` in prod; keep dev fallback | `src/lib/utils/crypto.ts:3` | S | Prod boot without `CRON_SECRET` fails fast; dev unaffected |
| P1-13 | Postback: `timingSafeEqual`, require `WEBHOOK_SECRET`, status-enum + commission validation, network-aware subID parse | `postbacks/route.ts` | M | Bad status/commission → 400; constant-time auth; Kelkoo/TD subID attributed |
| P1-14 | Rate-limit: trusted edge IP + atomic `INCR`/`EXPIRE` (or `@upstash/ratelimit`) | `alerts/route.ts`, `redis.ts` | M | 6th request 429 under concurrency; XFF spoof ineffective |
| P1-15 | Sanitize/encode `city` before PostgREST `.or()` | `deals.repo.ts:84` | S | Crafted `city` cookie cannot alter the filter |

## P2 — Medium / Low (correctness, robustness, hygiene)

`transactions` FK+`subid3`+`raw_payload`+CHECKs · trigger daily-fill branch (`is distinct from`) · populate `eanCode` (activate EAN dedup) · automated `price_alerts` retention job (NFR-PRIV-1) · migration runner/CI (Task 1.2) · bounded-concurrency refresh fan-out · sitemap from Supabase across countries · localized unsubscribe pages · footer label i18n · email CTA via `decorateAffiliateUrl` · `historicalLowPrice===0` guard · reconcile schema↔design column drift · share/`document` ingest discount math.

---

## Suggested sequencing (minimizes churn; groups shared edits)

1. **DB + ingest batch** (P0-1, P2 schema/trigger/transactions, GAP-7): one `schema.sql` migration pass + `ingest-awin.cjs` rewrite of `normalizeRow`.
2. **Alert pipeline** (P0-2, P0-3, P2 email-CTA/retention): one pass over `alerts.repo.ts` + unsubscribe route + ingest notify.
3. **SEO/GEO batch** (P1-1..8): mostly `deal/[slug]/page.tsx` + `sitemap.ts` + `robots.txt`.
4. **Compliance batch** (P0-4 legal i18n, P1-9..11, P2 footer/unsub i18n): message catalogs + footer + consent.
5. **Security batch** (P1-12..15): `crypto.ts`, `postbacks`, `alerts`/`redis`, `deals.repo`.
6. **Verify** (every step): `tsc --noEmit` + `next build` green; re-run the relevant acceptance checks; add unit tests for dedup/slug/crypto/affiliate (Task 3.4 mandated tests + no test runner exists today → add `vitest`).

## Final verification (definition of done)
- `tsc --noEmit` and `next build` exit 0, no new warnings.
- Each P0/P1 acceptance check above passes.
- Re-run a focused ground-truth re-audit of the touched files to confirm no regressions / no new false-negatives.

---

## Decisions needed before execution

- **A · Strackr:** implement the real `strackr.ts` provider (Tasks 4.1/4.2), **or** formally drop it from scope and remove the dead `STRACKR_API_KEY` + `**.strackr.com` config? (AWIN pivot is already a working substitute; Strackr's spec was explicitly provisional/unverified.)
- **B · Cookie consent:** adopt the spec's FOSS `vanilla-cookieconsent` (replaces the custom banner, gets granular toggles + re-open + consent versioning for free, satisfies NFR-TECH-7), **or** harden the existing custom banner (equal-weight, granular, re-open)?
- **C · Legal copy:** I can build the full i18n **plumbing** + structured keys + English source now, but the legally-binding translated text (13 languages) and real Impressum data need professional/legal sign-off (requirements.md assumption #4). Scaffold with English-fallback now and flag for translation, or wait for approved copy?
- **Execution scope:** P0 only / P0+P1 / everything (P0+P1+P2) in this pass?
