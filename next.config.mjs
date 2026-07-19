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
    // Provider CDNs vary per network; tighten this list once live feeds are on.
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.dummyjson.com' },    // mock product images
      { protocol: 'https', hostname: '**.kelkoogroup.net' },
      { protocol: 'https', hostname: '**.awin1.com' },
      { protocol: 'https', hostname: '**.productserve.com' },  // AWIN feed image CDN (aw_image_url)
      { protocol: 'https', hostname: 'cdn.shopify.com' },      // AWIN merchant gallery images (alternate_image)
      { protocol: 'https', hostname: 'www.sanicare.de' },      // Aliva/Sanicare merchant images (per-fid feeds, watchdog #17)
      { protocol: 'https', hostname: 'lyra-pet.de' },          // Lyra Pet merchant images (watchdog #17)
      { protocol: 'https', hostname: '**.tradedoubler.com' },
      { protocol: 'https', hostname: '**.strackr.com' },
    ],
  },
};

export default withNextIntl(nextConfig);
