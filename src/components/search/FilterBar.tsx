'use client';

/**
 * Collapsible results-page filters — a "Filters" button above the deal grid
 * that rolls down a row of dropdowns (replaces the old FilterPanel sidebar).
 * Category navigation lives in the top category chips and the burger menu, so
 * the bar carries only the refinements: sort, brand, min discount, price.
 * State lives in the URL (searchParams) so results are shareable and SSR'd.
 * Native inputs only — keeps the bundle small for the Lighthouse target.
 */
import { useTranslations } from 'next-intl';
import { useRouter, usePathname } from '@/i18n/routing';
import { useSearchParams } from 'next/navigation';
import { SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { displayShopName } from '@/lib/utils/shop';

const SELECT_CLS = 'h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm';
const LABEL_CLS = 'mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-400';

export function FilterBar({ brands, shops = [] }: { brands: string[]; shops?: string[] }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [open, setOpen] = useState(false);
  const [minPrice, setMinPrice] = useState(params.get('minPrice') ?? '');
  const [maxPrice, setMaxPrice] = useState(params.get('maxPrice') ?? '');

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value); else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  const applyPrices = () => {
    const next = new URLSearchParams(params.toString());
    minPrice ? next.set('minPrice', minPrice) : next.delete('minPrice');
    maxPrice ? next.set('maxPrice', maxPrice) : next.delete('maxPrice');
    router.push(`${pathname}?${next.toString()}`);
  };

  // How many refinements are active — shown on the collapsed button so a
  // filtered result list is never a mystery.
  const activeCount =
    (params.get('sort') && params.get('sort') !== 'discount' ? 1 : 0) +
    (params.get('brand') ? 1 : 0) +
    (params.get('shop') ? 1 : 0) +
    (Number(params.get('minDiscount')) > 0 ? 1 : 0) +
    (params.get('minPrice') || params.get('maxPrice') ? 1 : 0);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="filter-bar"
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {t('filters.heading')}
        {activeCount > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold leading-none text-white">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div id="filter-bar" className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3">
          <div className="w-40">
            <label htmlFor="f-sort" className={LABEL_CLS}>{t('filters.sort')}</label>
            <select
              id="f-sort"
              value={params.get('sort') ?? 'discount'}
              onChange={(e) => setParam('sort', e.target.value)}
              className={SELECT_CLS}
            >
              <option value="discount">{t('filters.sortDiscount')}</option>
              <option value="price-asc">{t('filters.sortPriceAsc')}</option>
              <option value="price-desc">{t('filters.sortPriceDesc')}</option>
              <option value="newest">{t('filters.sortNewest')}</option>
              <option value="random">{t('filters.sortRandom')}</option>
            </select>
          </div>

          {brands.length > 0 && (
            <div className="w-40">
              <label htmlFor="f-brand" className={LABEL_CLS}>{t('filters.brand')}</label>
              <select
                id="f-brand"
                value={params.get('brand') ?? ''}
                onChange={(e) => setParam('brand', e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">{t('filters.allBrands')}</option>
                {brands.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}

          {shops.length > 0 && (
            <div className="w-40">
              <label htmlFor="f-shop" className={LABEL_CLS}>{t('filters.shop')}</label>
              <select
                id="f-shop"
                value={params.get('shop') ?? ''}
                onChange={(e) => setParam('shop', e.target.value)}
                className={SELECT_CLS}
              >
                <option value="">{t('filters.allShops')}</option>
                {/* Value is the STORED shop_name (what the filter matches on);
                    only the label is tidied, so "Aliva Apotheke DE Online Shop"
                    reads as "Aliva Apotheke DE" without breaking the query. */}
                {shops.map((s) => (
                  <option key={s} value={s}>{displayShopName(s)}</option>
                ))}
              </select>
            </div>
          )}

          <div className="w-32">
            <label htmlFor="f-discount" className={LABEL_CLS}>{t('filters.minDiscount')}</label>
            <select
              id="f-discount"
              value={params.get('minDiscount') ?? ''}
              onChange={(e) => setParam('minDiscount', e.target.value)}
              className={SELECT_CLS}
            >
              <option value="">0%</option>
              {[10, 20, 30, 40, 50, 60, 70].map((d) => (
                <option key={d} value={d}>{`≥ ${d}%`}</option>
              ))}
            </select>
          </div>

          <div>
            <span className={LABEL_CLS}>{t('filters.priceRange')}</span>
            <div className="flex items-center gap-2">
              <Input
                inputMode="numeric" placeholder={t('filters.min')} value={minPrice}
                onChange={(e) => setMinPrice(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && applyPrices()}
                aria-label={t('filters.min')}
                className="w-20"
              />
              <span className="text-zinc-400">–</span>
              <Input
                inputMode="numeric" placeholder={t('filters.max')} value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && applyPrices()}
                aria-label={t('filters.max')}
                className="w-20"
              />
              <Button size="sm" onClick={applyPrices}>{t('filters.apply')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
