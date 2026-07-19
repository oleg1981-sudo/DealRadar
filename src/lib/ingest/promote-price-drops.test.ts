// Q-2/P1-7 — pure promotion decision guardrails.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decidePromotion } = require('../../../scripts/promote-price-drops.cjs');

const series = (prices: number[]) => prices.map((p, i) => ({ day: `2026-07-${String(i + 1).padStart(2, '0')}`, sale_price: p }));

describe('decidePromotion', () => {
  it('promotes a ≥10% drop against a ≥7-day baseline', () => {
    const p = decidePromotion(89.99, series([100, 100, 100, 100, 100, 100, 100]));
    expect(p).toEqual({ original: 100, discount: 10 });
  });

  it('never promotes on a thin baseline (<7 distinct days)', () => {
    expect(decidePromotion(50, series([100, 100, 100]))).toBeNull();
  });

  it('never promotes noise (<10% drop)', () => {
    expect(decidePromotion(95, series([100, 100, 100, 100, 100, 100, 100]))).toBeNull();
  });

  it('a single-day price spike can NEVER fake a deal (sustained baseline)', () => {
    // Price sat at 50 for 6 days, spiked to 60 for ONE day, now 50 again:
    // 60 is not sustained (≥3 distinct days required) → baseline stays 50 →
    // no promotion. This is the exact fake-deal vector the review caught.
    expect(decidePromotion(50, series([50, 50, 60, 50, 50, 50, 50]))).toBeNull();
    expect(decidePromotion(55, series([50, 50, 60, 50, 50, 50, 50]))).toBeNull();
  });

  it('a price sustained ≥3 days IS a valid baseline', () => {
    // 100 held for 3 days then dropped to 85 for 4 days: current 85 vs 100 = 15%.
    expect(decidePromotion(85, series([100, 100, 100, 85, 85, 85, 85]))).toEqual({ original: 100, discount: 15 });
  });

  it('threshold compares the UNROUNDED drop — 9.5% must not round up to 10%', () => {
    expect(decidePromotion(90.5, series([100, 100, 100, 100, 100, 100, 100]))).toBeNull();
  });

  it('rejects non-finite / non-positive current prices', () => {
    expect(decidePromotion(NaN, series([100, 100, 100, 100, 100, 100, 100]))).toBeNull();
    expect(decidePromotion(0, series([100, 100, 100, 100, 100, 100, 100]))).toBeNull();
  });

  it('duplicate days do not inflate the baseline depth', () => {
    const dup = [...series([100, 100, 100]), ...series([100, 100, 100])];
    expect(decidePromotion(80, dup)).toBeNull();
  });
});
