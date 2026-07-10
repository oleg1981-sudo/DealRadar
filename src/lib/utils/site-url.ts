/**
 * Canonical public origin for the deployed site — the single source of truth for
 * every absolute URL we emit (canonicals, hreflang alternates, sitemap entries,
 * JSON-LD offer URLs, alert-email unsubscribe links).
 *
 * Resolution order, most-specific first:
 *   1. NEXT_PUBLIC_APP_URL — explicit override (also inlined into client bundles)
 *   2. URL               — Netlify's build/runtime primary URL (e.g. https://dealradar.me)
 *   3. hardcoded prod host — last resort
 *
 * The last resort is the REAL production host, so an unset env can never poison
 * output with a wrong domain (the previous `|| 'https://dealradar.eu'` fallback
 * silently pointed canonicals + unsubscribe links at a domain we don't run).
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || 'https://dealradar.me';
  return raw.replace(/\/+$/, '');
}
