import { describe, it, expect } from 'vitest';
import { dedupeDeals } from './registry';
import type { NormalizedDeal } from './types';

function mk(p: Partial<NormalizedDeal>): NormalizedDeal {
  return {
    productId: p.productId ?? 'x:1',
    productName: p.productName ?? 'Sample Product',
    shopName: p.shopName ?? 'Shop',
    shopUrl: 'https://shop.example/p',
    shopLogoUrl: null,
    originalPrice: p.originalPrice ?? 100,
    salePrice: p.salePrice ?? 50,
    discountPercent: p.discountPercent ?? 50,
    currency: 'EUR',
    category: 'electronics',
    brand: null,
    imageUrl: null,
    country: 'DE',
    city: null,
    isSponsored: true,
    source: p.source ?? 'kelkoo',
    lastUpdated: '2026-06-28T00:00:00.000Z',
    eanCode: p.eanCode ?? null,
    ...p,
  };
}

describe('dedupeDeals', () => {
  it('groups by EAN and keeps the lowest sale price', () => {
    const out = dedupeDeals(
      [
        mk({ productId: 'kelkoo:1', eanCode: '40012345', salePrice: 60, source: 'kelkoo' }),
        mk({ productId: 'strackr:9', eanCode: '40012345', salePrice: 55, source: 'strackr' }),
      ],
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].productId).toBe('strackr:9');
  });

  it('breaks an exact price tie by provider priority (lower number wins)', () => {
    const out = dedupeDeals(
      [
        // strackr (priority 25) seen first, kelkoo (priority 10) second, equal price.
        mk({ productId: 'strackr:9', eanCode: '111', salePrice: 50, source: 'strackr' }),
        mk({ productId: 'kelkoo:1', eanCode: '111', salePrice: 50, source: 'kelkoo' }),
      ],
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('kelkoo');
  });

  it('keeps distinct shops when no EAN (name+shop key)', () => {
    const out = dedupeDeals(
      [
        mk({ productId: 'a:1', productName: 'Widget Pro', shopName: 'ShopA' }),
        mk({ productId: 'b:1', productName: 'Widget Pro', shopName: 'ShopB' }),
      ],
      10,
    );
    expect(out).toHaveLength(2);
  });

  it('collapses case/whitespace variants of name+shop without EAN, keeping cheaper', () => {
    // 'Shop A' and 'shop  a' both slugify to 'shop-a'; names both to 'widget-pro'.
    const out = dedupeDeals(
      [
        mk({ productId: 'a:1', productName: 'Widget Pro', shopName: 'Shop A', salePrice: 80 }),
        mk({ productId: 'b:1', productName: 'widget   pro', shopName: 'shop  a', salePrice: 70 }),
      ],
      10,
    );
    expect(out).toHaveLength(1);
    expect(out[0].salePrice).toBe(70);
  });

  it('sorts by discount desc and caps at the limit', () => {
    const out = dedupeDeals(
      [
        mk({ productId: '1', eanCode: '1', discountPercent: 10 }),
        mk({ productId: '2', eanCode: '2', discountPercent: 70 }),
        mk({ productId: '3', eanCode: '3', discountPercent: 40 }),
      ],
      2,
    );
    expect(out.map((d) => d.discountPercent)).toEqual([70, 40]);
  });
});
