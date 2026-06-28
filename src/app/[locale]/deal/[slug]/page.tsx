import { cache } from 'react';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getDealBySlug } from '@/lib/db/deals.repo';
import { formatPrice, formatDiscount } from '@/lib/utils/format';
import { decorateAffiliateUrl } from '@/lib/utils/affiliate';
import { priceWindow } from '@/lib/utils/price-history';
import { PriceAlertButton } from '@/components/deals/PriceAlertButton';
import { PriceHeatBar } from '@/components/deals/PriceHeatBar';
import { SponsoredBadge } from '@/components/deals/SponsoredBadge';
import { Badge } from '@/components/ui/badge';
import { routing } from '@/i18n/routing';

interface Props {
  params: { locale: string; slug: string };
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dealradar.eu';

// Deduplicate the lookup across generateMetadata + the page render (one request).
const getDeal = cache((slug: string) => getDealBySlug(slug));

export async function generateMetadata({ params }: Props) {
  const deal = await getDeal(params.slug);
  // Throw 404 during metadata resolution (before the streaming shell flushes) so
  // an unknown slug returns a real HTTP 404, not a 200 with a not-found body
  // (the loading.tsx Suspense boundary would otherwise commit 200 first).
  if (!deal) notFound();
  // No hardcoded English: title/description are proper nouns + locale-formatted numbers.
  const sale = formatPrice(deal.salePrice, deal.currency, params.locale);
  const was = formatPrice(deal.originalPrice, deal.currency, params.locale);
  // hreflang alternates across every supported locale (per-item, dynamic).
  const languages = Object.fromEntries(
    routing.locales.map((l) => [l, `${BASE_URL}/${l}/deal/${params.slug}`]),
  );
  return {
    title: `${deal.productName} · ${formatDiscount(deal.discountPercent)} · DealRadar`,
    description: `${deal.productName} — ${sale} (${was}) · ${deal.shopName}`,
    alternates: {
      canonical: `${BASE_URL}/${params.locale}/deal/${params.slug}`,
      languages: { ...languages, 'x-default': `${BASE_URL}/${routing.defaultLocale}/deal/${params.slug}` },
    },
  };
}

export default async function DealDetailPage({ params }: Props) {
  setRequestLocale(params.locale);
  const deal = await getDeal(params.slug);
  if (!deal) notFound();
  const t = await getTranslations('deal');

  const affiliateUrl = decorateAffiliateUrl(deal.shopUrl, deal.source, deal.country, deal.category, deal.productId);
  const pw = priceWindow(deal);
  const dealUrl = `${BASE_URL}/${params.locale}/deal/${params.slug}`;

  // [FR-GEO-1 / P-3] Product + AggregateOffer + itemCondition — built per-item from the deal record.
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: deal.productName,
    image: deal.imageUrl ? [deal.imageUrl] : [],
    description: `${deal.productName} — ${deal.shopName}`,
    ...(deal.brand ? { brand: { '@type': 'Brand', name: deal.brand } } : {}),
    ...(deal.eanCode ? { gtin: deal.eanCode } : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: deal.currency,
      lowPrice: deal.salePrice.toFixed(2),
      highPrice: deal.originalPrice.toFixed(2),
      offerCount: 1,
      availability: 'https://schema.org/InStock',
      offers: [
        {
          '@type': 'Offer',
          price: deal.salePrice.toFixed(2),
          priceCurrency: deal.currency,
          availability: 'https://schema.org/InStock',
          itemCondition: 'https://schema.org/NewCondition',
          url: dealUrl,
          seller: { '@type': 'Organization', name: deal.shopName },
          priceSpecification: {
            '@type': 'PriceSpecification',
            price: deal.salePrice.toFixed(2),
            priceCurrency: deal.currency,
            valueAddedTaxIncluded: true,
          },
        },
      ],
    },
  };

  // [FR-GEO-2 / P-5] AI-scrapable proof fields — visible text, per-item, dynamic.
  const isLowest = deal.historicalLowPrice != null && deal.salePrice <= deal.historicalLowPrice;
  const lowText = deal.historicalLowPrice == null
    ? null
    : isLowest
      ? t('ninetyDayLow')
      : t('notLowestNote', { price: formatPrice(deal.historicalLowPrice, deal.currency, params.locale) });
  const verifiedTime = new Date(deal.lastUpdated).toLocaleTimeString(params.locale, {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="mb-4">
        <Link href={`/${params.locale}`} className="text-sm text-zinc-500 hover:underline">
          &larr; {t('backToDeals')}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-white p-6 shadow-sm">
          {deal.imageUrl ? (
            <Image src={deal.imageUrl} alt={deal.productName} fill priority className="object-contain" />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400">—</div>
          )}
          <Badge variant="deal" className="absolute left-4 top-4 text-lg">
            {formatDiscount(deal.discountPercent)}
          </Badge>
        </div>

        <div className="flex flex-col justify-between">
          <div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-accent">{deal.shopName}</div>
            <h1 className="mb-4 text-2xl font-bold text-zinc-900 md:text-3xl">{deal.productName}</h1>

            <div className="mb-4 flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-zinc-900">
                {formatPrice(deal.salePrice, deal.currency, params.locale)}
              </span>
              <span className="text-lg text-zinc-400 line-through">
                {formatPrice(deal.originalPrice, deal.currency, params.locale)}
              </span>
            </div>

            {/* Proof fields (visible, not sr-only) */}
            <div className="mb-6 space-y-1 text-sm">
              {lowText && (
                <p className={isLowest ? 'font-semibold text-deal' : 'text-zinc-600'}>{lowText}</p>
              )}
              <p className="text-zinc-500">{t('verifiedAt', { time: verifiedTime })}</p>
            </div>

            <div className="mb-6">
              <PriceHeatBar
                window={pw}
                currency={deal.currency}
                locale={params.locale}
                captionLabel={t('priceHistoryTitle')}
                todayLabel={t('today')}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-4">
            <div className="flex items-center gap-2">
              <SponsoredBadge />
            </div>
            <a
              href={affiliateUrl}
              target="_blank"
              rel="noopener noreferrer nofollow sponsored"
              className="flex h-12 w-full items-center justify-center rounded-lg bg-accent font-semibold text-white transition hover:opacity-90"
            >
              {t('goToShop', { shop: deal.shopName })}
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
    </div>
  );
}
