'use client';

/**
 * Dynamic search: fires on the 3rd character, debounced 200 ms, renders a
 * grouped dropdown (products / categories / brands, max 8 rows). Enter or
 * "See all results" → full results page.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter, Link } from '@/i18n/routing';
import Image from 'next/image';
import { Search } from 'lucide-react';
import { useLocation } from '@/components/layout/LocationContext';
import { formatPrice, formatDiscount } from '@/lib/utils/format';

interface SearchResult {
  products: {
    productId: string; productName: string; imageUrl: string | null;
    salePrice: number; currency: string; discountPercent: number;
  }[];
  categories: string[];
  brands: string[];
}

const EMPTY: SearchResult = { products: [], categories: [], brands: [] };

/**
 * Modern Apple-style activity indicator: a faint full-circle track with one
 * rounded arc sweeping smoothly around it. (The older iOS look — 8 tapered
 * spokes stepping discretely — reads as choppy at 16px.)
 *
 * The rotation MUST be the only transform on this element: Tailwind's `spin`
 * keyframes are `none → rotate(360deg)`, so the `from: none` wipes any other
 * transform for the whole animation. Centering therefore lives on the wrapper.
 * Decorative — the input carries `aria-busy` for assistive tech.
 */
function SearchSpinner({ className }: { className?: string }) {
  // r=6.25 → circumference ≈ 39.3; a 10.5 dash draws roughly a quarter arc.
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className={`animate-spin [animation-duration:0.7s] ${className ?? ''}`}
    >
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <circle
        cx="8" cy="8" r="6.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="10.5 28.8"
      />
    </svg>
  );
}

export function SearchBar({ variant = 'header' }: { variant?: 'header' | 'hero' } = {}) {
  const isHero = variant === 'hero';
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { location } = useLocation();

  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult>(EMPTY);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();
  const rootRef = useRef<HTMLDivElement>(null);
  const dropdownId = useId();

  // Close on outside click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const onChange = (value: string) => {
    setQ(value);
    clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    if (value.trim().length < 3) {
      setResults(EMPTY);
      setOpen(false);
      setLoading(false);
      return;
    }
    // Spin from the keystroke, not from the fetch: the 200 ms debounce is dead
    // time the user would otherwise read as "nothing happened".
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(value.trim())}&country=${location.country}&limit=8`,
          { signal: ctrl.signal },
        );
        if (res.ok) {
          setResults((await res.json()) as SearchResult);
          setOpen(true);
        }
      } catch { /* aborted or offline — keep previous state */ }
      finally {
        // Only the newest request may stop the spinner: an aborted older one
        // settling here would otherwise blink it off mid-typing.
        if (abortRef.current === ctrl) setLoading(false);
      }
    }, 200);
  };

  const goToResults = () => {
    if (q.trim().length === 0) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  const total = results.products.length + results.categories.length + results.brands.length;
  // Hard cap of 8 visible rows, products first.
  const visibleProducts = results.products.slice(0, 8);
  const remaining = Math.max(0, 8 - visibleProducts.length);
  const visibleCategories = results.categories.slice(0, Math.min(remaining, 3));
  const visibleBrands = results.brands.slice(0, Math.max(0, remaining - visibleCategories.length));

  return (
    <div ref={rootRef} className="relative w-full max-w-xl">
      <form
        onSubmit={(e) => { e.preventDefault(); goToResults(); }}
        className={isHero ? 'flex gap-2' : ''}
      >
        <div className="relative flex-1">
          {loading ? (
            // The centering transform lives on the WRAPPER, never on the
            // spinning SVG: `animate-spin`'s keyframes set `transform: rotate()`
            // outright, which would overwrite `-translate-y-1/2` and drop the
            // icon half its height mid-animation.
            <span
              className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${isHero ? 'left-3.5' : 'left-3'}`}
            >
              <SearchSpinner className="h-4 w-4 text-accent" />
            </span>
          ) : (
            <Search
              className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 ${isHero ? 'left-3.5' : 'left-3'}`}
              aria-hidden
            />
          )}
          <input
            type="search"
            role="combobox"
            aria-busy={loading}
            aria-expanded={open}
            aria-controls={dropdownId}
            aria-label={t('search.placeholder')}
            value={q}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && goToResults()}
            onFocus={() => total > 0 && setOpen(true)}
            placeholder={t('search.placeholder')}
            className={
              isHero
                ? 'h-12 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-base placeholder:text-zinc-400 shadow-sm focus:border-accent focus:outline-none'
                : 'h-10 w-full rounded-lg border border-zinc-200 bg-zinc-50 pl-9 pr-3 text-sm placeholder:text-zinc-400 focus:border-accent focus:bg-white'
            }
          />
        </div>
        {isHero && (
          <button
            type="submit"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-xl bg-accent px-6 text-sm font-semibold text-white transition-colors hover:bg-accent-hover"
          >
            {t('home.heroCta')}
          </button>
        )}
      </form>

      {open && total > 0 && (
        <div
          id={dropdownId}
          className="absolute top-full z-40 mt-2 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-card-hover"
        >
          {visibleProducts.length > 0 && (
            <div>
              <p className="px-3 pt-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {t('search.products')}
              </p>
              <ul>
                {visibleProducts.map((p) => (
                  <li key={p.productId}>
                    <Link
                      href={`/search?q=${encodeURIComponent(p.productName)}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50"
                    >
                      {p.imageUrl ? (
                        <Image src={p.imageUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-md object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded-md bg-zinc-100" />
                      )}
                      <span className="flex-1 truncate text-sm">{p.productName}</span>
                      <span className="text-xs font-semibold text-deal">{formatDiscount(p.discountPercent)}</span>
                      <span className="text-sm font-medium">{formatPrice(p.salePrice, p.currency, locale)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visibleCategories.length > 0 && (
            <div className="border-t border-zinc-100">
              <p className="px-3 pt-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {t('search.categories')}
              </p>
              <ul className="pb-1">
                {visibleCategories.map((slug) => (
                  <li key={slug}>
                    <Link
                      href={`/category/${slug}`}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      {t(`categories.${slug}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visibleBrands.length > 0 && (
            <div className="border-t border-zinc-100">
              <p className="px-3 pt-2.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
                {t('search.brands')}
              </p>
              <ul className="pb-1">
                {visibleBrands.map((b) => (
                  <li key={b}>
                    <Link
                      href={`/search?brand=${encodeURIComponent(b)}`}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      {b}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={goToResults}
            className="block w-full border-t border-zinc-100 px-3 py-2.5 text-center text-sm font-medium text-accent hover:bg-accent-soft"
          >
            {t('search.seeAll')}
          </button>
        </div>
      )}
    </div>
  );
}
