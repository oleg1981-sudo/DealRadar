/**
 * Deal Index — a 0–10 buy-timing score for a deal card.
 *
 * Two signals, blended:
 *   1. HISTORY (weight 0.6): the percentile of TODAY's price inside the last
 *      ~3 months of recorded daily prices, inverted — 10 = cheapest the window
 *      has seen, 0 = the most expensive, 5 = the usual price (flat series).
 *      Percentile (not min/max range position) on purpose: one spike day can't
 *      drag the whole scale, and the number reads as "how often was it cheaper
 *      than today" — an honest claim backed by our own snapshots.
 *   2. DISCOUNT (weight 0.4): the feed/verifier discount vs the regular price,
 *      mapped linearly (83% off → 8.3). A product parked at a deep, stable
 *      discount is still a good buy even though its history is flat — history
 *      alone would damn it to an amber 5.
 *
 * Like the cardiogram, the history half is derived ONLY from measured
 * snapshots; without enough recorded days there is no score, never a
 * fabricated one (the discount alone is already told by the discount badge).
 */

/** Fewer recorded days than this → no score (a 2-day-old product has no
 *  meaningful "best time to buy" yet). */
export const DEAL_INDEX_MIN_DAYS = 5;

/** Blend weights — history dominates, discount corroborates. */
const W_HISTORY = 0.6;
const W_DISCOUNT = 0.4;

/**
 * Same-price tolerance: cent-level jitter is noise, not a buying signal.
 * A €6.94 day must not make €6.95 "more expensive than usual" (the Contour
 * next case: 4 one-cent days dragged an effectively flat price to 3.6).
 * Two prices within max(2 cents, 0.5%) count as the same price.
 */
const priceTolerance = (price: number) => Math.max(0.02, price * 0.005);

/**
 * The history half on its own: inverted percentile of `currentPrice` in the
 * recorded window. 0–10 (one decimal), or null when unscorable.
 * @param history recorded daily sale prices from the window (order irrelevant).
 */
export function historyPercentileScore(history: number[], currentPrice: number): number | null {
  if (!(currentPrice > 0)) return null;
  const prices = history.filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < DEAL_INDEX_MIN_DAYS) return null;
  const tol = priceTolerance(currentPrice);
  let below = 0;
  let equal = 0;
  for (const p of prices) {
    if (p < currentPrice - tol) below++;
    else if (p <= currentPrice + tol) equal++;
  }
  // Days cheaper than today count fully against the score, same-price days
  // half — so an all-time low reads ~10, an all-time high ~0, flat exactly 5.
  const cheaperFraction = (below + equal / 2) / prices.length;
  return Math.round(10 * (1 - cheaperFraction) * 10) / 10;
}

export interface LastDeal {
  /** The last recorded deal price meaningfully below today's. */
  price: number;
  /** UTC day `YYYY-MM-DD` it was last recorded. */
  day: string;
}

/**
 * The most recent recorded day whose price sat meaningfully below today's —
 * the "last time this was a deal" context for regular-price rows (2026-08-02
 * policy). Null when the recorded window never saw a lower price (a deal that
 * ended before tracking began cannot be honestly reconstructed).
 * Guard: prices under 15% of today's are currency-unit artifacts (a known
 * ÷100 glitch day exists in old snapshots), not deals — ignored.
 */
export function findLastDeal(
  points: Array<{ day: string; salePrice: number }>,
  currentPrice: number,
): LastDeal | null {
  if (!(currentPrice > 0)) return null;
  const tol = priceTolerance(currentPrice);
  let best: LastDeal | null = null;
  for (const p of points) {
    if (!(p.salePrice > 0) || p.salePrice >= currentPrice - tol) continue;
    if (p.salePrice < currentPrice * 0.15) continue;
    if (!best || p.day > best.day) best = { price: p.salePrice, day: p.day };
  }
  return best;
}

/**
 * The published Deal Index: history percentile blended with discount depth.
 * @param discountPercent the deal's verified discount, 0–100.
 * @returns 0–10 rounded to one decimal, or null when history is too thin.
 */
export function computeDealIndex(
  history: number[],
  currentPrice: number,
  discountPercent: number,
): number | null {
  const historyScore = historyPercentileScore(history, currentPrice);
  if (historyScore == null) return null;
  const discountScore = Math.min(10, Math.max(0, discountPercent) / 10);
  const score = W_HISTORY * historyScore + W_DISCOUNT * discountScore;
  return Math.round(score * 10) / 10;
}
