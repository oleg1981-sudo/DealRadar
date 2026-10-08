import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SitemapDeal } from '@/lib/db/deals.repo';

const h = vi.hoisted(() => ({ deals: [] as SitemapDeal[] }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/deals.repo', () => ({ getAllDealSlugs: async () => h.deals }));
vi.mock('@/lib/utils/site-url', () => ({ siteUrl: () => 'https://dealradar.me' }));

import { dealsSitemap, sitemapIndex, staticSitemap } from './sitemaps';

beforeEach(() => {
  h.deals = [];
});

describe('dealsSitemap', () => {
  it('lists each deal once, at its content-language URL', () => {
    const xml = dealsSitemap([
      { slug: 'seifenspender-awin-1', country: 'DE', lastmod: '2026-10-01T08:00:00Z' },
      { slug: 'bastelwachs-awin-2', country: 'AT', lastmod: '2026-10-02T08:00:00Z' },
    ]);
    expect(xml).toContain('<loc>https://dealradar.me/de/deal/seifenspender-awin-1</loc>');
    expect(xml).toContain('<loc>https://dealradar.me/de/deal/bastelwachs-awin-2</loc>');
    // The /en/ copies Google rejected must no longer be submitted.
    expect(xml).not.toContain('/en/deal/');
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });

  it('emits no hreflang alternates for deals', () => {
    // hreflang declares translations; these copies share one German text, and
    // the page canonicalises to a single locale, so alternates would contradict it.
    const xml = dealsSitemap([{ slug: 'a-awin-1', country: 'DE', lastmod: '2026-10-01T08:00:00Z' }]);
    expect(xml).not.toContain('xhtml:link');
    expect(xml).not.toContain('hreflang');
  });

  it('uses the content-change time as lastmod, and omits it when unknown', () => {
    const xml = dealsSitemap([
      { slug: 'a-awin-1', country: 'DE', lastmod: '2026-09-14T10:30:00Z' },
      { slug: 'b-awin-2', country: 'DE', lastmod: null },
      { slug: 'c-awin-3', country: 'DE', lastmod: 'not-a-date' },
    ]);
    expect(xml).toContain('<lastmod>2026-09-14T10:30:00.000Z</lastmod>');
    expect(xml.match(/<lastmod>/g)).toHaveLength(1);
  });
});

describe('sitemapIndex', () => {
  it("stamps each chunk with its newest deal's content change", async () => {
    h.deals = [
      { slug: 'a-awin-1', country: 'DE', lastmod: '2026-09-01T00:00:00Z' },
      { slug: 'b-awin-2', country: 'DE', lastmod: '2026-09-20T00:00:00Z' },
    ];
    const xml = await sitemapIndex();
    expect(xml).toContain('<loc>https://dealradar.me/sitemaps/deals-1.xml</loc><lastmod>2026-09-20T00:00:00.000Z</lastmod>');
  });

  it('leaves a chunk undated rather than inventing "now"', async () => {
    h.deals = [{ slug: 'a-awin-1', country: 'DE', lastmod: null }];
    const xml = await sitemapIndex();
    expect(xml).toContain('<sitemap><loc>https://dealradar.me/sitemaps/deals-1.xml</loc></sitemap>');
  });
});

describe('staticSitemap', () => {
  it('keeps hreflang for pages whose copy really is translated', () => {
    const xml = staticSitemap();
    expect(xml).toContain('hreflang="de"');
    expect(xml).toContain('hreflang="x-default"');
  });
});
