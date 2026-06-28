import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getDealBySlug } from '@/lib/db/deals.repo';
import { formatPrice, formatDiscount } from '@/lib/utils/format';
import { decorateAffiliateUrl } from '@/lib/utils/affiliate';
import { priceWindow } from '@/lib/utils/price-history';
import { PriceAlertButton } from '@/components/deals/PriceAlertButton';
import { PriceHeatBar } from '@/components/deals/PriceHeatBar';
import { Badge } from '@/components/ui/badge';

interface Props {
  params: { locale: string; slug: string };
}

export async function generateMetadata({ params }: Props) {
  const deal = await getDealBySlug(params.slug);
  if (!deal) return { title: 'Deal Not Found - DealRadar' };
  return {
    title: `${deal.productName} - ${formatDiscount(deal.discountPercent)} Off | DealRadar`,
    description: `Buy ${deal.productName} for ${formatPrice(deal.salePrice, deal.currency, params.locale)} (was ${formatPrice(deal.originalPrice, deal.currency, params.locale)}) at ${deal.shopName}. Track prices across Europe on DealRadar.`,
    alternates: {
      canonical: `https://dealradar.eu/${params.locale}/deal/${params.slug}`,
    },
  };
}

export default async function DealDetailPage({ params }: Props) {
  const deal = await getDealBySlug(params.slug);
  if (!deal) notFound();

  const affiliateUrl = decorateAffiliateUrl(deal.shopUrl, deal.source, deal.country, deal.category, deal.productId);
  const pw = priceWindow(deal);

  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: deal.productName,
    image: deal.imageUrl ? [deal.imageUrl] : [],
    description: `Deal on ${deal.productName} at ${deal.shopName}`,
    brand: deal.brand ? { '@type': 'Brand', name: deal.brand } : undefined,
    offers: {
      '@type': 'Offer',
      price: deal.salePrice,
      priceCurrency: deal.currency,
      availability: 'https://schema.org/InStock',
      url: affiliateUrl,
      seller: {
        '@type': 'Organization',
        name: deal.shopName,
      },
    },
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mb-4">
        <Link href={`/${params.locale}`} className="text-sm text-zinc-500 hover:underline">
          &larr; Back to all deals
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white p-6 shadow-sm">
          {deal.imageUrl ? (
            <Image
              src={deal.imageUrl}
              alt={deal.productName}
              fill
              priority
              className="object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400">No Image</div>
          )}
          <Badge variant="deal" className="absolute left-4 top-4 text-lg">
            {formatDiscount(deal.discountPercent)}
          </Badge>
        </div>

        <div className="flex flex-col justify-between">
          <div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-accent">
              {deal.shopName}
            </div>
            <h1 className="mb-4 text-2xl font-bold text-zinc-900 md:text-3xl">{deal.productName}</h1>

            <div className="mb-6 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-zinc-900">
                {formatPrice(deal.salePrice, deal.currency, params.locale)}
              </span>
              <span className="text-lg text-zinc-400 line-through">
                {formatPrice(deal.originalPrice, deal.currency, params.locale)}
              </span>
            </div>

            <div className="mb-6">
              <PriceHeatBar
                window={pw}
                currency={deal.currency}
                locale={params.locale}
                captionLabel="Price History"
                todayLabel="Today"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <a
              href={affiliateUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-12 w-full items-center justify-center rounded-lg bg-accent font-semibold text-white transition hover:opacity-90"
            >
              Go to {deal.shopName}
            </a>

            <div className="flex items-center justify-between">
              <PriceAlertButton
                productId={deal.productId}
                productName={deal.productName}
                price={deal.salePrice}
                currency={deal.currency}
              />
              <span className="text-xs text-zinc-400">Sponsored / Affiliate Link</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
