'use client';

/**
 * TravelDeal — a pinned entry point for the cruise & package vertical.
 *
 * Deliberately rendered OUTSIDE CategoryMenu's horizontal scroller: the retail
 * bar scrolls (and has edge chevrons), so a button inside it would slide out of
 * view. This one is a flex sibling of the scroller, so it holds position no
 * matter how far the categories are scrolled.
 *
 * Blue rather than the site `accent` on purpose — it reads as a separate
 * vertical, not another retail department.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import { Ship, ChevronDown } from 'lucide-react';
import { categoryTerm } from '@/lib/categories-i18n';
import { TRAVEL_GROUPS, travelSlug } from '@/lib/travel-categories';

/**
 * Points at the TravelDeal landing page, which says "coming soon" until a feed
 * exists. Previously these went to /search, which returned an empty result page
 * — accurate, but it reads as a broken site rather than an unreleased section.
 * The URLs do not change when real listings replace the placeholder.
 */
const leafHref = (name: string) => `/traveldeal/${travelSlug(name)}`;

export function TravelDealMenu() {
  const t = useTranslations('travelDeal');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Same open/close feel as CategoryMenu: a short grace period so the pointer
  // can cross the gap between the button and the panel without it snapping shut.
  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Clear any pending timer on unmount so it can't fire into a dead component.
  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="relative shrink-0"
      // cancelClose, NOT openNow — matching CategoryMenu. Touch browsers
      // synthesise `mouseenter` on the first tap, so opening here meant tap 1
      // opened the panel and the click that followed immediately toggled it
      // shut: the menu only worked on the SECOND tap on mobile. Opening is
      // owned by the button's pointerType-guarded handler (mouse only) and by
      // the click, which behaves correctly on both.
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onPointerEnter={(e) => e.pointerType === 'mouse' && openNow()}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-12 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold text-white transition-colors ${
          open
            ? 'border-blue-700 bg-blue-700'
            : 'border-blue-600 bg-blue-600 hover:bg-blue-700 hover:border-blue-700'
        }`}
      >
        <Ship className="h-5 w-5" aria-hidden />
        <span className="whitespace-nowrap">TravelDeal</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open && (
        <div
          onMouseEnter={cancelClose}
          className="absolute left-0 top-full z-50 mt-2 w-[min(92vw,640px)] max-h-[72vh] overflow-y-auto rounded-xl border border-blue-200 bg-white shadow-card-hover"
        >
          <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-3">
            <Ship className="h-4 w-4 text-blue-700" aria-hidden />
            <span className="text-sm font-semibold text-blue-900">{t('heading')}</span>
          </div>

          <div className="grid gap-x-6 gap-y-5 p-4 sm:grid-cols-2">
            {TRAVEL_GROUPS.map((group) => (
              <div key={group.name}>
                {/* No supplier badge here. `group.source` records which
                    integration feeds each group and stays useful to US, but
                    "AWIN" means nothing to a shopper, and naming the network
                    exposes the commercial supply chain for no reader benefit.
                    Affiliate disclosure is already handled properly by the
                    Affiliate-Link badge and the redirect notice. If a supplier
                    signal is ever wanted, it should be the MERCHANT ("TUI
                    Cruises") on the deal card, not the network on a menu. */}
                <div className="mb-2">
                  <span className="text-sm font-semibold text-zinc-900">
                    {categoryTerm(group.name, locale)}
                  </span>
                </div>
                <ul className="space-y-1">
                  {group.children.map((leaf) => (
                    <li key={leaf.name}>
                      <Link
                        href={leafHref(leaf.name)}
                        onClick={() => setOpen(false)}
                        className="block rounded px-1 py-1 text-sm text-zinc-600 transition-colors hover:text-blue-700"
                      >
                        {categoryTerm(leaf.name, locale)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
