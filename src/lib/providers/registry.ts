/**
 * Provider registry — the only module that knows which providers exist.
 * Adding a provider = one file in this folder + one line in PROVIDERS below.
 *
 * Responsibilities:
 *  - init all providers once per server process and log mock warnings,
 *  - route a DealQuery to providers that support the country, by priority,
 *  - fall through to the next provider on ProviderError,
 *  - merge + dedupe results (by productId).
 *
 * The registry does NOT cache or persist — that belongs to the refresh route
 * (Supabase upsert) and the Redis layer, keeping providers stateless.
 */
import { DummyJsonProvider } from './dummyjson';
import { KelkooProvider } from './kelkoo';
import { AwinProvider } from './awin';
import { TradedoublerProvider } from './tradedoubler';
import { IdealoMockProvider } from './idealo.mock';
import { slugify } from '../utils/slug';
import {
  ProviderError,
  type DealQuery, type NormalizedDeal, type PriceProvider, type ProviderHealth,
} from './types';

const ALL_PROVIDERS: PriceProvider[] = [
  new DummyJsonProvider(), // priority 1 — free live "real API" test feed (no key/commission)
  new KelkooProvider(),
  new AwinProvider(),
  new TradedoublerProvider(),
  new IdealoMockProvider(),
];

// `dummyjson` is a local TEST feed: it's OPT-IN ONLY and never runs in
// production. Set DEALRADAR_ONLY_PROVIDER=dummyjson (e.g. in .env.local) to pin
// the whole site to it. Unset = the normal production providers, no test feed.
const ONLY = process.env.DEALRADAR_ONLY_PROVIDER;
const PROVIDERS: PriceProvider[] = ONLY
  ? ALL_PROVIDERS.filter((p) => p.id === ONLY)
  : ALL_PROVIDERS.filter((p) => p.id !== 'dummyjson');

let initPromise: Promise<Map<string, ProviderHealth>> | null = null;

/** Idempotent init — safe to call from any route; runs once per process. */
export function initProviders(): Promise<Map<string, ProviderHealth>> {
  initPromise ??= (async () => {
    const health = new Map<string, ProviderHealth>();
    for (const p of PROVIDERS) {
      try {
        health.set(p.id, await p.init());
      } catch (e) {
        health.set(p.id, { ok: false, isMock: false, message: String(e) });
        console.error(`[registry] init failed for ${p.id}:`, e);
      }
    }
    return health;
  })();
  return initPromise;
}

export function providersFor(country: DealQuery['country']): PriceProvider[] {
  return PROVIDERS
    .filter((p) => p.supportedCountries.includes(country))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Fetch deals across providers for one query using hybrid deduplication.
 * Strategy: Group deals by EAN (if present) or slugified name+merchant. Keep lowest sale price.
 */
export async function fetchDealsAcrossProviders(query: DealQuery): Promise<NormalizedDeal[]> {
  const health = await initProviders();
  const limit = query.limit ?? 50;
  const rawDeals: NormalizedDeal[] = [];

  for (const provider of providersFor(query.country)) {
    if (!health.get(provider.id)?.ok) continue;
    try {
      const deals = await provider.fetchDeals({ ...query, limit: limit * 2 });
      rawDeals.push(...deals);
    } catch (e) {
      if (e instanceof ProviderError) {
        console.error(`[registry] ${provider.id} failed (retryable=${e.retryable}): ${e.message} — falling through`);
        continue;
      }
      throw e;
    }
  }

  // Hybrid deduplication
  const deduppedMap = new Map<string, NormalizedDeal>();
  for (const deal of rawDeals) {
    const key = deal.eanCode
      ? `ean:${deal.eanCode}`
      : `name:${slugify(deal.productName)}_${slugify(deal.shopName)}`;
    
    const existing = deduppedMap.get(key);
    if (!existing) {
      deduppedMap.set(key, deal);
    } else if (deal.salePrice < existing.salePrice) {
      deduppedMap.set(key, deal);
    }
  }

  const merged = Array.from(deduppedMap.values());
  return merged.sort((a, b) => b.discountPercent - a.discountPercent).slice(0, limit);
}
