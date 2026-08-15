# DealRadar

Geo-located, multilingual deals aggregator for Europe. Next.js 14 (App Router, TypeScript), Tailwind + shadcn-style components, next-intl, Supabase, Upstash Redis.

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env.local   # fill in what you have — everything is optional for dev
pnpm dev
```

**Zero-config dev mode:** with an empty `.env.local` the app runs entirely on deterministic mock data (all four providers fall back to seeded fixtures, Supabase reads are bypassed in-memory, Redis becomes a no-op). The full UI — geolocation, search, filters, i18n — is browsable without any keys.

## Environment variables

See `.env.example` for the full annotated list. Summary:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Deals persistence (server-only key) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | 30-min response cache |
| `KELKOO_API_TOKEN` | Primary live provider (per-country JWT from Kelkoo Publisher Center) |
| `AWIN_FEED_URL` | Secondary provider — datafeed download URL, ingested on a schedule (see "AWIN feed" below). The URL embeds the API key — keep secret. |
| `TRADEDOUBLER_TOKEN` | Tertiary provider |
| `IDEALO_API_KEY` | Reserved — no self-service API exists; stays mock |
| `CRON_SECRET` | Bearer auth for `POST /api/refresh` |

## Database setup

Run `supabase/schema.sql` in the Supabase SQL editor. It creates the `deals` table, trigram + composite indexes, the `distinct_brands()` RPC, and enables RLS. An optional `pg_cron` purge for stale rows is included commented out.

## Data refresh

`POST /api/refresh` with `Authorization: Bearer $CRON_SECRET` fans out across all supported countries × categories, pulls from providers in priority order, and upserts into Supabase. `docker-compose.yml` includes a curl sidecar that hits it every 15 minutes. On Vercel, use a Vercel Cron job instead.

### AWIN feed

AWIN is the exception: it serves one large combined product feed (gzipped CSV, ~300 MB), not a per-query search API, so it is **not** part of `/api/refresh`. Instead set `AWIN_FEED_URL` and run the standalone ingestion on a schedule:

```bash
node scripts/ingest-awin.cjs            # dry-run: download, filter, print a summary
node scripts/ingest-awin.cjs --upsert   # upsert genuine in-stock discounts into Supabase
```

It streams the feed, keeps rows where `search_price < rrp_price` (or `product_price_old`) and `in_stock=1`, normalises them (AWIN deep link as the CTA, `category_name` → our slug), and batch-upserts to `deals`. Dependency-free (Node built-ins + Supabase REST), so a GitHub Action / cron runner needs no install.

A scheduled GitHub Action runs it daily (03:00 UTC): [`.github/workflows/ingest-awin.yml`](.github/workflows/ingest-awin.yml). Add three repo secrets (Settings → Secrets and variables → Actions): `AWIN_FEED_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Trigger a manual run (with an optional dry-run toggle) from the Actions tab.

## Adding a new price provider

1. Create `src/lib/providers/<name>.ts` implementing the `PriceProvider` interface from `src/lib/providers/types.ts` (stateless; throw `ProviderError` on failure; prefix `productId` with `<name>:`).
2. Add one line to the `PROVIDERS` array in `src/lib/providers/registry.ts` with a unique `priority` (lower = tried first).

That's it — fall-through, dedup, caching, and persistence are handled by the registry and route layer.

## Adding a new locale

1. Add the locale code to `LOCALES` in `src/i18n/routing.ts`.
2. Create `src/messages/<locale>.json` (copy `en.json` and translate).
3. Add the label to `LanguageSwitcher.tsx`.

## Known gaps / TODO before production

- **Translations:** all 13 locales are fully translated — every locale carries all 174 keys of `en.json`. The few strings still identical to English are deliberate (`EAN`, `Min`/`Max`, `Cookies`, and cognates like `Model`/`Contact`). Remaining nit: `pl` and `pt` interpolate a country name straight after a preposition, which needs a case/contraction those templates can't express (`w Niemczech`, `na Alemanha`) — fix is a copy change in `pl.json`/`pt.json`, e.g. drop the preposition as `fi` already does.
- **AWIN secrets:** the ingestion script and its scheduled Action (`.github/workflows/ingest-awin.yml`) are built and verified; they go live once the `AWIN_FEED_URL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` repo secrets are set. Until then, `src/lib/providers/awin.ts` serves mock data when `AWIN_FEED_URL` is unset locally.
- **Kelkoo response shape:** the offer-mapping interfaces were written from public docs; verify against a live response in requestbuilder.kelkoogroup.com once you have a token.
- **Image domains:** `next.config.mjs` `remotePatterns` are permissive for the affiliate CDNs; tighten for production.
- **Idealo:** no public publisher API — partnership only (idealo.de/partner). Provider remains mock.

## Docker

```bash
docker compose up --build
```

Multi-stage build (node:20-alpine, non-root), web on :3000, plus the refresh cron sidecar.
