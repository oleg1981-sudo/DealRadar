import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NormalizedDeal } from '../providers/types';

// Shared capture across the hoisted mocks.
const h = vi.hoisted(() => ({
  rows: [] as any[],
  updates: [] as { id: unknown; vals: any }[],
  emails: [] as any[],
}));

vi.mock('server-only', () => ({}));
vi.mock('../email/send', () => ({
  sendEmail: vi.fn(async (msg: any) => {
    h.emails.push(msg);
    return true;
  }),
}));
vi.mock('./supabase', () => ({
  supabaseConfigured: () => true,
  supabase: () => {
    // Minimal chainable builder: select-chains resolve to { data: rows }, and an
    // update-chain ending in .eq('id', …) records the notified flip.
    const b: any = {
      _op: 'select',
      _vals: undefined,
      select() { b._op = 'select'; return b; },
      update(vals: any) { b._op = 'update'; b._vals = vals; return b; },
      in() { return b; },
      eq(col: string, val: unknown) {
        if (b._op === 'update' && col === 'id') h.updates.push({ id: val, vals: b._vals });
        return b;
      },
      then(resolve: (r: any) => void) {
        resolve(b._op === 'select' ? { data: h.rows, error: null } : { error: null });
      },
    };
    return { from: () => b };
  },
}));

import { notifyPriceDrops } from './alerts.repo';

function deal(productId: string, salePrice: number): NormalizedDeal {
  return {
    productId,
    productName: `Product ${productId}`,
    shopName: 'TestShop',
    shopUrl: 'https://shop.example/p',
    shopLogoUrl: null,
    originalPrice: 200,
    salePrice,
    discountPercent: 10,
    currency: 'EUR',
    category: 'electronics',
    brand: null,
    imageUrl: null,
    gallery: null,
    description: null,
    merchantUrl: null,
    country: 'DE',
    city: null,
    isSponsored: false,
    source: 'awin',
    lastUpdated: '2026-07-10T00:00:00.000Z',
    slug: `product-${productId}`,
    eanCode: null,
    upcCode: null,
    mpn: null,
    modelNumber: null,
    historicalLowPrice: null,
    merchantId: null,
    affiliateSubid: null,
  } as NormalizedDeal;
}

beforeEach(() => {
  h.rows.length = 0;
  h.updates.length = 0;
  h.emails.length = 0;
});

describe('notifyPriceDrops', () => {
  it('emails exactly once for a qualifying drop and marks that alert notified', async () => {
    h.rows.push({ id: 'a1', email: 'a@example.com', target_price: 100, product_id: 'p1', locale: 'de' });
    const sent = await notifyPriceDrops([deal('p1', 80)]); // 80 < 100 → qualifies
    expect(sent).toBe(1);
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0].to).toBe('a@example.com');
    expect(h.emails[0].subject).toContain('Product p1');
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0].id).toBe('a1');
    expect(h.updates[0].vals.notified).toBe(true);
  });

  it('does NOT email when the sale price is at or above the target (strict threshold)', async () => {
    h.rows.push({ id: 'b1', email: 'b@example.com', target_price: 100, product_id: 'p2', locale: 'en' });
    const sent = await notifyPriceDrops([deal('p2', 100)]); // 100 is NOT < 100
    expect(sent).toBe(0);
    expect(h.emails).toHaveLength(0);
    expect(h.updates).toHaveLength(0);
  });

  it('builds the unsubscribe link on the real prod host, never the dead dealradar.eu fallback', async () => {
    h.rows.push({ id: 'c1', email: 'c@example.com', target_price: 100, product_id: 'p3', locale: 'de' });
    await notifyPriceDrops([deal('p3', 50)]);
    const listUnsub = h.emails[0].headers['List-Unsubscribe'] as string;
    expect(listUnsub).toContain('dealradar.me');
    expect(h.emails[0].html).not.toContain('dealradar.eu');
    expect(listUnsub).not.toContain('dealradar.eu');
  });

  it('is a no-op for an empty deal set', async () => {
    const sent = await notifyPriceDrops([]);
    expect(sent).toBe(0);
    expect(h.emails).toHaveLength(0);
  });
});
