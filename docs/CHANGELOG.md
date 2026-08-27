# DealRadar — change log

Significant changes to the live site, newest first. Milestones only; see
`git log` for the full 200+ commit history.

**Stack today:** Next.js on a **Hetzner VPS** (Docker/Coolify, auto-deploy on
push to `main`) → behind **Cloudflare** (free plan, CDN + WAF) → **Supabase Pro**
(Postgres 17). Data pipeline runs on **GitHub Actions** cron.

---

## Hosting migration: Netlify → Hetzner + Cloudflare (Aug 2026)

The site moved off Netlify. Summary, because it is the largest change here:

**Why.** Every page was `force-dynamic` and uncached, so each request — human or
bot — was a billed serverless invocation plus Supabase queries. With ~31 k deals
× 13 locales the crawlable surface is ~405 k URLs. On **08-06** a crawl wave
burned **2,058 credits / 205 GB-Hrs in one day** and exhausted the monthly
budget. Serverless cost scales with catalog size, so this only gets worse: at
100 k products the projection was ~4,000+ credits/month against a 3,000 budget.

**What changed.**

| | Before | After |
|---|---|---|
| Web app | Netlify Functions (per-invocation billing) | **Hetzner VPS** — flat ~€5/mo, Docker via Coolify |
| CDN | Netlify Edge | **Cloudflare** free — deal pages cached at the edge |
| Database | Supabase | **Supabase Pro** (unchanged otherwise) |
| Repo + cron | GitHub / GitHub Actions | unchanged |

Cost now stops scaling with the catalog: same flat price at 31 k or 1 M products,
however hard crawlers hit it.

**Timeline.**
- **08-06** — Netlify compute blowout (credits exhausted).
- **08-07** — root cause found: uncached `force-dynamic` pages × ~20 crawlers.
  Training crawlers disallowed as a stopgap (`3854323`).
- **08-08** — the same uncached crawl saturated Postgres: trivial queries took
  ~48 s, SSR pages timed out, **site effectively down**; whole CI pipeline
  failed too. Recovered by restarting the Supabase project.
- **08-10** — deal pages CDN-cached (`eace6be`); compute dropped **2,058 → 43
  credits/day** (~98%).
- **08-11** — Dockerfile / Coolify / Cloudflare scaffolding + runbook
  (`0d26eee`, `docs/migration/hetzner-cloudflare-coolify.md`).
- **by 08-27** — live on Hetzner, Netlify out of the path (exact cutover date
  not recorded in this repo).
- **08-27** — Cloudflare activated in front of the origin; app fixed for CDN
  correctness (`08070c8`); origin firewalled to Cloudflare's ranges.

**Rollback.** Grey-cloud the Cloudflare DNS record to bypass the CDN; `netlify.toml`
is still in the repo if Netlify is ever needed again.

---

## 2026-08

**08-27 — Cloudflare put in front of the site**
- DNS moved to Cloudflare (registrar: Hostinger). SSL mode **Full (strict)**.
- Cache Rule `URI Path wildcard /*/deal/*` → deal pages served from the edge
  (verified HIT, ~65 ms). Home/category/search deliberately stay uncached —
  they vary by the visitor's location cookie.
- Hetzner firewall locked to Cloudflare's IP ranges; the origin IP is no longer
  reachable directly. Closes the CDN bypass and makes `cf-connecting-ip`
  trustworthy for rate limiting.

**08-27 — Data pipeline restored** (`ef26d14`)
- Ingest, Verify, Programmes-sync, Cost-guardrail and Apply-schema had failed
  **daily since 08-22**, silently: `actions/setup-node@v5` reads `packageManager`
  from `package.json` and aborts if pnpm isn't on PATH. It fails at *setup*, so
  every later step was skipped and the uptime monitor stayed green.
- Catalog had been frozen for 5 days; re-ingested (34,652 rows refreshed).
- `SUPABASE_DB_URL` secret added (Session pooler URI — the direct host is
  IPv6-only and GitHub runners are IPv4).

