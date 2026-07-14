'use client';

/**
 * Impression trackers — the denominator of every CTR metric. gaEvent drops
 * events without consent and buffers during the tag-load race (see gtag.ts),
 * so these fire unconditionally. The last-fired SIGNATURE (not a boolean)
 * guards re-firing: App Router preserves component instances across
 * same-segment navigations (deal/a → deal/b, ?q=a → ?q=b), where a new
 * impression MUST fire — while StrictMode's double-effect (same signature)
 * stays deduped.
 */
import { useEffect, useRef } from 'react';
import { gaEvent } from '@/lib/analytics/gtag';
import type { GaItem } from '@/lib/analytics/items';

/** PDP impression: view_item (pairs with select_item → per-product CTR). */
export function TrackViewItem({ item, currency }: { item: GaItem; currency: string }) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (last.current === item.item_id) return;
    last.current = item.item_id;
    gaEvent('view_item', { currency, value: item.price, items: [item] });
  }, [item, currency]);
  return null;
}

/** List impression: view_item_list (pairs with select_item's item_list_name). */
export function TrackViewItemList({ listName, items }: { listName: string; items: GaItem[] }) {
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (items.length === 0) return;
    const signature = `${listName}:${items.length}:${items[0]?.item_id}:${items[items.length - 1]?.item_id}`;
    if (last.current === signature) return;
    last.current = signature;
    gaEvent('view_item_list', { item_list_name: listName, items });
  }, [listName, items]);
  return null;
}
