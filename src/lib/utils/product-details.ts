/**
 * Synthetic product-detail data for the detailed-card modal.
 *
 * Providers expose a single image and no specs/sizes, so — until a richer feed
 * exists — we derive a small gallery, a spec table, and (for apparel) sizes
 * deterministically from the deal's stable `productId`, matching the rest of
 * the app's seeded-mock approach. Swap these for real data when available.
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

const pick = <T>(arr: T[], r: () => number): T => arr[Math.floor(r() * arr.length)];

/** Main image + a few seeded variants for the gallery. */
export function productGallery(deal: NormalizedDeal): string[] {
  const seed = encodeURIComponent(deal.productId);
  const variants = [1, 2, 3].map((n) => `https://picsum.photos/seed/${seed}-${n}/600/450`);
  return [deal.imageUrl, ...variants].filter((u): u is string => Boolean(u));
}

export interface Spec {
  label: string;
  value: string;
}

/** Stable synthetic model code — shown on the card and in the spec table. */
export function productModel(deal: NormalizedDeal): string {
  const r = seeded(`${deal.productId}:model`);
  const prefix = (deal.brand ?? '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'DR';
  return `${prefix}-${Math.floor(r() * 9000) + 1000}`;
}

export function productSpecs(deal: NormalizedDeal): Spec[] {
  const r = seeded(`${deal.productId}:spec`);
  const colors = ['Black', 'White', 'Silver', 'Graphite', 'Blue', 'Green', 'Red'];
  const warranties = ['1 year', '2 years', '3 years'];
  const origins = ['Germany', 'China', 'Poland', 'Vietnam', 'Czechia'];

  const specs: Spec[] = [];
  if (deal.brand) specs.push({ label: 'Brand', value: deal.brand });
  specs.push({ label: 'Model', value: productModel(deal) });
  specs.push({ label: 'Color', value: pick(colors, r) });
  specs.push({ label: 'Condition', value: 'New' });
  specs.push({ label: 'Warranty', value: pick(warranties, r) });
  specs.push({ label: 'Weight', value: `${(0.3 + r() * 6).toFixed(1)} kg` });
  specs.push({ label: 'Availability', value: `${Math.floor(r() * 40) + 5} in stock` });

  // Electronics carry a long spec sheet — realistic, and it exercises the
  // scrollable details section in the detailed card.
  if (deal.category === 'electronics') {
    specs.push({ label: 'Screen size', value: `${pick([40, 43, 50, 55, 65, 75], r)}"` });
    specs.push({ label: 'Resolution', value: pick(['Full HD', '4K UHD', '8K UHD'], r) });
    specs.push({ label: 'Refresh rate', value: pick(['60 Hz', '120 Hz', '144 Hz'], r) });
    specs.push({ label: 'Panel', value: pick(['IPS', 'OLED', 'QLED', 'VA'], r) });
    specs.push({ label: 'HDR', value: pick(['HDR10', 'HDR10+', 'Dolby Vision'], r) });
    specs.push({ label: 'Connectivity', value: pick(['Wi-Fi 5', 'Wi-Fi 6', 'Wi-Fi 6E'], r) });
    specs.push({ label: 'Bluetooth', value: pick(['5.0', '5.2', '5.3'], r) });
    specs.push({ label: 'HDMI ports', value: String(pick([2, 3, 4], r)) });
    specs.push({ label: 'USB ports', value: String(pick([1, 2, 3], r)) });
    specs.push({ label: 'Battery life', value: `${pick([8, 10, 12, 20], r)} h` });
    specs.push({ label: 'Power', value: `${pick([45, 65, 90, 120], r)} W` });
    specs.push({ label: 'Energy class', value: pick(['A', 'B', 'C', 'D'], r) });
    specs.push({ label: 'Operating system', value: pick(['Android', 'webOS', 'Tizen', 'Proprietary'], r) });
    specs.push({ label: 'Voice control', value: pick(['Alexa', 'Google', 'Both'], r) });
    specs.push({ label: 'Smart features', value: pick(['Yes', 'Yes', 'No'], r) });
  }

  specs.push({ label: 'Material', value: pick(['Aluminium', 'Plastic', 'Steel', 'Composite'], r) });
  specs.push({ label: 'Dimensions', value: `${pick([20, 30, 40, 60], r)}×${pick([15, 20, 30], r)}×${pick([4, 8, 12], r)} cm` });
  specs.push({ label: 'Country of origin', value: pick(origins, r) });
  specs.push({ label: 'SKU', value: `SKU-${Math.floor(r() * 900000) + 100000}` });
  specs.push({ label: 'Returns', value: '30-day free returns' });
  specs.push({ label: 'Shipping', value: pick(['Free', '€2.99', '€4.99'], r) });
  return specs;
}

export interface SizeOption {
  size: string;
  available: boolean;
}

const SHOE_RE = /\b(shoes?|sneakers?|boots?|trainers?|cleats?|footwear)\b/i;
const APPAREL_RE = /\b(shirt|t-?shirt|tee|jacket|coat|overcoat|vest|dress|trousers?|jeans|denim|sweater|hoodie|pullover|skirt|shorts|leggings|blazer|cardigan|jumper)\b/i;

/**
 * Sizes for the detailed card. Footwear gets numeric (EU) sizes, apparel gets
 * letter sizes, everything else returns null (no size selector). Each size
 * carries an `available` flag — the modal greys out + strikes through the
 * unavailable ones. When a real product feed exists, map its size/stock data
 * to this same shape and the UI stays identical.
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
