/**
 * Product-detail helpers for the deal PDP.
 *
 * Real data only — gallery images and the description come from the provider
 * feed and the live-shop verifier and are carried on the deal (`gallery`,
 * `description`, `descriptionHtml`). We do not fabricate spec tables, fake
 * "also available at" offers, synthetic model codes, or synthetic size
 * availability: a single feed has one price per product and no structured
 * specs, so inventing them would mislead (FR-PDP-6).
 */
import type { NormalizedDeal } from '../providers/types';

/**
 * Awin's productserve proxy renders a fixed 200×200 thumbnail — far too small
 * for the deal page hero — but its `url` query param embeds the ORIGINAL
 * merchant image (as `ssl:cdn.shopify.com/…`). Swap the proxy for the original
 * so even feeds that ship nothing else (e.g. BlazeVideo) get full resolution.
 * Returns the input unchanged when it isn't a productserve URL or has no
 * extractable original.
 */
export function unproxyImage(url: string): string {
  if (!/(^|\.)productserve\.com\//i.test(url)) return url;
  try {
    const inner = new URL(url).searchParams.get('url');
    if (!inner) return url;
    const original = /^https?:\/\//i.test(inner) ? inner : `https://${inner.replace(/^ssl:/i, '')}`;
    return new URL(original).protocol === 'https:' ? original : url;
  } catch {
    return url;
  }
}

/** Real product images for the gallery: the feed's gallery, else the card
 *  image — proxies swapped for their full-res originals, deduped. */
export function productGallery(deal: NormalizedDeal): string[] {
  const raw = deal.gallery && deal.gallery.length ? deal.gallery : deal.imageUrl ? [deal.imageUrl] : [];
  return [...new Set(raw.map(unproxyImage))];
}
