/** Supported countries: display names, default locale and currency per country. */
import type { CountryCode } from '../providers/types';

export interface CountryInfo {
  code: CountryCode;
  name: string;       // English name; render via countryName() to localise it
  locale: string;     // default UI locale for this country
  currency: string;   // ISO 4217
}

export const COUNTRIES: CountryInfo[] = [
  { code: 'DE', name: 'Germany',        locale: 'de', currency: 'EUR' },
  { code: 'AT', name: 'Austria',        locale: 'de', currency: 'EUR' },
  { code: 'FR', name: 'France',         locale: 'fr', currency: 'EUR' },
  { code: 'ES', name: 'Spain',          locale: 'es', currency: 'EUR' },
  { code: 'IT', name: 'Italy',          locale: 'it', currency: 'EUR' },
  { code: 'PL', name: 'Poland',         locale: 'pl', currency: 'PLN' },
  { code: 'NL', name: 'Netherlands',    locale: 'nl', currency: 'EUR' },
  { code: 'PT', name: 'Portugal',       locale: 'pt', currency: 'EUR' },
  { code: 'SE', name: 'Sweden',         locale: 'sv', currency: 'SEK' },
  { code: 'RO', name: 'Romania',        locale: 'ro', currency: 'RON' },
  { code: 'GB', name: 'United Kingdom', locale: 'en', currency: 'GBP' },
  { code: 'BE', name: 'Belgium',        locale: 'nl', currency: 'EUR' },
  { code: 'DK', name: 'Denmark',        locale: 'da', currency: 'DKK' },
  { code: 'FI', name: 'Finland',        locale: 'fi', currency: 'EUR' },
  { code: 'NO', name: 'Norway',         locale: 'no', currency: 'NOK' },
  { code: 'CH', name: 'Switzerland',    locale: 'de', currency: 'CHF' },
];

export const DEFAULT_COUNTRY: CountryCode = 'DE';

/**
 * Markets whose deals may be user-visible/crawlable (i.e. sitemap-eligible).
 * Mirrors the owner's `legal_cleared` gate per market
 * (docs/specs/multi-market-activation/2026-07-23_v1/spec.md §4.7, §6).
 * Extend only when the owner explicitly flips a market's legal_cleared status.
 */
export const SITEMAP_ACTIVE_COUNTRIES: CountryCode[] = ['DE'];

/**
 * How many deal URLs the sitemap advertises. THE dial for crawl budget.
 *
 * Search Console (2026-09-09): 28,055 URLs "Discovered - currently not indexed"
 * and indexed pages falling 5,443 -> 2,850 with ~0 impressions. Asking a
 * 3-month-old domain to index ~32k URLs spreads a small crawl allowance across
 * thin, duplicated pages and none of it lands. Publishing a smaller, genuinely
 * good set concentrates that allowance.
 *
 * Raise it as indexation recovers — when Search Console shows most of these
 * indexed (say 1,800 of 2,000), go to 5,000, then higher. Ranking + diversity
 * live in the `sitemap_deals` SQL function; this is only the cap.
 */
export const SITEMAP_MAX_DEAL_URLS = 2000;

export function isSupportedCountry(code: string): code is CountryCode {
  return COUNTRIES.some((c) => c.code === code);
}

export function countryInfo(code: CountryCode): CountryInfo {
  return COUNTRIES.find((c) => c.code === code)!;
}

/** Cached per locale — the dropdown renders all 16 countries on every open. */
const displayNamesByLocale = new Map<string, Intl.DisplayNames | null>();

/**
 * Country name in the reader's language ("Deutschland" for `DE` under `de`).
 *
 * `CountryInfo.name` stays the English source of truth; `Intl.DisplayNames`
 * supplies every other locale, so adding a country or a locale needs no
 * translation table. Falls back to the English name whenever the runtime has no
 * data for the pair — `.of()` returns the raw code in that case.
 */
export function countryName(code: CountryCode, locale: string): string {
  const fallback = countryInfo(code).name;
  if (!displayNamesByLocale.has(locale)) {
    try {
      displayNamesByLocale.set(locale, new Intl.DisplayNames([locale], { type: 'region' }));
    } catch {
      displayNamesByLocale.set(locale, null); // invalid/unsupported locale tag
    }
  }
  const localized = displayNamesByLocale.get(locale)?.of(code);
  return localized && localized !== code ? localized : fallback;
}
