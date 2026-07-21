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

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  images: {
    // Any https host is allowed ON PURPOSE. The product-detail standard serves
    // FULL-RES merchant originals (unproxyImage swaps AWIN's 200x200
    // productserve thumbnail for the real image embedded in its `url` param),
    // and those originals live on each merchant's own CDN — www.sanicare.de,
    // cdn.shopify.com, … A fixed allowlist means every new advertiser that
    // ingest-v2 onboards CRASHES its product pages with
    // "Invalid src prop … hostname is not configured" until someone edits this
    // file. Image URLs come from our own ingested feed rows, not user input,
    // and CSP already permits `img-src https:`.
    // Trade-off: /_next/image will optimize any https URL it is handed.
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default withNextIntl(nextConfig);
