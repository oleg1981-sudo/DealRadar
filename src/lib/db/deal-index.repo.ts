/**
 * Deal-Index enrichment — batch-reads `price_history` for a page of deals and
 * stamps each with its 0–10 buy-timing score (see lib/utils/deal-index.ts).
 *
 * Decorative data: any failure (no Supabase in dev-mock mode, a transient DB
 * error) degrades to "no badge", never to a broken grid. The score is derived
 * per render and NEVER persisted — toRow() must not learn a deal_index key.
 */
import 'server-only';
import { supabase, supabaseConfigured } from './supabase';
import { computeDealIndex, findLastDeal } from '../utils/deal-index';
import type { NormalizedDeal } from '../providers/types';

/** How far back the score looks — matches the card's "last 3 months" framing. */
const WINDOW_DAYS = 90;

/** PostgREST caps reads at db-max-rows (1000) WITHOUT erroring; ≤10 products
 *  × ≤91 daily rows keeps every chunk safely under the cap. */
const CHUNK = 10;

/** Returns the same deals with `dealIndex` set where history allows a score. */
export async function withDealIndexes(deals: NormalizedDeal[]): Promise<NormalizedDeal[]> {
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
      console.warn(`[deal-index.repo] history read failed (badge omitted): ${error.message}`);
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
    const points = pointsById.get(d.productId) ?? [];
    const score = computeDealIndex(points.map((p) => p.salePrice), d.salePrice, d.discountPercent);
    const lastDeal = findLastDeal(points, d.salePrice);
    if (score == null && !lastDeal) return d;
    return {
      ...d,
      ...(score != null ? { dealIndex: score } : {}),
      ...(lastDeal ? { lastDealPrice: lastDeal.price, lastDealDay: lastDeal.day } : {}),
    };
  });
}
