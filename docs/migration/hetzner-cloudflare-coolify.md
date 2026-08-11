# Migration runbook — Netlify → Hetzner + Cloudflare + Coolify

Goal: move the **web app** off Netlify (per-invocation billing that blows the
credit budget) onto a **flat-rate Hetzner VPS**, with **Cloudflare** (free) as
the CDN in front. Cost stops scaling with the catalog: 31k or 1M products,
unlimited crawlers, same ~€5/month.

## What moves, what stays

| Piece | Before | After |
|---|---|---|
| Web app (Next.js SSR) | Netlify Functions | **Hetzner VPS** (Docker, via Coolify) |
| CDN / caching | Netlify Edge | **Cloudflare** (free) |
| Database | Supabase Pro | **Supabase Pro** (unchanged) |
| GitHub repo | GitHub | **GitHub** (unchanged) |
| Cron jobs (ingest / verify / snapshot / alerts) | GitHub Actions | **GitHub Actions** (unchanged — they write to Supabase directly) |
| DNS | (registrar) | **Cloudflare** nameservers |

Only the web front-end and the CDN change. The database, the repo, and every
scheduled job stay exactly where they are.

## Division of labour

**I (Claude) have prepared, committed to the repo:**
- `Dockerfile` — builds the Next.js `standalone` server on Linux.
- `.dockerignore`.
- `next.config.mjs` — `output:'standalone'` gated behind `BUILD_STANDALONE=1`
  (Netlify unaffected); cache header now emits the portable `CDN-Cache-Control`
  so Cloudflare honours it too.
- `src/app/api/health/route.ts` — `/api/health` liveness probe for Coolify.

**You must do** (needs an account, billing, a password, DNS, or a dashboard —
things I cannot touch). Each step below marks **[YOU]** or **[PREPARED]**.

---

## Phase 1 — Hetzner server  [YOU]

1. Create an account at https://console.hetzner.cloud and add billing.
2. **New project** → **Add Server**:
   - Location: **Nuremberg or Falkenstein** (Germany — closest to the DE audience).
   - Image: **Ubuntu 24.04**.
   - Type: **CX22** (2 vCPU / 4 GB / 40 GB, ~€4.5/mo). Enough for cache-miss
     renders; bump later in one click if needed.
   - SSH key: add your public key (`ssh-keygen -t ed25519` locally if you have
     none, then paste `~/.ssh/id_ed25519.pub`).
3. Note the server's **public IPv4**.
4. First login: `ssh root@<SERVER_IP>` and run `apt update && apt upgrade -y`.

## Phase 2 — Install Coolify (push-to-deploy on your own box)  [YOU]

On the server (as root):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Then open `http://<SERVER_IP>:8000`, create the admin account, and finish the
onboarding (it registers this server as the deploy target). Coolify installs
Docker and a reverse proxy (Traefik) with automatic Let's Encrypt certificates.

## Phase 3 — Deploy the app in Coolify  [YOU], config [PREPARED]

1. Coolify → **+ New** → **Public Repository** (or connect the GitHub App for
   auto-deploy on push) → repo `oleg1981-sudo/DealRadar`, branch `main`.
2. **Build pack: Dockerfile** (Coolify auto-detects the repo `Dockerfile`).
3. **Port: 3000**.
4. **Health check path: `/api/health`**.
5. **Environment variables:** open your Netlify site → *Site configuration →
   Environment variables*, and copy **every** value into Coolify. Then add:
   - `NEXT_PUBLIC_APP_URL = https://dealradar.me`
   - Mark any `NEXT_PUBLIC_*` vars as **available at build time** (they are
     inlined into the client bundle during `pnpm build`).

   Minimum required for the app to run: `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`. Also copy, if present:
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `WEBHOOK_SECRET`,
   `GA_MEASUREMENT_PROTOCOL_API_KEY`, `CRON_SECRET`, `RESEND_API_KEY`,
   `ALERT_FROM_EMAIL`, and any `NEXT_PUBLIC_*` analytics IDs. Provider keys
   (AWIN/Kelkoo/…) are **not** needed here — only the GitHub Actions use them.
6. **Domain (staging first):** set the Coolify service domain to a subdomain you
   are NOT yet using, e.g. `new.dealradar.me`. Deploy. Coolify issues a cert and
   serves it. (DNS for this subdomain is set in Phase 4.)
