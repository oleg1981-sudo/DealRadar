import { describe, it, expect } from 'vitest';
import { buildSubId, decodeSubId, decorateAffiliateUrl } from './affiliate';

describe('sub-id round-trip (lossless)', () => {
  const ids = [
    'kelkoo:12345',
    'awin:abc-123.x',          // separators that the old encoder corrupted
    'tradedoubler:SKU_99',     // underscore inside the id
    'strackr:Größe-42',        // non-ASCII
    'dummyjson:de:678',        // multiple colons
  ];

  for (const productId of ids) {
    it(`recovers ${productId} exactly`, () => {
      const sub = buildSubId('DE', 'home-garden', productId);
      const decoded = decodeSubId(sub);
      expect(decoded).not.toBeNull();
      expect(decoded!.productId).toBe(productId);
      expect(decoded!.country).toBe('DE');
      expect(decoded!.category).toBe('home-garden');
    });
  }

  it('encodes an absent productId as null', () => {
    const decoded = decodeSubId(buildSubId('FR', 'electronics'));
    expect(decoded?.productId).toBeNull();
  });

  it('returns null for foreign / malformed sub-ids', () => {
    expect(decodeSubId('')).toBeNull();
    expect(decodeSubId('someoneelse_DE_x_6b')).toBeNull();
    expect(decodeSubId('dealradar_DE_x')).toBeNull(); // too few fields
    expect(decodeSubId('dealradar_DE_x_zz')).toBeNull(); // non-hex tail
  });
});

describe('decorateAffiliateUrl', () => {
  it('appends the network sub-id param for a known source', () => {
    const out = decorateAffiliateUrl({
      shopUrl: 'https://shop.example/p/1',
      source: 'awin',
      country: 'DE',
      category: 'electronics',
      productId: 'awin:42',
    });
    const u = new URL(out);
    expect(u.searchParams.has('clickref')).toBe(true);
    // The decorated sub-id round-trips back to the original productId.
    expect(decodeSubId(u.searchParams.get('clickref')!)?.productId).toBe('awin:42');
  });

  it('leaves the URL untouched for an unknown source', () => {
    const url = 'https://shop.example/p/1';
    expect(decorateAffiliateUrl({
      shopUrl: url,
      source: 'unknown-net',
      country: 'DE',
      category: 'electronics',
      productId: 'x:1',
    })).toBe(url);
  });

  it('returns the input unchanged when the URL is invalid', () => {
    expect(decorateAffiliateUrl({ shopUrl: 'not a url', source: 'awin' })).toBe('not a url');
  });
});
