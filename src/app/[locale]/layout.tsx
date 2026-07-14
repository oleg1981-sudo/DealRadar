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
import { CookieConsentProvider } from '@/components/consent/CookieConsent';
import { Analytics } from '@/components/analytics/Analytics';
import { GeoConsentPrompt } from '@/components/gdpr/GeoConsentPrompt';
import { parseLocationCookie, LOCATION_COOKIE } from '@/lib/geo/resolve';
import { initProviders } from '@/lib/providers/registry';
import { siteUrl } from '@/lib/utils/site-url';
import '../globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: 'DealRadar — best local deals across Europe', template: '%s · DealRadar' },
  description: 'Geo-located European price comparison: the biggest discounts from local shops, by category.',
  openGraph: {
    siteName: 'DealRadar',
    type: 'website',
    // Square brand mark (828×828) — accepted by OG consumers and AI answer
    // engines; PDPs override with product imagery where available.
    images: [{ url: '/dealradar-logo.png', width: 828, height: 828, alt: 'DealRadar — European deal radar logo' }],
  },
  twitter: {
    card: 'summary',
    images: ['/dealradar-logo.png'],
  },
};

// Brand-entity signal for search/answer engines (GEO/AEO): one Organization
// node, logo + canonical URL, rendered on every page.
const ORG_JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'DealRadar',
  url: siteUrl(),
  logo: `${siteUrl()}/dealradar-logo.png`,
}).replace(/</g, '\\u003c');

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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ORG_JSONLD }} />
        <NextIntlClientProvider messages={messages}>
          <LocationProvider initial={initialLocation}>
            <Header />
            <HomeOnly>
              <HeroBanner />
            </HomeOnly>
            <main className="mx-auto min-h-[60vh] max-w-7xl px-4 py-8">
              <CategoryMenu />
              {children}
            </main>
            <Footer />
            <GeoConsentPrompt />
            <CookieConsentProvider />
            <Analytics />
          </LocationProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
