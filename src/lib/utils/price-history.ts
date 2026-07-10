/**
 * Price-window/series derivation for the per-deal cardiogram.
 *
 * We only show prices we actually know. Without recorded history, a provider
 * gives a current `salePrice` and a reference `originalPrice` — so the graph is
 * an HONEST straight line from the regular price down to today's price, NOT a
 * fabricated walk. Once the daily snapshot job has recorded real prices
 * (`price_history` table, served by /api/price-history), pass those recorded
 * sale prices in and the same line becomes a genuine curve.
 */
import type { NormalizedDeal } from '../providers/types';

export interface PriceWindow {
  low: number;
  high: number;
  current: number;
  /** Today's position in the window, 0 (= low) … 1 (= high). */
  position: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param history recorded daily sale prices, oldest → newest (may be empty).
 * The window spans everything we know: recorded lows may sit BELOW today's
 * price, so "low" is no longer always the current price.
 */
export function priceWindow(deal: NormalizedDeal, history: number[] = []): PriceWindow {
  const current = round2(deal.salePrice);
  const high = round2(Math.max(deal.originalPrice, current, ...history));
  const low = round2(Math.min(current, ...history));
  const span = high - low;
  const position = span > 0 ? Math.min(1, Math.max(0, (current - low) / span)) : 0;
  return { low, high, current, position };
}

/**
 * The known prices as a chronological series (oldest → newest), always ending
 * at today's price. With ≥2 recorded days this is the real recorded curve;
 * otherwise it degrades to the regular price then today's price — a straight
 * line (two equal points when there's no discount).
 */
export function priceSeries(deal: NormalizedDeal, history: number[] = []): number[] {
  const current = round2(deal.salePrice);
  const pts = history.map(round2);
  if (pts.length === 0 || pts[pts.length - 1] !== current) pts.push(current);
  if (pts.length >= 2) return pts;
  const high = round2(Math.max(deal.originalPrice, current));
  return high > current ? [high, current] : [current, current];
}
