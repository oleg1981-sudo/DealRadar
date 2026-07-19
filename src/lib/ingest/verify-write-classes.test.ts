// Write-class + keep-richer contract tests [EC-21/EC-22/EC-11,
// docs/specs/pdp-full-content/2026-07-16_v1 + the M2 write-class amendment
// docs/specs/url-structure/2026-07-08_v2/amendment-2026-07-19_write-classes.md].
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import type { NormalizedDeal } from '../providers/types';

vi.mock('server-only', () => ({}));
const { toRow } = await import('../db/deals.repo');

const require = createRequire(import.meta.url);
// The verifier's main loop is gated on require.main — requiring it only loads helpers.
const verify = require('../../../scripts/verify-awin.cjs');

const deal = (over: Partial<NormalizedDeal> = {}): NormalizedDeal =>
  ({
    productId: 'awin:DE:adv1:1',
    productName: 'Test',
    shopName: 'Shop',
    shopUrl: 'https://x',
    shopLogoUrl: null,
    originalPrice: 100,
    salePrice: 50,
    discountPercent: 50,
    currency: 'EUR',
    category: 'electronics',
    brand: 'B',
    imageUrl: 'https://cdn.shopify.com/a.jpg',
    gallery: ['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg'],
    description: 'from provider',
    merchantUrl: 'https://shop.de/products/x',
    country: 'DE',
    city: null,
    isSponsored: true,
    source: 'awin',
    lastUpdated: new Date().toISOString(),
    hidden: false,
  }) as unknown as NormalizedDeal;

describe('FR-1.6 / EC-22 — provider upserts cannot clobber enriched content', () => {
  it('toRow omits gallery, description and description_html entirely', () => {
    const row = toRow(deal());
    expect('gallery' in row).toBe(false);
    expect('description' in row).toBe(false);
    expect('description_html' in row).toBe(false);
  });

  it('toRow key signature is identical for rich and thin deals (PGRST102 guard)', () => {
    const rich = Object.keys(toRow(deal())).sort();
    const thin = Object.keys(toRow(deal({ gallery: undefined, description: undefined } as never))).sort();
    expect(rich).toEqual(thin);
  });
});

describe('M2 amendment / EC-21 — write classes', () => {
  it('liveness patches bump last_updated; content patches never do', () => {
    const live = verify.patchBody({ sale_price: 9.99 }, 'liveness', false);
    expect(live.last_updated).toBeTruthy();
    const content = verify.patchBody({ description_html: '<p>x</p>' }, 'content', true);
    expect('last_updated' in content).toBe(false);
  });

  it('content-bearing patches stamp capture provenance', () => {
    const content = verify.patchBody({ gallery: ['https://a'] }, 'content', true);
    expect(content.capture_run_id).toMatch(/^verify-/);
    expect(content.last_verified).toBeTruthy();
  });
});

describe('FR-1.1 — keep-richer gallery merge', () => {
  it('grows a sparse gallery from live images, capped at 6, deduped', () => {
    const merged = verify.mergeGallery(
      { gallery: ['https://cdn.shopify.com/a.jpg'], image_url: 'https://cdn.shopify.com/a.jpg' },
      ['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg', 'https://cdn.shopify.com/c.jpg'],
    );
    expect(merged).toEqual([
      'https://cdn.shopify.com/a.jpg',
      'https://cdn.shopify.com/b.jpg',
      'https://cdn.shopify.com/c.jpg',
    ]);
  });

  it('never shrinks: returns null when live images add nothing', () => {
    const merged = verify.mergeGallery(
      { gallery: ['https://cdn.shopify.com/a.jpg', 'https://cdn.shopify.com/b.jpg'] },
      ['https://cdn.shopify.com/a.jpg'],
    );
    expect(merged).toBeNull();
  });

  it('normalizes protocol-relative Shopify image entries', () => {
    expect(verify.normalizeImages(['//cdn.shopify.com/x.jpg', { src: 'https://cdn.shopify.com/y.jpg' }, 'http://insecure/z.jpg']))
      .toEqual(['https://cdn.shopify.com/x.jpg', 'https://cdn.shopify.com/y.jpg']);
  });
});

describe('FR-3.4 / EC-11 — flushPatches retries once then commits', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a transient PostgREST failure is retried and the patch lands', async () => {
    const calls: string[] = [];
    let first = true;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(String(url));
      if (first) {
        first = false;
        return { ok: false, status: 503, text: async () => 'transient' } as Response;
      }
      return { ok: true, status: 204, text: async () => '' } as Response;
    }));
    verify._test.pending().push({ id: 'awin:DE:adv1:1', fields: { hidden: true }, klass: 'liveness', hasContent: false });
    await verify._test.flushPatches();
    expect(calls.length).toBe(2); // failed once, retried, committed
  });
});
