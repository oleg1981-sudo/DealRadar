import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Security headers applied to every route. CSP is intentionally pragmatic:
// Next's App Router streams inline hydration scripts without a nonce by default,
// so `script-src` must allow 'unsafe-inline' or the site white-screens — the
// real XSS sink (JSON-LD from feed data) is closed by escaping at the source.
// `frame-ancestors 'none'` gives clickjacking protection with zero breakage.
const CSP = [
  "default-src 'self'",
  // *.clarity.ms: Microsoft Clarity (consent-gated); *.googletagmanager.com:
  // GA4 gtag.js (consent-gated, Consent Mode v2). Analytics uploads/beacons
  // ride the existing connect-src https: / img-src https:.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clarity.ms https://*.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
];

import { readFileSync } from 'node:fs';

// Deal pages are ~99% of the crawl surface and vary ONLY by path (locale +
// slug) — no cookie, no query. Let Netlify's CDN serve them from its Durable
// Cache and revalidate hourly instead of invoking a function + Supabase query
// on every crawl. This is the fix for the Aug 6 compute + Aug 8 DB-saturation
// incident; category/home stay dynamic (they read the location cookie).
// stale-while-revalidate keeps serving cached HTML while a background refresh
// runs, so a slow origin never blocks a response. NOT `durable`: a deploy then
// purges the edge cache, giving us a one-click "clear a bad entry" lever (a
// durable false-404 from the Aug 8 DB outage otherwise survives deploys).
const DEAL_CDN_CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';
// Emit BOTH the Netlify-specific and the vendor-neutral CDN header, so the same
// build caches on Netlify today AND on Cloudflare (in front of the Hetzner
// origin) after the migration. The origin Next server ignores these; the CDN
// honours them. On Cloudflare a Cache Rule must mark these paths cache-eligible
// and "respect origin" TTL (see docs/migration/hetzner-cloudflare-coolify.md).
const CDN_CACHE_HEADERS = [
  { key: 'Netlify-CDN-Cache-Control', value: DEAL_CDN_CACHE },
  { key: 'CDN-Cache-Control', value: DEAL_CDN_CACHE },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `standalone` produces the self-contained server the Docker image runs, but
  // ONLY when building that image (BUILD_STANDALONE=1). Unset on Netlify → the
  // default output, so the current host is completely unaffected by this.
  output: process.env.BUILD_STANDALONE ? 'standalone' : undefined,
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/:locale/deal/:slug', headers: CDN_CACHE_HEADERS },
      { source: '/:locale/deal/:slug/md', headers: CDN_CACHE_HEADERS },
    ];
  },
  images: {
    // Provider CDNs vary per network; tighten this list once live feeds are on.
    remotePatterns: JSON.parse(
      readFileSync(new URL('./scripts/lib/image-hosts.json', import.meta.url), 'utf8'),
    ).hosts.map((hostname) => ({ protocol: 'https', hostname })),
  },
};

export default withNextIntl(nextConfig);
