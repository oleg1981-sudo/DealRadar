import 'server-only';
import { getAllDealSlugs } from '@/lib/db/deals.repo';
import { CATEGORY_SLUGS } from '@/lib/providers/types';
import { LOCALES, routing } from '@/i18n/routing';
import { siteUrl } from '@/lib/utils/site-url';

/**
 * Sitemap-index architecture (one level deep — index → child, the maximally
 * compatible shape; deeper nesting hurts discovery):
 *
 *   /sitemap.xml            sitemap INDEX listing the children below
 *   /sitemaps/static.xml    home + legal + category pages (hreflang'd)
 *   /sitemaps/deals-N.xml   deal PDPs, DEALS_PER_SITEMAP per chunk (1-based)
 *
 * Chunk size keeps every child comfortably under the 2 MB page-load budget:
 * one deal entry ≈ 2.2 KB (loc + lastmod + 14 xhtml:link hreflang alternates),
 * so 500 deals ≈ 1.1 MB. The protocol caps are 50k URLs / 50 MB, but small
 * fast-loading chunks are what crawl schedulers favor.
 */
export const DEALS_PER_SITEMAP = 500;

const xmlEscape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);

/** One <url> entry: canonical default-locale URL + hreflang alternates. */
function urlEntry(base: string, path: string, lastmod?: string): string {
  const links = LOCALES.map(
    (l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${xmlEscape(`${base}/${l}${path}`)}" />`,
  );
  links.push(
    `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(`${base}/${routing.defaultLocale}${path}`)}" />`,
  );
  // lastmod only when the REAL modification time is known — an always-"now"
  // stamp teaches crawlers to distrust lastmod sitewide.
  return `<url><loc>${xmlEscape(`${base}/${routing.defaultLocale}${path}`)}</loc>${links.join('')}${
    lastmod ? `<lastmod>${xmlEscape(lastmod)}</lastmod>` : ''
  }</url>`;
}

const URLSET_OPEN =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';

/** The static child: home + legal + category landing pages. */
export function staticSitemap(): string {
  const base = siteUrl();
  const paths = ['', '/imprint', '/privacy', '/terms', ...CATEGORY_SLUGS.map((c) => `/category/${c}`)];
  return URLSET_OPEN + paths.map((p) => urlEntry(base, p)).join('\n') + '\n</urlset>\n';
}

/** Deal slugs in stable (slug-ordered) chunks. */
export async function dealChunks(): Promise<{ slug: string; lastUpdated: string }[][]> {
  // The repo picks WHICH deals qualify (quality-ranked, round-robined across
  // merchants); it does not return them slug-ordered any more. Sort here so
  // chunk membership stays stable between runs — otherwise a score change
  // reshuffles every deals-N.xml and its lastmod, which teaches crawlers that
  // our lastmod means nothing.
  // Plain codepoint compare, not localeCompare — same order on every runtime.
  const deals = (await getAllDealSlugs()).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const chunks: { slug: string; lastUpdated: string }[][] = [];
  for (let i = 0; i < deals.length; i += DEALS_PER_SITEMAP) {
    chunks.push(deals.slice(i, i + DEALS_PER_SITEMAP));
  }
  return chunks;
}

/** One deals child sitemap (chunk is 0-based here; URLs are 1-based). */
export function dealsSitemap(chunk: { slug: string; lastUpdated: string }[]): string {
  const base = siteUrl();
  const entries = chunk.map((d) => {
    const t = d.lastUpdated ? new Date(d.lastUpdated) : null;
    const lastmod = t && !Number.isNaN(t.getTime()) ? t.toISOString() : undefined;
    return urlEntry(base, `/deal/${d.slug}`, lastmod);
  });
  return URLSET_OPEN + entries.join('\n') + '\n</urlset>\n';
}

/** The index: static child + one entry per deal chunk, honest per-chunk lastmod. */
export async function sitemapIndex(): Promise<string> {
  const base = siteUrl();
  const chunks = await dealChunks();
  const children = [
    { loc: `${base}/sitemaps/static.xml`, lastmod: undefined as string | undefined },
    ...chunks.map((chunk, i) => {
      const newest = chunk
        .map((d) => new Date(d.lastUpdated).getTime())
        .filter((t) => !Number.isNaN(t))
        .reduce((a, b) => Math.max(a, b), 0);
      return {
        loc: `${base}/sitemaps/deals-${i + 1}.xml`,
        lastmod: newest ? new Date(newest).toISOString() : undefined,
      };
    }),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    children
      .map((c) => `<sitemap><loc>${xmlEscape(c.loc)}</loc>${c.lastmod ? `<lastmod>${c.lastmod}</lastmod>` : ''}</sitemap>`)
      .join('\n') +
    '\n</sitemapindex>\n'
  );
}

export const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=0, must-revalidate',
};
