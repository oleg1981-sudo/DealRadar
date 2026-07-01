'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PriceHeatBar } from './PriceHeatBar';
import { PriceAlertButton } from './PriceAlertButton';
import { DealDetailModal } from './DealDetailModal';
import { formatPrice, formatDiscount } from '@/lib/utils/format';
import { priceWindow } from '@/lib/utils/price-history';
import { productModel } from '@/lib/utils/product-details';
import { decorateAffiliateUrl } from '@/lib/utils/affiliate';
import { displayShopName } from '@/lib/utils/shop';
import type { NormalizedDeal } from '@/lib/providers/types';

/**
 * One deal. Clicking the image or title opens the detailed-card modal; the
 * action buttons (Go to deal, alert) act on their own.
 */
export function DealCard({ deal, priority = false }: { deal: NormalizedDeal; priority?: boolean }) {
  const t = useTranslations('deal');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const href = decorateAffiliateUrl(deal.shopUrl, deal.source, deal.productId);
  const pw = priceWindow(deal);

  return (
    <Card className="group flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={deal.productName}
        className="relative block aspect-[4/3] w-full bg-white text-left"
      >
        {deal.imageUrl ? (
          <Image
            src={deal.imageUrl}
            alt={deal.productName}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-contain p-3"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-zinc-300">—</span>
        )}
        <Badge variant="deal" className="absolute left-2 top-2 text-sm">
          {formatDiscount(deal.discountPercent)}
        </Badge>
      </button>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3
          onClick={() => setOpen(true)}
          className="line-clamp-2 cursor-pointer text-sm font-medium leading-snug transition-colors hover:text-accent"
        >
          {deal.productName}
        </h3>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {deal.shopLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- tiny logos, arbitrary hosts
            <img src={deal.shopLogoUrl} alt="" className="h-4 w-4 rounded-sm object-contain" />
          )}
          <span>{displayShopName(deal.shopName)}</span>
          <span aria-hidden>·</span>
          <span className="text-zinc-400">{productModel(deal)}</span>
        </div>

        <div className="mt-auto flex items-baseline gap-2 pt-2">
          <span className="text-lg font-semibold text-zinc-900">
            {formatPrice(deal.salePrice, deal.currency, locale)}
          </span>
          <s className="text-sm text-zinc-400">
            {formatPrice(deal.originalPrice, deal.currency, locale)}
          </s>
        </div>

        <PriceHeatBar
          window={pw}
          currency={deal.currency}
          locale={locale}
          captionLabel={t('priceHistory')}
          todayLabel={t('today')}
        />

        <a
          href={href}
          target="_blank"
          rel="noopener nofollow sponsored"
          className="mt-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {t.rich('goToDeal', {
            shop: displayShopName(deal.shopName),
            chip: (chunks) => (
              <span className="rounded-md bg-white px-2 py-1 font-semibold text-accent">{chunks}</span>
            ),
          })}
        </a>
        <p className="mt-1 whitespace-nowrap text-center text-[8.5px] tracking-[-0.02em] leading-tight text-zinc-400">{t('priceNote')}</p>

        <PriceAlertButton
          productId={deal.productId}
          productName={deal.productName}
          price={deal.salePrice}
          currency={deal.currency}
        />
      </div>

      {open && <DealDetailModal deal={deal} onClose={() => setOpen(false)} />}
    </Card>
  );
}
