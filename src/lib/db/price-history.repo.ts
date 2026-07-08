/**
 * Price-history repository — the only module that talks to the `price_history`
 * table. Rows are written by scripts/snapshot-prices.cjs (one per product per
 * UTC day, verified price winning the day); this reads them back for the
 * per-deal cardiogram.
 *
 * Dev-mode behaviour matches deals.repo: without Supabase configured there is
 * simply no history, and the UI falls back to its honest two-point line.
 */
import 'server-only';
import { supabase, supabaseConfigured } from './supabase';

export interface PricePoint {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  salePrice: number;
  originalPrice: number;
}

/** Recorded daily prices for one product, oldest → newest, capped at `days`. */
export async function queryPriceHistory(productId: string, days = 90): Promise<PricePoint[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase()
    .from('price_history')
    .select('day, sale_price, original_price')
    .eq('product_id', productId)
    .order('day', { ascending: false })
    .limit(days);
  if (error) throw new Error(`[price-history.repo] query failed: ${error.message}`);
  return (data ?? [])
    .reverse()
    .map((r) => ({
      day: r.day as string,
      salePrice: Number(r.sale_price),
      originalPrice: Number(r.original_price),
    }));
}
