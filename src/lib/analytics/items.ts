import type { NormalizedDeal } from '@/lib/providers/types';

/**
 * GA4 ecommerce `items[]` entry for a deal, shared by CTA markup
 * (data-analytics-item), view_item and view_item_list — one shape everywhere
 * so CTR funnels (view → select) join cleanly per product/merchant/network.
 * item_brand deliberately carries the MERCHANT (shop) — the affiliate KPI is
 * "which shop/network converts", and GA4's brand dimension is the natural
 * built-in slot for it. currency is NOT an item field (GA4 reads currency at
 * event level only) — pass it alongside where an event needs it.
 */
export interface GaItem {
  item_id: string;
  item_name: string;
  item_brand: string;
  item_category: string;
  price: number;
  affiliate_network: string;
  [key: string]: unknown;
}

export function gaItem(deal: NormalizedDeal): GaItem {
  return {
    item_id: deal.productId,
    // GA4 truncates long values server-side anyway; keep payloads lean.
    item_name: deal.productName.slice(0, 100),
    item_brand: deal.shopName,
    item_category: deal.category,
    price: deal.salePrice,
    affiliate_network: deal.source,
  };
}

/** The JSON payload for data-analytics-item: item fields + event-level currency. */
export function gaItemAttr(deal: NormalizedDeal): string {
  return JSON.stringify({ ...gaItem(deal), currency: deal.currency });
}
