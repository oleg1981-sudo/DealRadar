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

## STATUS (2026-08-27)

Phases 1–3 are **DONE**: the site is live on the Hetzner VPS
(`178.104.121.109`, Nuremberg) serving `dealradar.me` directly. Netlify is out
of the path. **Phase 4 (Cloudflare) was skipped**, so today there is *no CDN*:
the app emits `CDN-Cache-Control` on deal pages and nothing honours it, every
crawl reaches the origin and Postgres, and the origin IP is publicly exposed.
Phase 4 below is rewritten for that reality — adding Cloudflare **in front of a
site that is already live**, not a staging cutover.

App-side prerequisites are already shipped (commit 08070c8):
- deal pages ship **cookie-free** (a cached `Set-Cookie` would replay the first
  visitor's geo to everyone), and
- `clientIp()` prefers **`cf-connecting-ip`** (otherwise every visitor collapses
  into one rate-limit bucket behind the edge).

## Phase 4 — Put Cloudflare in front of the LIVE site  [YOU]

Order matters. Doing step 4 *after* step 3 can produce a redirect loop.

1. **Add the site.** https://dash.cloudflare.com → **Add a site** →
   `dealradar.me` → **Free**. Cloudflare imports the existing DNS records —
   check the apex `A` record points at `178.104.121.109`.
2. **Set SSL mode FIRST.** SSL/TLS → Overview → **Full (strict)**.
   *Why first:* on the default/Flexible setting Cloudflare talks to the origin
   over plain HTTP while the origin redirects HTTP→HTTPS — an infinite redirect
   loop that takes the site down. The origin already serves a valid Let's
   Encrypt cert, so **Full (strict)** is correct.
3. **Switch nameservers** at the registrar to the two Cloudflare gives you.
   Propagation is minutes–hours. The site keeps working throughout: old
   resolvers hit the origin directly, new ones go through Cloudflare.
4. **Proxy the record.** DNS → apex `A` record → **Proxied** (orange cloud).
   Add `www` as a proxied `CNAME` to the apex if you use it.
5. **Cache Rule** — Caching → Cache Rules → **Create rule** ("Cache deal pages"):
   - **When**: *URI Path* → *matches regex* → `^/[a-z]{2}/deal/.+`
   - **Then**: *Cache eligibility* = **Eligible for cache**;
     *Edge TTL* = **Use cache-control header if present** (respect origin).
   This is what makes Cloudflare honour
   `CDN-Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400`.
   Cloudflare does not cache HTML without such a rule.
   **Do not widen the regex.** Home/category/search read the location cookie and
   must stay uncached — caching them would serve one visitor's city view to
   everyone.
6. **Lock the origin to Cloudflare** (Hetzner Cloud → Firewall, or `ufw`): allow
   :80/:443 only from Cloudflare's published ranges
   (https://www.cloudflare.com/ips/), plus your own IP for SSH.
   *Why it matters:* `cf-connecting-ip` is only trustworthy for traffic that
   actually transits Cloudflare. If the origin stays open, someone can hit
   `178.104.121.109` directly and forge that header to bypass rate limits — and
   bypass the CDN entirely.
7. **Watch cert renewal.** Let's Encrypt HTTP-01 renewals normally still work
   through the proxy, but if Coolify/Traefik ever fails to renew behind
   Cloudflare, switch the origin to a **Cloudflare Origin Certificate**
   (SSL/TLS → Origin Server → Create Certificate, 15-year) and keep Full
   (strict). No rush — just don't ignore a renewal-failure alert.

## Phase 5 — Verify  [YOU/ME]

Once the orange cloud is on, tell me and I'll sweep it. What must be true:
- `cf-ray` header present (traffic is going through Cloudflare).
- A deal page fetched twice → 2nd response has **`cf-cache-status: HIT`** and is
  fast; the deal page carries **no `Set-Cookie`**.
- Home/category/search → **`cf-cache-status: DYNAMIC`** (i.e. *not* cached) and
  still send `Set-Cookie`.
- All 13 locales render; `/robots.txt`, `/sitemap.xml`, `/api/health` fine.
- `/api/health/deep` still reports `db: up`.

## Rollback

**Grey-cloud the DNS record** (DNS → apex `A` → toggle Proxied off). Traffic
goes straight to the origin again within the record's TTL — exactly today's
behaviour. Nothing in the repo or database depends on Cloudflare, so this is a
one-click, zero-risk revert. Full revert = point the nameservers back.

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
