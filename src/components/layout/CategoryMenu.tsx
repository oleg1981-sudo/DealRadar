'use client';

/**
 * Horizontal category bar with a cascading mega-menu. The bar scrolls
 * horizontally (chevrons appear at the edges); hovering or clicking a category
 * opens a panel beneath it. The panel is two-level: a left column of
 * departments and, beside it, the leaf categories of the active department.
 * Top category → /category/<slug>; departments & leaves → /search filtered by
 * that term. Replaces the old "Browse by category" bar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { CATEGORIES } from '@/lib/categories';
import { categoryTerm } from '@/lib/categories-i18n';
import {
  ChevronLeft, ChevronRight, MonitorSmartphone, Shirt, Sofa, Bike, Sparkles,
  ShoppingBasket, Blocks, Car, BookOpen, Plane, PawPrint, HeartPulse, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  MonitorSmartphone, Shirt, Sofa, Bike, Sparkles, ShoppingBasket, Blocks, Car, BookOpen, Plane,
  PawPrint, HeartPulse,
};

const termHref = (slug: string, name: string) =>
  `/search?category=${slug}&q=${encodeURIComponent(name)}`;

// A DEPARTMENT click shows everything beneath it: the search page expands
// `dept` into the union of the department's leaf terms (a single `q` can't).
const deptHref = (slug: string, name: string) =>
  `/search?category=${slug}&dept=${encodeURIComponent(name)}`;

export function CategoryMenu() {
  const t = useTranslations('categories');
  const locale = useLocale();
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState(0);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = (slug: string) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenSlug(slug);
    setActiveSub(0);
  };
  const close = () => setOpenSlug(null);
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpenSlug(null), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  // Close on outside click or Escape.
  useEffect(() => {
    if (!openSlug) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openSlug]);

  // Track scroll position to show/hide the edge chevrons.
  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    updateArrows();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [updateArrows]);

  const scrollBy = (dir: 1 | -1) =>
    scrollerRef.current?.scrollBy({ left: dir * 280, behavior: 'smooth' });

  const active = CATEGORIES.find((c) => c.slug === openSlug);

  return (
    <div
      ref={wrapRef}
      className="relative z-30 mb-6"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <div className="relative">
        {canLeft && (
          <button
            type="button"
            aria-label="Scroll categories left"
            onClick={() => scrollBy(-1)}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-zinc-200 bg-white p-1.5 text-zinc-600 shadow-md transition-colors hover:text-accent"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
        )}

        <div
          ref={scrollerRef}
          className="flex gap-2 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {CATEGORIES.map((c) => {
            const Icon = ICONS[c.icon];
            const isOpen = openSlug === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="true"
                onPointerEnter={(e) => e.pointerType === 'mouse' && open(c.slug)}
                onClick={() => (isOpen ? close() : open(c.slug))}
                className={`flex h-12 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors ${
                  isOpen
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-accent/40 hover:text-accent'
                }`}
              >
                {Icon && (
                  <Icon className={`h-5 w-5 ${isOpen ? 'text-accent' : 'text-zinc-500'}`} aria-hidden />
                )}
                <span className="whitespace-nowrap">{t(c.slug)}</span>
              </button>
            );
          })}
        </div>

        {canRight && (
          <button
            type="button"
            aria-label="Scroll categories right"
            onClick={() => scrollBy(1)}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full border border-zinc-200 bg-white p-1.5 text-zinc-600 shadow-md transition-colors hover:text-accent"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>

      {/* Cascading mega-menu panel */}
      {active && (
        <div className="absolute left-0 right-0 top-full z-40 mt-2 max-h-[72vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-card-hover">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
            <span className="text-sm font-semibold text-zinc-900">{t(active.slug)}</span>
          </div>

          <div className="grid sm:grid-cols-[220px_1fr]">
            {/* Departments (level 2) */}
            <ul className="border-b border-zinc-100 p-2 sm:border-b-0 sm:border-r">
              {active.children.map((sub, i) => (
                <li key={sub.name}>
                  <button
                    type="button"
                    onPointerEnter={(e) => e.pointerType === 'mouse' && setActiveSub(i)}
                    onClick={() => setActiveSub(i)}
                    aria-current={i === activeSub}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      i === activeSub
                        ? 'bg-accent-soft font-medium text-accent'
                        : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <span>{categoryTerm(sub.name, locale)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>

            {/* Leaf categories (level 3) of the active department */}
            <div className="p-4">
              {active.children[activeSub] && (
                <>
                  <Link
                    href={deptHref(active.slug, active.children[activeSub].name)}
                    onClick={close}
                    className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-zinc-900 hover:text-accent"
                  >
                    {categoryTerm(active.children[activeSub].name, locale)}
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </Link>
                  <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 lg:grid-cols-3">
                    {(active.children[activeSub].children ?? []).map((leaf) => (
                      <li key={leaf}>
                        <Link
                          href={termHref(active.slug, leaf)}
                          onClick={close}
                          className="block rounded px-1 py-1 text-sm text-zinc-600 transition-colors hover:text-accent"
                        >
                          {categoryTerm(leaf, locale)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
