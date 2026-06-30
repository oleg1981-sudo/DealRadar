import { getTranslations } from 'next-intl/server';
import { DealGrid } from '@/components/deals/DealGrid';
import { queryDeals } from '@/lib/db/deals.repo';
import { countryInfo } from '@/lib/geo/countries';
import type { CountryCode, NormalizedDeal } from '@/lib/providers/types';

const HERO_COUNT = 12;
// Pool to diversify from. Large enough to reach lower-discount stores (one store
// can have hundreds of high-discount items that would otherwise fill the hero).
const HERO_POOL = 500;

/**
 * Round-robin a discount-sorted list across shops so a single store can't
 * monopolise the hero: take each shop's best deal, then its 2nd, etc. Shops are
 * ordered by their strongest discount, so the very best deals still lead.
 */
function diversifyByShop(deals: NormalizedDeal[], limit: number): NormalizedDeal[] {
  const byShop = new Map<string, NormalizedDeal[]>();
  for (const d of deals) (byShop.get(d.shopName) ?? byShop.set(d.shopName, []).get(d.shopName)!).push(d);
  const groups = [...byShop.values()].sort((a, b) => b[0].discountPercent - a[0].discountPercent);
  const out: NormalizedDeal[] = [];
  for (let i = 0; out.length < limit; i++) {
    let advanced = false;
    for (const g of groups) {
      if (!g[i]) continue;
      out.push(g[i]);
      advanced = true;
      if (out.length >= limit) break;
    }
    if (!advanced) break; // every shop exhausted
  }
  return out;
}

/** Hero: top deals in the user's country, mixed across stores (server-rendered). */
export async function HeroDeals({ country, city }: { country: CountryCode; city: string | null }) {
  const t = await getTranslations('home');
  const pool = await queryDeals({ country, city: city ?? undefined, limit: HERO_POOL, sort: 'discount' });
  const deals = diversifyByShop(pool, HERO_COUNT);

  return (
    <section aria-labelledby="hero-heading">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 id="hero-heading" className="text-2xl font-semibold tracking-tight">
          {t('topDeals', { country: countryInfo(country).name })}
        </h1>
      </div>
      {deals.length > 0 ? (
        <DealGrid deals={deals} />
      ) : (
        <p className="rounded-lg border border-dashed border-zinc-200 p-10 text-center text-zinc-500">
          {t('noDeals')}
        </p>
      )}
    </section>
  );
}
