/**
 * Shared realistic fixture generator for mock providers.
 * Deterministic per (country, category) so dev UX is stable across reloads.
 */
import {
  CATEGORY_SLUGS,
  type CategorySlug,
  type CountryCode,
  type DealQuery,
  type NormalizedDeal,
  computeDiscountPercent,
} from './types';
import { queryTokens } from '../utils/search-tokens';

const PRODUCTS: Record<CategorySlug, { names: string[]; brands: string[]; base: [number, number] }> = {
  electronics: {
    names: ['4K OLED TV 55"', 'Noise-Cancelling Headphones', 'Robot Vacuum X20', 'Smartphone Pro 256GB', 'Gaming Laptop RTX', 'Smartwatch Series 9', 'Bluetooth Speaker Mini', 'Air Fryer XL 5.5L'],
    brands: ['Samsung', 'Sony', 'Philips', 'Bosch', 'Xiaomi', 'LG'],
    base: [79, 1899],
  },
  fashion: {
    names: ['Running Sneakers', 'Wool Overcoat', 'Denim Jacket', 'Leather Boots', 'Linen Shirt', 'Puffer Vest', 'Crossbody Bag', 'Cashmere Scarf'],
    brands: ['Adidas', 'Zara', 'H&M', 'Levi\u2019s', 'Mango', 'Nike'],
    base: [19, 349],
  },
  'home-garden': {
    names: ['Cordless Drill 18V', 'Memory Foam Mattress', 'Espresso Machine', 'Garden Lounge Set', 'LED Floor Lamp', 'Knife Block Set', 'Bed Linen 200x200', 'Smart Thermostat'],
    brands: ['IKEA', 'Bosch', 'DeLonghi', 'Tefal', 'Gardena', 'Brabantia'],
    base: [24, 899],
  },
  sports: {
    names: ['Carbon Road Bike', 'Yoga Mat Pro', 'Adjustable Dumbbells 24kg', 'Trail Running Shoes', 'Tennis Racket Tour', 'Ski Helmet', 'Fitness Tracker Band', 'Camping Tent 4P'],
    brands: ['Decathlon', 'Nike', 'Salomon', 'Wilson', 'Garmin', 'Atomic'],
    base: [15, 1499],
  },
  beauty: {
    names: ['Hyaluronic Serum 30ml', 'Hair Dryer Ionic', 'Eau de Parfum 100ml', 'Vitamin C Cream', 'Electric Toothbrush', 'Makeup Palette 24', 'Beard Trimmer Pro', 'Sunscreen SPF50 Trio'],
    brands: ['L\u2019Or\u00e9al', 'Nivea', 'Dyson', 'Braun', 'The Ordinary', 'Garnier'],
    base: [7, 449],
  },
  'food-grocery': {
    names: ['Organic Coffee Beans 1kg', 'Olive Oil Extra Virgin 1L', 'Protein Powder 2kg', 'Craft Beer Mix 12-Pack', 'Dark Chocolate Box', 'Pasta Bundle 10x500g', 'Honey Raw 500g', 'Green Tea 100 Bags'],
    brands: ['Lavazza', 'Barilla', 'Lindt', 'Alpro', 'Illy', 'Milka'],
    base: [3, 89],
  },
  toys: {
    names: ['Building Blocks Castle 1200pc', 'RC Off-Road Truck', 'Wooden Train Set', 'Plush Bear XXL', 'Science Lab Kit', 'Board Game Classic', 'Drone Mini Cam', 'Puzzle 2000pc'],
    brands: ['LEGO', 'Playmobil', 'Ravensburger', 'Hasbro', 'Mattel', 'Schleich'],
    base: [9, 299],
  },
  automotive: {
    names: ['All-Season Tyres 205/55 R16', 'Dash Cam 4K', 'Car Battery 74Ah', 'Roof Box 420L', 'Jump Starter 2000A', 'Child Car Seat i-Size', 'Motor Oil 5W-30 5L', 'OBD2 Scanner'],
    brands: ['Michelin', 'Bosch', 'Continental', 'Thule', 'Castrol', 'Osram'],
    base: [18, 599],
  },
  books: {
    names: ['Bestseller Thriller Hardcover', 'Cookbook Mediterranean', 'Children\u2019s Atlas Illustrated', 'Sci-Fi Trilogy Box Set', 'Self-Development Guide', 'Graphic Novel Deluxe', 'History of Europe Vol. 1', 'Language Course A1\u2013B2'],
    brands: ['Penguin', 'HarperCollins', 'Cornelsen', 'Taschen', 'DK', 'Usborne'],
    base: [6, 79],
  },
  travel: {
    names: ['Cabin Trolley 55cm', 'City Break 3 Nights', 'Travel Backpack 40L', 'Noise-Isolating Earplugs Set', 'Packing Cubes 6pc', 'Travel Adapter Universal', 'Beach Resort Week All-In', 'Hiking Poles Carbon'],
    brands: ['Samsonite', 'TUI', 'Osprey', 'Booking Deals', 'American Tourister', 'Deuter'],
    base: [11, 1299],
  },
};

