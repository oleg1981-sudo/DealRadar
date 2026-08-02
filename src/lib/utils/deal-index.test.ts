import { describe, it, expect } from 'vitest';
import { computeDealIndex, historyPercentileScore, findLastDeal, DEAL_INDEX_MIN_DAYS } from './deal-index';

describe('historyPercentileScore', () => {
  it('needs at least the minimum recorded days — never scores thin history', () => {
    expect(historyPercentileScore([], 10)).toBeNull();
    expect(historyPercentileScore(Array(DEAL_INDEX_MIN_DAYS - 1).fill(10), 10)).toBeNull();
    expect(historyPercentileScore(Array(DEAL_INDEX_MIN_DAYS).fill(10), 10)).not.toBeNull();
  });

  it('scores a flat series exactly 5 — neither a good nor a bad time', () => {
    expect(historyPercentileScore(Array(30).fill(19.99), 19.99)).toBe(5);
  });

  it('scores an all-window low near 10 and an all-window high near 0', () => {
    const window = Array.from({ length: 90 }, (_, i) => 50 + (i % 10)); // 50..59
    expect(historyPercentileScore(window, 40)!).toBe(10);   // cheaper than every day
    expect(historyPercentileScore(window, 99)!).toBe(0);    // pricier than every day
  });

  it('reads as the inverted percentile of today inside the window', () => {
    // 10 days at 10€, 10 days at 20€, today 15€ → half the window was cheaper → 5.
    const window = [...Array(10).fill(10), ...Array(10).fill(20)];
    expect(historyPercentileScore(window, 15)).toBe(5);
    // 15 of 20 days cheaper than 25€ → 10 * (1 - 15/20) = 2.5.
    const skewed = [...Array(15).fill(10), ...Array(5).fill(30)];
    expect(historyPercentileScore(skewed, 25)).toBe(2.5);
  });

  it('is robust against one outlier spike (percentile, not min/max range)', () => {
    // 89 days at 100€, one flash-sale day at 1€, today 100€: range-position
    // would call today terrible (~0); percentile says it is the usual price.
    const window = [...Array(89).fill(100), 1];
    expect(historyPercentileScore(window, 100)!).toBeGreaterThanOrEqual(4.9);
  });

  it('treats cent-level jitter as the same price (Contour next regression)', () => {
    // 10 days at 6.95€, 4 days at 6.94€, today 6.95€ — effectively flat, so 5,
    // not "cheaper on 4 of 14 days" (which read as a misleading 3.6).
    const window = [...Array(10).fill(6.95), ...Array(4).fill(6.94)];
    expect(historyPercentileScore(window, 6.95)).toBe(5);
    // A real drop still counts: 50 cents on a ~7€ product is beyond tolerance.
    expect(historyPercentileScore(window, 6.45)).toBe(10);
  });

  it('ignores junk rows and rejects a non-positive current price', () => {
    expect(historyPercentileScore([0, -5, NaN, Infinity, 10, 10, 10, 10, 10], 10)).toBe(5);
    expect(historyPercentileScore(Array(30).fill(10), 0)).toBeNull();
  });
});

describe('computeDealIndex (history 0.6 + discount 0.4 blend)', () => {
  it('lifts a deep stable discount above the flat-history amber 5', () => {
    // The Contour next Set case: flat ~6.95€ history, 83% off the 39.75€
    // regular price → 0.6·5 + 0.4·8.3 = 6.3, a green-ish "good time".
    const window = [...Array(10).fill(6.95), ...Array(4).fill(6.94)];
    expect(computeDealIndex(window, 6.95, 83)).toBe(6.3);
  });

  it('keeps zero-discount flat pricing below neutral', () => {
    expect(computeDealIndex(Array(30).fill(19.99), 19.99, 0)).toBe(3);
  });

  it('scores near 10 only when both signals agree', () => {
    const window = Array.from({ length: 90 }, (_, i) => 50 + (i % 10));
    expect(computeDealIndex(window, 40, 90)).toBe(9.6);  // window low + 90% off
    expect(computeDealIndex(window, 99, 90)).toBe(3.6);  // deep discount can't rescue a window high
  });

  it('finds the most recent genuinely lower recorded price (last deal)', () => {
    const pts = [
      { day: '2026-07-20', salePrice: 89.99 },
      { day: '2026-07-24', salePrice: 79.99 },   // the deal
      { day: '2026-07-25', salePrice: 79.99 },   // later deal day wins
      { day: '2026-07-28', salePrice: 99.99 },
    ];
    expect(findLastDeal(pts, 99.99)).toEqual({ price: 79.99, day: '2026-07-25' });
  });

  it('reports no last deal for flat history or when only cent-jitter separates prices', () => {
    expect(findLastDeal([{ day: '2026-07-20', salePrice: 19.99 }], 19.99)).toBeNull();
    expect(findLastDeal([{ day: '2026-07-20', salePrice: 6.94 }], 6.95)).toBeNull();
  });

  it('ignores currency-glitch artifacts (the ÷100 snapshot day)', () => {
    // Real corpus case: a 33.99€ product with a 0.34€ "low" — a unit bug, not a deal.
    expect(findLastDeal([{ day: '2026-07-21', salePrice: 0.34 }], 33.99)).toBeNull();
  });

  it('clamps out-of-range discounts and still requires history', () => {
    expect(computeDealIndex(Array(30).fill(10), 10, 250)).toBe(7);   // discount capped at 10
    expect(computeDealIndex(Array(30).fill(10), 10, -50)).toBe(3);   // negative → 0
    expect(computeDealIndex(Array(DEAL_INDEX_MIN_DAYS - 1).fill(10), 10, 95)).toBeNull();
  });
});
