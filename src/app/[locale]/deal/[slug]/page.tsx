import { cache } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { getDealBySlug } from '@/lib/db/deals.repo';
import { formatPrice, formatDiscount } from '@/lib/utils/format';
import { decorateAffiliateUrl } from '@/lib/utils/affiliate';
import { priceWindow } from '@/lib/utils/price-history';
import { queryPriceHistory } from '@/lib/db/price-history.repo';
import Image from 'next/image';
import { PriceAlertButton } from '@/components/deals/PriceAlertButton';
import { PriceHeatBar } from '@/components/deals/PriceHeatBar';
import { DealGallery } from '@/components/deals/DealGallery';
import { DealDescription } from '@/components/deals/DealDescription';
import { SponsoredBadge } from '@/components/deals/SponsoredBadge';
import { productGallery } from '@/lib/utils/product-details';
import { Badge } from '@/components/ui/badge';
import { routing } from '@/i18n/routing';
import { siteUrl } from '@/lib/utils/site-url';
import { gaItem, gaItemAttr } from '@/lib/analytics/items';
import { TrackViewItem } from '@/components/analytics/TrackView';
import { matchSubCategory } from '@/lib/categories';
import { categoryTerm } from '@/lib/categories-i18n';

// Always render from live data — like the category/search pages. Without this
// Next caches the Supabase fetches, so the daily price verifier's updates (and
// gallery enrichment) would not appear until the next deploy: stale prices.
export const dynamic = 'force-dynamic';

interface Props {
  readonly params: { readonly locale: string; readonly slug: string };
}

