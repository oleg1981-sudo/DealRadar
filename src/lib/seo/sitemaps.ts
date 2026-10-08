import 'server-only';
import { getAllDealSlugs, type SitemapDeal } from '@/lib/db/deals.repo';
import { dealCanonicalUrl } from '@/lib/seo/deal-url';
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
 * Deal entries list ONE URL each — the canonical copy in the deal's content
 * language — with no hreflang alternates (2026-10-08, see contentLocale()).
 * Static pages keep hreflang: their headings and copy really are translated.
 *
 * Chunk size: a deal entry is now ~0.2 KB (loc + lastmod), so 500 per chunk is
 * far under the 2 MB page-load budget. Small fast-loading chunks are what crawl
 * schedulers favor; the protocol caps are 50k URLs / 50 MB.
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
export async function dealChunks(): Promise<SitemapDeal[][]> {
  // The repo picks WHICH deals qualify (quality-ranked, round-robined across
  // merchants); it does not return them slug-ordered any more. Sort here so
  // chunk membership stays stable between runs — otherwise a score change
  // reshuffles every deals-N.xml and its lastmod, which teaches crawlers that
  // our lastmod means nothing.
  // Plain codepoint compare, not localeCompare — same order on every runtime.
  const deals = (await getAllDealSlugs()).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const chunks: SitemapDeal[][] = [];
  for (let i = 0; i < deals.length; i += DEALS_PER_SITEMAP) {
    chunks.push(deals.slice(i, i + DEALS_PER_SITEMAP));
  }
  return chunks;
}

/** ISO lastmod, or undefined when the time is unknown or unparseable. */
function isoOrUndefined(v: string | null): string | undefined {
  const t = v ? new Date(v) : null;
  return t && !Number.isNaN(t.getTime()) ? t.toISOString() : undefined;
}

/** One deals child sitemap (chunk is 0-based here; URLs are 1-based). */
export function dealsSitemap(chunk: SitemapDeal[]): string {
  const base = siteUrl();
  const entries = chunk.map((d) => {
    // `lastmod` is the deal's content_changed_at — moved only by a change a
    // visitor would see — not last_updated, which the daily verifier bumps as a
    // liveness heartbeat. Until 2026-10-08 it was last_updated, so 1,993 of the
    // 2,000 entries claimed "changed today" every day: precisely the
    // always-"now" stamp that teaches Google to ignore lastmod.
    const lastmod = isoOrUndefined(d.lastmod);
    return `<url><loc>${xmlEscape(dealCanonicalUrl(base, d.slug, d.country))}</loc>${
      lastmod ? `<lastmod>${lastmod}</lastmod>` : ''
    }</url>`;
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
        .map((d) => (d.lastmod ? new Date(d.lastmod).getTime() : NaN))
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
