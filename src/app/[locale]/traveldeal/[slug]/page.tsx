// TravelDeal category landing — "coming soon" until a travel feed is ingesting.
//
// The menu links used to point at /search, which returned an empty result page:
// technically fine, but it reads as "this site is broken" rather than "this is
// not live yet". A deliberate placeholder is honest and costs nothing.
//
// Replace this page with a real listing once AWIN travel or the TourRadar
// Distribution API is feeding rows — the URLs stay the same.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Image from 'next/image';
import { Link } from '@/i18n/routing';
import { categoryTerm } from '@/lib/categories-i18n';
import { findTravelBySlug, TRAVEL_GROUPS, travelSlug } from '@/lib/travel-categories';
import { TravelNotifyForm } from '@/components/travel/TravelNotifyForm';

/** Static: the content depends only on the slug and the locale. */
export const dynamic = 'force-static';

export function generateStaticParams() {
  return TRAVEL_GROUPS.flatMap((g) => [
    { slug: travelSlug(g.name) },
    ...g.children.map((c) => ({ slug: travelSlug(c.name) })),
  ]);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const match = findTravelBySlug(slug);
  if (!match) return {};
  const t = await getTranslations({ locale, namespace: 'travelDeal' });
  const name = categoryTerm(match.name, locale);
  return {
    title: `${name} — ${t('comingSoon')}`,
    // No inventory yet, so there is nothing worth indexing. Keeping these out
    // of the index avoids a burst of thin pages across 13 locales, which is
    // exactly the kind of thing that costs an SEO site rankings. Remove this
    // once the pages list real deals.
    robots: { index: false, follow: true },
  };
}

export default async function TravelDealComingSoon({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const match = findTravelBySlug(slug);
  if (!match) notFound();

  const t = await getTranslations('travelDeal');
  const name = categoryTerm(match.name, locale);

  return (
    <section className="mx-auto max-w-2xl py-14 text-center">
      {/* Decorative only: the heading below already names the section, so alt=""
          keeps a screen reader from announcing a redundant "cruise ship".
          `priority` because it is the largest element above the fold here. */}
      <Image
        src="/travel/cruise-ship.png"
        alt=""
        width={1001}
        height={180}
        priority
        className="mx-auto mb-8 h-auto w-full max-w-lg"
      />

      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{name}</h1>

      <p className="mt-3 inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-800">
        {t('comingSoon')}
      </p>

      <p className="mx-auto mt-5 max-w-md text-zinc-600">{t('comingSoonBody')}</p>

      <TravelNotifyForm sourceSlug={slug} />

      <Link
        href="/"
        className="mt-8 inline-flex h-11 items-center rounded-lg border border-zinc-200 px-5 text-sm font-medium text-zinc-700 transition-colors hover:border-accent/40 hover:text-accent"
      >
        {t('browseDeals')}
      </Link>
    </section>
  );
}