**08-27 — App made correct behind a CDN** (`08070c8`)
- Deal pages no longer emit `Set-Cookie`; a cached response would otherwise
  replay the first visitor's country cookie to everyone.
- `clientIp()` now prefers `cf-connecting-ip`; behind a proxy every visitor
  previously collapsed into one shared rate-limit bucket.

**08-27 — Mediakos miscategorised** (`252a713`)
- 126 supplements (CBD/collagen oils, Omega-3, Magnesium, MSM, NAC) were
  published under **Elektronik** and **Sport**. Fixed at advertiser level; live
  rows corrected. 4th occurrence of this defect class — see `CLAUDE.md`.

**08-22/23 — TravelDeal + store filter**
- Travel vertical behind a runtime flag (off by default): pinned menu,
  coming-soon pages, notify form, launch announcement.
- Search: filter deals by store. Pets moved second in the category row.

**08-19/20 — Ops + catalog hardening**
- DB-aware health endpoint `/api/health/deep`, polled every 15 min — added after
  an outage went unnoticed for 3 days.
- Closed two silent `electronics` category defaults in the ingest.
- Dropped two unused GIN trigram indexes (write cost on every upsert).

**08-15 — Reliability + i18n**
- Ingest timeout 15 → 45 min; the old ceiling was killing half the runs.
- Price disclaimer and country names localised (were hardcoded English).

**08-10/11 — Caching + VPS scaffolding** (`eace6be`, `2b73ab1`, `0d26eee`)
- Deal pages CDN-cached (`s-maxage=3600`, `stale-while-revalidate`); compute
  fell ~98%. A DB error now returns 500, never a cacheable false 404.
- Dockerfile / Coolify / Cloudflare scaffolding + runbook.
- See **Hosting migration** above for the full story.

**08-07 — Trust fixes**
- Cards show the real recorded price cardiogram, matching the detail page.
- Price-drop promotion rejects implausibly deep drops as data glitches (a ÷100
  feed error had published a fake −99% deal).
- Model-training crawlers disallowed in `robots.txt` (no referral value, pure
  compute cost). Answer/search engines still allowed.

**08-02/03 — Deal Index + regular-price policy** (`bb15704`)
- 0–10 buy-timing score per product (60% price-history percentile, 40% discount
  depth), red→green ring with an explainer popover, 13 locales.
- Deals whose discount ends are now **published at the honest regular price**
  instead of hidden — buy now, wait, or set a price alert.
- Liveness verifier now probes the real product page, not the affiliate click
  tracker; the tracker's bot-blocking 404s had wrongly hidden ~16 k live deals.

## 2026-07

- **07-23/24** — Image-host allowlist single-sourced; `SmartImage` degrades
  instead of crashing on an unlisted host. Sitemap limited to active markets.
  English-language feeds for DE advertisers consumed (6 programmes).
- **07-19/21** — PDP full-content pipeline (merchant descriptions, spec rows,
  galleries, JSON-LD), price-drop promotion route, coverage watchdog,
  platform-agnostic liveness verifier. Pets/Health categories + health
  disclaimer. Statement-timeout and data-plane concurrency fixes.
- **07-14/16** — SEO/analytics block: sitemap index, IndexNow, AI-crawler
  policy, consent-gated GA4 + Clarity, GDPR disclosures ×13 locales. AWIN
  programme discovery. Rate limiting, HMAC + replay guard on postbacks.
- **07-05/13** — Numbered pagination, seeded-shuffle sort, recorded daily price
  history (cardiogram), standardized product detail across shops, breadcrumbs,
  collapsible filter bar.

## 2026-06

- **06-28/30** — AWIN live feed ingestion → Supabase + scheduled Action. SSR
  deal pages, postbacks, legal compliance, schema extensions. Live-shop
  price/stock verifier. Sold-out/undiscounted deals hidden rather than deleted.
  Per-deal click-ref for conversion attribution.
- **06-15** — Repository created.
