'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { formatPrice } from '@/lib/utils/format';

export interface SearchResults {
  products: { productId: string; name: string; imageUrl: string | null; bestPrice: number; currency: string; discountPercent: number }[];
  categories: string[];
  brands: string[];
}

export function SearchDropdown({
  id, results, loading, query, onSeeAll, onClose,
}: {
  id: string;
  results: SearchResults;
  loading: boolean;
  query: string;
  onSeeAll: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('search');
  const locale = useLocale();
  const empty = results.products.length === 0 && results.categories.length === 0 && results.brands.length === 0;

  return (
    <div id={id} className="absolute left-0 right-0 top-12 z-40 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md">
      {loading && <p className="px-4 py-3 text-sm text-gray-400">{t('searching')}</p>}
      {!loading && empty && <p className="px-4 py-3 text-sm text-gray-500">{t('noResults', { query })}</p>}

      {results.products.length > 0 && (
        <section>
          <h4 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('products')}</h4>
          <ul>
            {results.products.slice(0, 8).map((p) => (
              <li key={p.productId}>
                <Link
                  href={`/${locale}/search?q=${encodeURIComponent(p.name)}`}
                  onClick={onClose}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50"
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-gray-100">
                    {p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="36px" className="object-contain" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{p.name}</span>
                  <span className="shrink-0 text-sm font-semibold text-gray-900">{formatPrice(p.bestPrice, p.currency, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.categories.length > 0 && (
        <section className="border-t border-gray-100">
          <h4 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('categories')}</h4>
          <ul className="flex flex-wrap gap-2 px-4 py-2">
            {results.categories.map((c) => (
              <li key={c}>
                <Link href={`/${locale}/category/${c}`} onClick={onClose}
                  className="inline-block rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-accent-soft hover:text-accent">
                  {c.replace('-', ' ')}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {results.brands.length > 0 && (
        <section className="border-t border-gray-100">
          <h4 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{t('brands')}</h4>
          <ul className="flex flex-wrap gap-2 px-4 py-2">
            {results.brands.map((b) => (
              <li key={b}>
                <Link href={`/${locale}/search?brand=${encodeURIComponent(b)}`} onClick={onClose}
                  className="inline-block rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-700 hover:bg-accent-soft hover:text-accent">
                  {b}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!empty && (
        <button onClick={onSeeAll}
          className="block w-full border-t border-gray-100 px-4 py-2.5 text-center text-sm font-medium text-accent hover:bg-accent-soft">
          {t('seeAll')}
        </button>
      )}
    </div>
  );
}
