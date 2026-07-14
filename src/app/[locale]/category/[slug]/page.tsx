import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { DealGrid } from '@/components/deals/DealGrid';
import { FilterBar } from '@/components/search/FilterBar';
import { Pagination } from '@/components/search/Pagination';
import { queryDealsPaged, distinctBrands, type DealFilters } from '@/lib/db/deals.repo';
import { randomSeed } from '@/lib/utils/rng';
import { parseLocationCookie, LOCATION_COOKIE } from '@/lib/geo/resolve';
import { DEFAULT_COUNTRY } from '@/lib/geo/countries';
import { CATEGORY_SLUGS, type CategorySlug } from '@/lib/providers/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 48;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  if (!CATEGORY_SLUGS.includes(slug as CategorySlug)) notFound();
  const category = slug as CategorySlug;
  const sp = await searchParams;

  const t = await getTranslations('categories');
  const tSearch = await getTranslations('search');
  const cookieStore = await cookies();
  const loc = parseLocationCookie(cookieStore.get(LOCATION_COOKIE)?.value);
  const country = loc?.country ?? DEFAULT_COUNTRY;

  const requestedPage = Math.max(1, Math.floor(toNum(one(sp.page)) ?? 1));
  const sort = (one(sp.sort) as DealFilters['sort']) ?? 'discount';
  // sort:'random': pin a seed so pagination continues ONE shuffle; a fresh
  // visit (no seed in the URL) rolls a new one — different deals every entry.
  const seed = sort === 'random' ? Math.floor(toNum(one(sp.seed)) ?? randomSeed()) : undefined;

  // Category is fixed by the route; brand/price/discount/sort/page come from
  // the URL so the FilterPanel and Pagination actually drive the results.
  const filters: DealFilters = {
    country,
    city: loc?.city ?? undefined,
    category,
    brand: one(sp.brand) || undefined,
    minDiscountPercent: toNum(one(sp.minDiscount)),
    minPrice: toNum(one(sp.minPrice)),
    maxPrice: toNum(one(sp.maxPrice)),
    sort,
    seed,
    limit: PAGE_SIZE,
    offset: (requestedPage - 1) * PAGE_SIZE,
  };

  const [{ deals, total }, brands] = await Promise.all([
    queryDealsPaged(filters),
    distinctBrands(country, category),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages); // repo clamps the data the same way

  // Query params each pagination link must preserve.
  const linkParams: Record<string, string> = {};
  for (const k of ['brand', 'sort', 'minDiscount', 'minPrice', 'maxPrice'] as const) {
    const v = one(sp[k]);
    if (v) linkParams[k] = v;
  }
  if (seed !== undefined) linkParams.seed = String(seed); // keep this shuffle across pages

  return (
    <div>
      <FilterBar brands={brands} />
      <section aria-live="polite">
        <h1 className="mb-6 text-xl font-semibold tracking-tight">
          {t(category)}
          <span className="ml-2 text-sm font-normal text-zinc-400">({total})</span>
        </h1>
        {deals.length > 0 ? (
          <DealGrid deals={deals} listName={`category_${category}`} />
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 p-10 text-center text-zinc-500">
            {tSearch('noResults')}
          </p>
        )}
        <Pagination
          basePath={`/category/${category}`}
          params={linkParams}
          page={page}
          totalPages={totalPages}
          prevLabel={tSearch('prevPage')}
          nextLabel={tSearch('nextPage')}
        />
      </section>
    </div>
  );
}

function toNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