7. Click **Deploy** and watch the build log. First deploy ≈ 3–6 min.

## Phase 4 — Cloudflare  [YOU], cache rule [PREPARED value]

1. Create a free account at https://dash.cloudflare.com → **Add a site** →
   `dealradar.me` → Free plan.
2. Cloudflare shows two **nameservers**. Set them at your domain registrar
   (where dealradar.me is registered), replacing the current ones. Propagation:
   minutes to a few hours.
3. In Cloudflare **DNS**, add:
   - `A  new  → <SERVER_IP>`  (Proxied / orange cloud) — the staging host.
   - Leave the apex (`@`) pointing at Netlify **for now** (don't cut over yet).
4. **SSL/TLS → Overview → Full (strict)** (Coolify serves a valid Let's Encrypt
   cert on the origin, so strict is correct).
5. **Caching → Cache Rules → Create rule** ("Cache deal pages"):
   - **When**: `URI Path` `matches regex` `^/[a-z]{2}/deal/.+`
   - **Then**: *Eligible for cache* = **On**; *Edge TTL* = **Use cache-control
     header if present** (respect origin). This makes Cloudflare honour the
     `CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`
     the app emits. (Cloudflare does not cache HTML without this rule.)

## Phase 5 — Test on staging BEFORE cutover  [YOU/ME]

Against `https://new.dealradar.me`:
- Home, a category, a deal page, search, `/robots.txt`, `/sitemap.xml` all load.
- All 13 locales render (`/de`, `/en`, …) — watch for missing translations.
- A deal page served twice: 2nd hit shows a Cloudflare cache HIT
  (`cf-cache-status: HIT`) and is fast.
- `/api/health` returns `ok`.
- Ping me with the staging URL and I'll run the full verification sweep
  (cache headers, locale coverage, JSON-LD, price cardiograms).

## Phase 6 — Cutover  [YOU]

Only once staging is verified:
1. Cloudflare DNS: point the apex `A @ → <SERVER_IP>` (Proxied). Remove/disable
   the Netlify DNS records.
2. In Coolify, add `dealradar.me` (and `www`) as domains on the service so its
   proxy serves a cert for them.
3. Watch `https://dealradar.me` — it's now served by Hetzner via Cloudflare.
4. Keep Netlify running for ~48h as a hot rollback (see below).

## Phase 7 — Decommission  [YOU]

After ~48h stable: delete the Netlify site (stops any residual billing). Keep
the `netlify.toml` in the repo — harmless, and it lets you redeploy to Netlify
instantly if ever needed.

---

## Rollback (any time before Phase 7)

DNS is the switch. In Cloudflare, point the apex back to Netlify (restore the
Netlify record / CNAME). Within the DNS TTL you're back on Netlify. Nothing in
the repo or database changed, so rollback is just a DNS edit.

## Ongoing operations (after migration)

- **Deploys:** push to `main` → Coolify auto-deploys (like Netlify did). GitHub
  stays the source of truth.
- **Server upkeep:** occasional `apt upgrade` + Coolify's self-update. Set
  Hetzner + Cloudflare alerts; enable Hetzner automated backups (~€1/mo) or a
  weekly snapshot.
- **Scaling:** if cache-miss render load ever grows, resize the Hetzner server
  one tier up (a reboot) — cost still flat and tiny vs. per-invocation billing.
- **Cache TTL:** consider raising the deal-page `s-maxage` from 3600 to 86400
  (24h) in `next.config.mjs` — prices only move daily (the verify job), and a
  longer TTL dedupes crawlers further. One-line change.

## Notes / gotchas

- The `standalone` build only fails **locally on Windows** (symlink perms); it
  builds correctly in the Linux Docker image. The first Coolify deploy is the
  real test.
- Middleware already reads `cf-ipcountry`, so geo detection works behind
  Cloudflare with no code change.
- `siteUrl()` falls back to `https://dealradar.me`, so canonicals/sitemap are
  correct even before `NEXT_PUBLIC_APP_URL` is set — but set it anyway.
- next-intl + standalone: verify all 13 locales load on staging (Phase 5). If a
  locale 500s with a missing-messages error, the message JSON wasn't traced —
  tell me and I'll add an explicit copy of `src/messages` to the Dockerfile.