const BASE_URL = siteUrl();

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
  const tCat = await getTranslations('categories');

  const affiliateUrl = decorateAffiliateUrl(deal.shopUrl, deal.source, deal.country, deal.category, deal.productId);
  // Recorded daily prices widen the window: low = recorded minimum, so the
  // today-dot sits at its true position instead of pinned at the green end.
  // Best-effort — on any DB error the graph keeps its honest two-point fallback.
  const history = await queryPriceHistory(deal.productId).catch(() => []);
  const pw = priceWindow(deal, history.map((p) => p.salePrice));
  const dealUrl = `${BASE_URL}/${params.locale}/deal/${params.slug}`;

  // [FR-GEO-1 / P-3] Product + single Offer + itemCondition — built per-item from
  // the deal record. A single-seller deal is a plain Offer, not an AggregateOffer
  // (which models multiple sellers and triggers Search Console warnings at offerCount:1).
  const gallery = productGallery(deal);
  const jsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: deal.productName,
    // Full-res gallery (un-proxied), not the 200×200 productserve thumbnail.
    image: gallery,
    // [FR-SEO-2 / FR-PDP-7] The real feed description when present — the
    // synthetic name+shop string is only the empty-description fallback.
    description: deal.description || `${deal.productName} — ${deal.shopName}`,
    ...(deal.brand ? { brand: { '@type': 'Brand', name: deal.brand } } : {}),
    ...(deal.eanCode ? { gtin: deal.eanCode } : {}),
    ...(deal.mpn ? { mpn: deal.mpn } : {}),
    offers: {
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
  };

  // [FR-GEO-2 / P-5] AI-scrapable proof fields — visible text, per-item, dynamic.
  const isLowest = deal.historicalLowPrice != null && deal.salePrice <= deal.historicalLowPrice;
  let lowText: string | null = null;
  if (deal.historicalLowPrice != null) {
    lowText = isLowest
      ? t('ninetyDayLow')
      : t('notLowestNote', { price: formatPrice(deal.historicalLowPrice, deal.currency, params.locale) });
  }
  const verifiedTime = new Date(deal.lastUpdated).toLocaleTimeString(params.locale, {
    timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit',
  });

  // Breadcrumb trail: Home › category › subcategory (no product-name crumb) —
  // the visible answer to "which category is this deal in". The subcategory is
  // derived by matching the product name against the category tree's leaf
  // search terms (same mechanism as the category menu), and links to that
  // leaf's search so the crumb lists similar products. Skipped when nothing
  // matches.
  const categoryLabel = tCat(deal.category);
  const sub = matchSubCategory(deal.category, deal.productName);
  const subCrumb = sub
    ? {
        label: categoryTerm(sub.name, params.locale),
        href: `/${params.locale}/search?category=${deal.category}&q=${encodeURIComponent(sub.leaf)}`,
      }
    : null;
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org/',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('breadcrumbHome'), item: `${BASE_URL}/${params.locale}` },
      { '@type': 'ListItem', position: 2, name: categoryLabel, item: `${BASE_URL}/${params.locale}/category/${deal.category}` },
      ...(subCrumb ? [{ '@type': 'ListItem', position: 3, name: subCrumb.label, item: `${BASE_URL}${subCrumb.href}` }] : []),
    ],
  };

  // Escape `<` so a feed value containing `</script>` (productName/shopName come
  // from third-party affiliate feeds) can't break out of the JSON-LD block — XSS.
  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, '\\u003c');
  const breadcrumbJsonLdHtml = JSON.stringify(breadcrumbJsonLd).replace(/</g, '\\u003c');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <TrackViewItem item={gaItem(deal)} currency={deal.currency} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbJsonLdHtml }} />
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-zinc-500">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href={`/${params.locale}`} className="hover:underline">
              {t('breadcrumbHome')}
            </Link>
          </li>
          <li aria-hidden>›</li>
          <li>
            <Link href={`/${params.locale}/category/${deal.category}`} className="hover:underline">
              {categoryLabel}
            </Link>
          </li>
          {subCrumb && (
            <>
              <li aria-hidden>›</li>
              <li>
                <Link href={subCrumb.href} className="hover:underline">
                  {subCrumb.label}
                </Link>
              </li>
            </>
          )}
        </ol>
      </nav>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Real multi-image gallery (full-res merchant photos), as the retired modal had. */}
        <DealGallery
          images={gallery}
          alt={deal.productName}
          badge={
            <Badge variant="deal" className="absolute left-4 top-4 text-lg">
              {formatDiscount(deal.discountPercent)}
            </Badge>
          }
        />

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
              data-analytics-event="cta_go_to_deal"
              data-analytics-source="pdp"
              data-analytics-list="pdp"
              data-analytics-item={gaItemAttr(deal)}
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

      {/* Product details: merchant-captured HTML (sanitized in DealDescription)
          with the plain feed description as fallback. */}
      {(deal.descriptionHtml || deal.description) && (
        <section className="mt-10 border-t border-zinc-100 pt-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">{t('details')}</h2>
          <div className="max-w-3xl">
            <DealDescription html={deal.descriptionHtml} text={deal.description} />
          </div>
        </section>
      )}

      {/* Real identifiers only — no fabricated spec rows (FR-PDP-6). */}
      {(deal.brand || deal.modelNumber || deal.mpn || deal.eanCode) && (
        <section className="mt-10 border-t border-zinc-100 pt-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">{t('specsTitle')}</h2>
          <dl className="grid max-w-md grid-cols-[auto,1fr] gap-x-8 gap-y-2 text-sm">
            {deal.brand && (
              <>
                <dt className="text-zinc-500">{t('specBrand')}</dt>
                <dd className="text-zinc-900">{deal.brand}</dd>
              </>
            )}
            {(deal.modelNumber || deal.mpn) && (
              <>
                <dt className="text-zinc-500">{t('specModel')}</dt>
                <dd className="text-zinc-900">{deal.modelNumber || deal.mpn}</dd>
              </>
            )}
            {deal.eanCode && (
              <>
                <dt className="text-zinc-500">{t('specEan')}</dt>
                <dd className="text-zinc-900">{deal.eanCode}</dd>
              </>
            )}
          </dl>
        </section>
      )}

      {/* The gallery's non-hero images at real size — the merchant feature
          graphics stored in `gallery` are unreadable as 64px thumbnails.
          Skipped when the captured description already embeds images. */}
      {!deal.descriptionHtml?.includes('<img') && gallery.length > 1 && (
        <section className="mt-10 border-t border-zinc-100 pt-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">{t('moreImages')}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {gallery.slice(1, 7).map((src) => (
              <Image
                key={src}
                src={src}
                alt={deal.productName}
                width={800}
                height={800}
                sizes="(max-width: 640px) 90vw, 448px"
                className="h-auto w-full rounded-xl border border-zinc-100 bg-white object-contain"
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
