'use client';

/**
 * Detailed-card modal: opens from a deal card. Gallery top-left, price + action
 * buttons (Go to deal, Receive best price alert) stacked beside it, and a
 * specs/sizes section below. A centered, medium floating panel — not full page.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { X, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PriceHeatBar } from './PriceHeatBar';
import { PriceAlertButton } from './PriceAlertButton';
import { formatPrice, formatDiscount } from '@/lib/utils/format';
import { priceWindow } from '@/lib/utils/price-history';
import { decorateAffiliateUrl } from '@/lib/utils/affiliate';
import { displayShopName } from '@/lib/utils/shop';
import { productGallery, productSpecs, productSizes, otherStoreOffers } from '@/lib/utils/product-details';
import type { NormalizedDeal } from '@/lib/providers/types';

export function DealDetailModal({ deal, onClose }: { deal: NormalizedDeal; onClose: () => void }) {
  const t = useTranslations('deal');
  const locale = useLocale();
  const [active, setActive] = useState(0);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const [showStores, setShowStores] = useState(false);

  const gallery = productGallery(deal);
  const specs = productSpecs(deal, locale);
  const sizes = productSizes(deal);
  const pw = priceWindow(deal);
  const otherStores = otherStoreOffers(deal);
  const href = decorateAffiliateUrl(deal.shopUrl, deal.source, deal.productId);

  // Portal target + body scroll lock + Escape to close.
  useEffect(() => {
    const el = document.createElement('div');
    el.setAttribute('data-deal-modal', '');
    document.body.appendChild(el);
    setPortalEl(el);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.removeChild(el);
    };
  }, [onClose]);

  if (!portalEl) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label={t('close')} onClick={onClose} className="absolute inset-0 bg-zinc-900/50" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={deal.productName}
        className="relative z-10 max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-card-hover sm:p-6 md:flex md:h-[700px] md:flex-col md:overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('close')}
          className="absolute right-3 top-3 z-20 rounded-full bg-white/90 p-1.5 text-zinc-600 shadow ring-1 ring-zinc-200 transition-colors hover:bg-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        <div className="grid gap-6 md:shrink-0 md:grid-cols-2">
          {/* Gallery — top-left */}
          <div>
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-white">
              {gallery[active] && (
                <Image
                  src={gallery[active]}
                  alt={deal.productName}
                  fill
                  sizes="(max-width: 768px) 90vw, 360px"
                  className="object-contain p-4"
                />
              )}
              <Badge variant="deal" className="absolute left-2 top-2 text-sm">
                {formatDiscount(deal.discountPercent)}
              </Badge>
            </div>
            {gallery.length > 1 && (
              <div className="mt-2 flex gap-2">
                {gallery.map((src, i) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`${deal.productName} ${i + 1}`}
                    className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition-colors ${
                      i === active ? 'border-accent' : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <Image src={src} alt="" fill sizes="64px" className="object-contain p-1" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info + actions — same level as the gallery */}
          <div className="flex flex-col">
            <h2 className="pr-8 text-lg font-semibold leading-snug text-zinc-900">{deal.productName}</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {deal.brand ? `${deal.brand} · ` : ''}
              {displayShopName(deal.shopName)}
            </p>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-900">
                {formatPrice(deal.salePrice, deal.currency, locale)}
              </span>
              <s className="text-sm text-zinc-400">
                {formatPrice(deal.originalPrice, deal.currency, locale)}
              </s>
            </div>

            <div className="mt-3">
              <PriceHeatBar
                window={pw}
                currency={deal.currency}
                locale={locale}
                captionLabel={t('priceHistory')}
                todayLabel={t('today')}
              />
            </div>

            {otherStores.length > 0 && (
              <div className="relative mt-3">
                <button
                  type="button"
                  onClick={() => setShowStores((v) => !v)}
                  aria-expanded={showStores}
                  className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  <span>{t('otherStores')} ({otherStores.length})</span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showStores ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {showStores && (
                  <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 divide-y divide-zinc-100 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg">
                    {otherStores.map((o) => (
                      <li key={o.shopName}>
                        <a
                          href={decorateAffiliateUrl(o.url, deal.source, deal.productId)}
                          target="_blank"
                          rel="noopener nofollow sponsored"
                          className="flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-zinc-50"
                        >
                          <span className="text-zinc-700">{o.shopName}</span>
                          <span className="font-semibold tabular-nums text-zinc-900">
                            {formatPrice(o.price, o.currency, locale)}
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {sizes && sizes.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{t('sizes')}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {sizes.map(({ size, available }) => (
                    <span
                      key={size}
                      aria-disabled={!available}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                        available
                          ? 'border-zinc-200 text-zinc-700'
                          : 'border-zinc-100 text-zinc-300 line-through'
                      }`}
                    >
                      {size}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-auto pt-4">
              <a
                href={href}
                target="_blank"
                rel="noopener nofollow sponsored"
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                {t.rich('goToDeal', {
                  shop: displayShopName(deal.shopName),
                  chip: (chunks) => (
                    <span className="rounded-md bg-white px-2 py-1 font-semibold text-accent">{chunks}</span>
                  ),
                })}
              </a>
              <PriceAlertButton
                productId={deal.productId}
                productName={deal.productName}
                price={deal.salePrice}
                currency={deal.currency}
              />
            </div>
          </div>
        </div>

        {/* Technical details — the only scroll area on desktop. */}
        <div className="mt-6 border-t border-zinc-100 pt-4 md:flex md:min-h-0 md:flex-1 md:flex-col">
          <h3 className="mb-2 text-sm font-semibold text-zinc-900 md:shrink-0">{t('details')}</h3>
          <dl className="grid grid-cols-1 gap-x-8 overscroll-contain pr-1 sm:grid-cols-2 md:min-h-0 md:flex-1 md:overflow-y-auto">
            {specs.map((s) => (
              <div key={s.label} className="flex justify-between gap-4 border-b border-zinc-100 py-1.5 text-sm">
                <dt className="text-zinc-500">{s.label}</dt>
                <dd className="text-right font-medium text-zinc-800">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>,
    portalEl,
  );
}
