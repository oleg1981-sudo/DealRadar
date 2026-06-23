/**
 * Price-window derivation for the per-deal heat bar.
 *
 * We only show prices we actually know. A provider gives a current `salePrice`
 * and a reference `originalPrice` (the regular/struck price) — that's it. So the
 * graph is an HONEST straight line from the regular price down to today's price,
 * NOT a fabricated walk. `low` = the lowest price we know (today's sale price),
 * `high` = the regular price.
 *
 * When the daily refresh starts recording real snapshots (a price_history
 * table), feed that recorded series into `priceSeries()` and the line will
 * develop genuine shape over time — no other change needed here.
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

export function priceWindow(deal: NormalizedDeal): PriceWindow {
  const current = round2(deal.salePrice);
  const high = round2(Math.max(deal.originalPrice, deal.salePrice));
  const low = current; // the lowest price we actually know is today's sale price
  const span = high - low;
  const position = span > 0 ? Math.min(1, Math.max(0, (current - low) / span)) : 0;
  return { low, high, current, position };
}

/**
 * The real known prices as a series (oldest → newest): the regular price, then
 * today's sale price — a straight line. Returns two equal points (flat) when
 * there's no discount. Replace with the recorded daily series once stored.
 */
export function priceSeries(deal: NormalizedDeal): number[] {
  const current = round2(deal.salePrice);
  const high = round2(Math.max(deal.originalPrice, deal.salePrice));
  return high > current ? [high, current] : [current, current];
}
