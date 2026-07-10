import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/utils/site-url';

// Use the shared origin helper so robots respects NEXT_PUBLIC_APP_URL (the
// canonical host) — Netlify's process.env.URL is the site's PRIMARY domain,
// which here is dealradar.eu, not the canonical dealradar.me.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
