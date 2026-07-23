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

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  images: {
    // Provider CDNs vary per network; tighten this list once live feeds are on.
    remotePatterns: JSON.parse(
      readFileSync(new URL('./scripts/lib/image-hosts.json', import.meta.url), 'utf8'),
    ).hosts.map((hostname) => ({ protocol: 'https', hostname })),
  },
};

export default withNextIntl(nextConfig);
