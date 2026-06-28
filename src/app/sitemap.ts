import { MetadataRoute } from 'next';
import { fetchDealsAcrossProviders } from '@/lib/providers/registry';
import { SUPPORTED_COUNTRIES, CATEGORY_SLUGS } from '@/lib/providers/types';
import { slugify } from '@/lib/utils/slug';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://dealradar.eu';
  const locales = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pl', 'pt', 'se', 'ro', 'no', 'da', 'fi'];

  const routes: MetadataRoute.Sitemap = [];

  // Static home & legal routes
  for (const locale of locales) {
    routes.push({
      url: `${baseUrl}/${locale}`,
      lastModified: new Date(),
      changeFrequency: 'hourly',
      priority: 1.0,
    });
    for (const page of ['imprint', 'privacy', 'terms']) {
      routes.push({
        url: `${baseUrl}/${locale}/${page}`,
        lastModified: new Date(),
        changeFrequency: 'monthly',
        priority: 0.3,
      });
    }
    for (const cat of CATEGORY_SLUGS) {
      routes.push({
        url: `${baseUrl}/${locale}/category/${cat}`,
        lastModified: new Date(),
        changeFrequency: 'hourly',
        priority: 0.8,
      });
    }
  }

  // Active deal routes
  try {
    const deals = await fetchDealsAcrossProviders({ country: 'DE', limit: 200 });
    for (const deal of deals) {
      const dealSlug = deal.slug || slugify(deal.productName);
      for (const locale of locales) {
        routes.push({
          url: `${baseUrl}/${locale}/deal/${dealSlug}`,
          lastModified: new Date(deal.lastUpdated),
          changeFrequency: 'daily',
          priority: 0.9,
        });
      }
    }
  } catch (e) {
    console.error('[sitemap] Error generating deal routes:', e);
  }

  return routes;
}
