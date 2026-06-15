import Image from 'next/image';
import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PriceHeatBar } from './PriceHeatBar';
import { PriceAlertButton } from './PriceAlertButton';
import { formatPrice, formatDiscount } from '@/lib/utils/format';
import { priceWindow } from '@/lib/utils/price-history';
import { decorateAffiliateUrl } from '@/lib/utils/affiliate';
import type { NormalizedDeal } from '@/lib/providers/types';

/**
 * One deal. Server component — no client JS per card keeps the grid cheap
 * (Lighthouse perf target ≥ 85).
 */
export function DealCard({ deal, priority = false }: { deal: NormalizedDeal; priority?: boolean }) {
  const t = useTranslations('deal');
  const locale = useLocale();
  const href = decorateAffiliateUrl(deal.shopUrl, deal.source);
  const pw = priceWindow(deal);

  return (
    <Card className="group flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] bg-zinc-50">
        {deal.imageUrl ? (
          <Image
            src={deal.imageUrl}
            alt={deal.productName}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-300">—</div>
        )}
        <Badge variant="deal" className="absolute left-2 top-2 text-sm">
          {formatDiscount(deal.discountPercent)}
        </Badge>
        {deal.isSponsored && (
          <Badge variant="sponsored" className="absolute right-2 top-2">
            {t('sponsored')}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{deal.productName}</h3>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          {deal.shopLogoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- tiny logos, arbitrary hosts
            <img src={deal.shopLogoUrl} alt="" className="h-4 w-4 rounded-sm object-contain" />
          )}
          <span>{deal.shopName}</span>
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
          className="mt-2 inline-flex h-9 items-center justify-center rounded-lg bg-accent text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          {t('goToDeal')}
        </a>

        <PriceAlertButton
          productId={deal.productId}
          productName={deal.productName}
          price={deal.salePrice}
          currency={deal.currency}
        />
      </div>
    </Card>
  );
}
