/**
 * Product-detail helpers for the detailed-card modal.
 *
 * Real data — gallery images and the description — comes from the provider feed
 * and is carried on the deal (`gallery`, `description`). We no longer fabricate a
 * spec table, fake "also available at" offers, or a synthetic model code: a
 * single feed has one price per product and no structured specs, so inventing
 * them would mislead.
 */
import type { NormalizedDeal } from '../providers/types';

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

/** Real product images for the gallery: the feed's gallery, else the card image. */
export function productGallery(deal: NormalizedDeal): string[] {
  if (deal.gallery && deal.gallery.length) return deal.gallery;
  return deal.imageUrl ? [deal.imageUrl] : [];
}

export interface SizeOption {
  size: string;
  available: boolean;
}

const SHOE_RE = /\b(shoes?|sneakers?|boots?|trainers?|cleats?|footwear)\b/i;
const APPAREL_RE = /\b(shirt|t-?shirt|tee|jacket|coat|overcoat|vest|dress|trousers?|jeans|denim|sweater|hoodie|pullover|skirt|shorts|leggings|blazer|cardigan|jumper)\b/i;

/**
 * Sizes for the detailed card. Footwear gets numeric (EU) sizes, apparel gets
 * letter sizes, everything else returns null (no size selector). Still synthetic
 * availability until a feed ships real size/stock data — map it to this shape.
 */
export function productSizes(deal: NormalizedDeal): SizeOption[] | null {
  const name = deal.productName;
  let range: string[];
  if (SHOE_RE.test(name)) {
    range = ['39', '40', '41', '42', '43', '44', '45', '46'];
  } else if (APPAREL_RE.test(name)) {
    range = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  } else {
    return null;
  }

  const r = seeded(`${deal.productId}:size`);
  let opts = range.map((size) => ({ size, available: r() > 0.4 }));
  // Never let a product look fully sold out: ensure at least two are available.
  if (opts.filter((o) => o.available).length < 2) {
    opts = opts.map((o, i) => (i < 2 ? { ...o, available: true } : o));
  }
  return opts;
}
