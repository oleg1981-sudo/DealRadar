/**
 * Deal-card enrichment — one batch read of `price_history` for a whole page of
 * cards, stamping each deal with everything derived from its recorded prices:
 *   - `dealIndex`      the 0–10 buy-timing score (see lib/utils/deal-index.ts),
 *   - `lastDealPrice`  the last recorded price below today (regular-price rows),
 *   - `priceHistory`   the chronological recorded series so a CARD draws the
 *                      SAME real cardiogram as the detail page (the flat-range
 *                      card bar was the whole reason this batch exists — reuse
 *                      it rather than re-query per card).
 *
 * Decorative data: any failure (no Supabase in dev-mock mode, a transient DB
 * error) degrades to the plain card (range bar, no badge), never a broken grid.
 * All three are derived per render and NEVER persisted — toRow() stays clean.
 */
import 'server-only';
import { supabase, supabaseConfigured } from './supabase';
import { computeDealIndex, findLastDeal } from '../utils/deal-index';
import type { NormalizedDeal } from '../providers/types';

/** How far back the score/curve looks — matches the "last 3 months" framing. */
const WINDOW_DAYS = 90;

/** PostgREST caps reads at db-max-rows (1000) WITHOUT erroring; ≤10 products
 *  × ≤91 daily rows keeps every chunk safely under the cap. */
const CHUNK = 10;

/** Returns the same deals enriched with recorded-price data where it exists. */
export async function enrichDealCards(deals: NormalizedDeal[]): Promise<NormalizedDeal[]> {
  if (!supabaseConfigured() || deals.length === 0) return deals;

  const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const ids = [...new Set(deals.map((d) => d.productId))];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));

  const pointsById = new Map<string, Array<{ day: string; salePrice: number }>>();
  await Promise.all(chunks.map(async (chunk) => {
    const { data, error } = await supabase()
      .from('price_history')
      .select('product_id, day, sale_price')
      .in('product_id', chunk)
      .gte('day', cutoff);
    if (error) {
      console.warn(`[deal-index.repo] history read failed (cards fall back to range): ${error.message}`);
      return;
    }
    for (const r of data ?? []) {
      const id = r.product_id as string;
      let arr = pointsById.get(id);
      if (!arr) pointsById.set(id, (arr = []));
      arr.push({ day: r.day as string, salePrice: Number(r.sale_price) });
    }
  }));
  if (pointsById.size === 0) return deals;

  return deals.map((d) => {
    // Chronological (oldest→newest) so the series matches priceSeries()'s and
    // the detail page's ordering; `day` is YYYY-MM-DD so string order = time.
    const points = (pointsById.get(d.productId) ?? []).slice().sort((a, b) => a.day.localeCompare(b.day));
    const prices = points.map((p) => p.salePrice);
    const score = computeDealIndex(prices, d.salePrice, d.discountPercent);
    const lastDeal = findLastDeal(points, d.salePrice);
    // Two+ recorded days → the card can plot the real curve; PriceHeatBar still
    // falls back to range mode itself if those points carry no variation.
    const priceHistory = prices.length >= 2 ? prices : null;
    if (score == null && !lastDeal && !priceHistory) return d;
    return {
      ...d,
      ...(score != null ? { dealIndex: score } : {}),
      ...(lastDeal ? { lastDealPrice: lastDeal.price, lastDealDay: lastDeal.day } : {}),
      ...(priceHistory ? { priceHistory } : {}),
    };
  });
}
