import { MetadataRoute } from 'next';
import { getAllDealSlugs } from '@/lib/db/deals.repo';
import { CATEGORY_SLUGS } from '@/lib/providers/types';
import { LOCALES, routing } from '@/i18n/routing';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://dealradar.eu';

/** Per-URL hreflang map: every supported locale + x-default → default locale. */
function alternates(path: string) {
  const languages: Record<string, string> = {};
  for (const l of LOCALES) languages[l] = `${BASE_URL}/${l}${path}`;
  languages['x-default'] = `${BASE_URL}/${routing.defaultLocale}${path}`;
  return { languages };
}

function entry(
  path: string,
  opts: { changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number; lastModified?: Date },
): MetadataRoute.Sitemap[number] {
  return {
    // Canonical URL is the default-locale variant; alternates enumerate the rest.
    url: `${BASE_URL}/${routing.defaultLocale}${path}`,
    lastModified: opts.lastModified ?? new Date(),
    changeFrequency: opts.changeFrequency,
    priority: opts.priority,
    alternates: alternates(path),
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [];

  // Home + legal + category routes (one entry each, hreflang across all locales).
  routes.push(entry('', { changeFrequency: 'hourly', priority: 1.0 }));
  for (const page of ['imprint', 'privacy', 'terms']) {
    routes.push(entry(`/${page}`, { changeFrequency: 'monthly', priority: 0.3 }));
  }
  for (const cat of CATEGORY_SLUGS) {
    routes.push(entry(`/category/${cat}`, { changeFrequency: 'hourly', priority: 0.8 }));
  }

  // Every persisted deal across all partners/countries (slugs are globally unique).
  try {
    const deals = await getAllDealSlugs();
    for (const d of deals) {
      const lastModified = d.lastUpdated ? new Date(d.lastUpdated) : new Date();
      routes.push(
        entry(`/deal/${d.slug}`, {
          changeFrequency: 'daily',
          priority: 0.9,
          lastModified: Number.isNaN(lastModified.getTime()) ? new Date() : lastModified,
        }),
      );
    }
  } catch (e) {
    console.error('[sitemap] Error generating deal routes:', e);
  }

  return routes;
}
