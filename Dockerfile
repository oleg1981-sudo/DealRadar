# Production image for the DealRadar Next.js app — runs on the Hetzner VPS via
# Coolify (behind Cloudflare). Multi-stage: install deps, build the Next
# `standalone` server, then ship a minimal non-root runner.
#
# The GitHub Actions pipeline (ingest/verify/snapshot/alerts) is UNRELATED to
# this image — it keeps running on GitHub and writing to Supabase. This image is
# only the web front-end that Netlify used to serve.
# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- deps: install exactly what the lockfile pins ----
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ---- build: compile the standalone server ----
# No secrets needed at build time: without SUPABASE_* the app builds against its
# mock-data fallback; the real env is injected at runtime by Coolify. BUILD_
# STANDALONE flips next.config `output` to 'standalone'.
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# ---- runner: minimal, non-root ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
# standalone bundles the server + traced node_modules; static/ and public/ ship
# separately (Next does not fold them into standalone).
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
# The container platform health-checks GET /api/health.
CMD ["node", "server.js"]
