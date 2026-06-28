import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { HeroDeals } from '@/components/home/HeroDeals';
import { DealGridSkeleton } from '@/components/deals/DealGridSkeleton';
import { parseLocationCookie, LOCATION_COOKIE } from '@/lib/geo/resolve';
import { DEFAULT_COUNTRY } from '@/lib/geo/countries';

export const dynamic = 'force-dynamic'; // location cookie → per-request render

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const cookieStore = await cookies();
  const loc = parseLocationCookie(cookieStore.get(LOCATION_COOKIE)?.value);

  return (
    <Suspense fallback={<DealGridSkeleton count={12} />}>
      <HeroDeals country={loc?.country ?? DEFAULT_COUNTRY} city={loc?.city ?? null} />
    </Suspense>
  );
}
