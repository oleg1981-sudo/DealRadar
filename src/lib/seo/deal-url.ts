import { contentLocale } from '@/lib/geo/countries';

/**
 * The canonical URL of a deal page — the copy in the deal's own content
 * language (see contentLocale()). One definition, shared by the page's
 * `<link rel="canonical">`, its JSON-LD, and the sitemap, so the three can never
 * disagree about where a deal lives.
 */
export function dealCanonicalUrl(base: string, slug: string, country: string): string {
  return `${base}/${contentLocale(country)}/deal/${slug}`;
}