const SHOPS: Partial<Record<CountryCode, string[]>> & { default: string[] } = {
  DE: ['MediaMarkt', 'Otto', 'Saturn', 'Lidl Online', 'Zalando'],
  FR: ['Fnac', 'Cdiscount', 'Darty', 'Carrefour', 'La Redoute'],
  ES: ['El Corte Ingl\u00e9s', 'PcComponentes', 'Carrefour ES', 'MediaMarkt ES'],
  IT: ['Unieuro', 'ePrice', 'Mediaworld', 'Esselunga'],
  PL: ['Allegro', 'Media Expert', 'RTV Euro AGD', 'Empik'],
  NL: ['bol.com', 'Coolblue', 'Wehkamp', 'MediaMarkt NL'],
  default: ['EuroShop', 'BestPrice Store', 'DealHouse', 'MegaStore EU'],
};

const CURRENCY: Record<CountryCode, string> = {
  DE: 'EUR', AT: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', PT: 'EUR',
  BE: 'EUR', FI: 'EUR', PL: 'PLN', SE: 'SEK', RO: 'RON', GB: 'GBP', DK: 'DKK',
  NO: 'NOK', CH: 'CHF',
};

/** Deterministic pseudo-random in [0,1) from a string seed. */
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

export function generateMockDeals(providerId: string, query: DealQuery): NormalizedDeal[] {
  const categories = query.category ? [query.category] : [...CATEGORY_SLUGS];
  const shops = SHOPS[query.country] ?? SHOPS.default;
  const currency = CURRENCY[query.country];
  const out: NormalizedDeal[] = [];

  for (const category of categories) {
    const spec = PRODUCTS[category];
    const rnd = seeded(`${providerId}:${query.country}:${category}`);
    spec.names.forEach((name, i) => {
      const brand = spec.brands[Math.floor(rnd() * spec.brands.length)];
      const original = Math.round((spec.base[0] + rnd() * (spec.base[1] - spec.base[0])) * 100) / 100;
      const discount = 0.15 + rnd() * 0.55; // 15–70 %
      const sale = Math.round(original * (1 - discount) * 100) / 100;
      out.push({
        productId: `${providerId}:${query.country}-${category}-${i}`,
        productName: `${brand} ${name}`,
        shopName: shops[Math.floor(rnd() * shops.length)],
        shopUrl: `https://example-shop.invalid/${category}/${i}`,
        shopLogoUrl: null,
        originalPrice: original,
        salePrice: sale,
        discountPercent: computeDiscountPercent(original, sale),
        currency,
        category,
        brand,
        imageUrl: `https://picsum.photos/seed/${providerId}-${category}-${i}/480/360`,
        country: query.country,
        city: null,
        isSponsored: true,
        source: providerId,
        lastUpdated: new Date().toISOString(),
      });
    });
  }

  let deals = out;
  if (query.q) {
    const tokens = queryTokens(query.q);
    if (tokens.length) {
      deals = deals.filter((d) => {
        const hay = `${d.productName} ${d.brand ?? ''}`.toLowerCase();
        return tokens.every((tok) => hay.includes(tok));
      });
    }
  }
  if (query.minDiscountPercent) {
    deals = deals.filter((d) => d.discountPercent >= query.minDiscountPercent!);
  }
  deals.sort((a, b) => b.discountPercent - a.discountPercent);
  return deals.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 50));
}
