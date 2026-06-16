/**
 * Price-window derivation for the per-deal heat bar.
 *
 * Providers expose only a current `salePrice` and a reference `originalPrice`,
 * not a real time series. Until a price-history store exists, we derive a
 * deterministic 3-month [low, high] window from the deal's stable `productId`
 * so the bar is stable across reloads (same seeded approach as the mock data).
 *
 * Semantics: `low` is the cheapest the item has been (green end), `high` the
 * dearest (red end), and `current` (today's sale price) sits between them.
 */
import type { NormalizedDeal } from '../providers/types';

export interface PriceWindow {
  low: number;
  high: number;
  current: number;
  /** Today's position in the window, 0 (= low) … 1 (= high). */
  position: number;
}

/** Deterministic pseudo-random in [0,1) from a string seed (FNV-1a based). */
function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h = Math.imul(h ^ (h >>> 13), 3266489917);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceWindow(deal: NormalizedDeal): PriceWindow {
  const rnd = seeded(deal.productId);
  const current = deal.salePrice;

  // 3-month high anchors to the pre-discount price (occasionally a touch above).
  const high = Math.max(deal.originalPrice, current) * (1 + rnd() * 0.06);
  // 3-month low sits a little below today's price (1–22% under it).
  const low = current * (1 - (0.01 + rnd() * 0.21));

  const span = high - low;
  const position = span > 0 ? Math.min(1, Math.max(0, (current - low) / span)) : 0;

  return { low: round2(low), high: round2(high), current, position };
}
