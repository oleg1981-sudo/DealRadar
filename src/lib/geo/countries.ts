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
