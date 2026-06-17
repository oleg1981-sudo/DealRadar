import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { routing, type Locale } from '@/i18n/routing';
import { Header } from '@/components/layout/Header';
import { CategoryMenu } from '@/components/layout/CategoryMenu';
import { HeroBanner } from '@/components/home/HeroBanner';
import { HomeOnly } from '@/components/home/HomeOnly';
import { Footer } from '@/components/layout/Footer';
import { LocationProvider } from '@/components/layout/LocationContext';
import { CookieBanner } from '@/components/gdpr/CookieBanner';
import { GeoConsentPrompt } from '@/components/gdpr/GeoConsentPrompt';
import { parseLocationCookie, LOCATION_COOKIE } from '@/lib/geo/resolve';
import { initProviders } from '@/lib/providers/registry';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'DealRadar — best local deals across Europe', template: '%s · DealRadar' },
  description: 'Geo-located European price comparison: the biggest discounts from local shops, by category.',
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale);

  // Log mock-provider warnings once per server process, visibly at startup.
  await initProviders();

  const messages = await getMessages();
  const cookieStore = await cookies();
  const initialLocation = parseLocationCookie(cookieStore.get(LOCATION_COOKIE)?.value);

  return (
    <html lang={locale} className={inter.variable}>
      <body className="font-sans">
        <NextIntlClientProvider messages={messages}>
          <LocationProvider initial={initialLocation}>
            <Header />
            <HomeOnly>
              <HeroBanner locale={locale} />
            </HomeOnly>
            <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-8">
              <CategoryMenu />
              {children}
            </main>
            <Footer />
            <GeoConsentPrompt />
            <CookieBanner />
          </LocationProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
