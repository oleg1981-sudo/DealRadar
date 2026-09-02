'use client';

/** Header location indicator + dropdown: country + language.
 *
 *  The language selector lives here rather than as its own control. It used to
 *  sit in the header on desktop and — because that copy is `sm:hidden` — at the
 *  very BOTTOM of the page on mobile, where nobody finds it. One dropdown for
 *  "where am I / what language" is the same mental model and one control on
 *  every viewport.
 *
 *  It replaced the free-text CITY field, which had no effect: every deal row is
 *  country-wide (`city IS NULL` for all 45k rows), so the city filter could
 *  never match anything. Removing it drops a control that silently did nothing.
 */
import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { LOCALES } from '@/i18n/routing';
import { MapPin, ChevronDown } from 'lucide-react';
import { COUNTRIES, countryInfo, countryName } from '@/lib/geo/countries';
import { useLocation } from './LocationContext';
import { persistLocation } from '@/lib/geo/resolve';
import { Button } from '@/components/ui/button';
import type { CountryCode } from '@/lib/providers/types';

/** Endonyms — a language is always listed in its own language, so a visitor who
 *  cannot read the current UI language can still find theirs. */
const LOCALE_LABELS: Record<string, string> = {
  en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', it: 'Italiano',
  pl: 'Polski', nl: 'Nederlands', pt: 'Português', sv: 'Svenska', ro: 'Română',
  da: 'Dansk', fi: 'Suomi', no: 'Norsk',
};

export function LocationPicker() {
  const t = useTranslations('geo');
  const locale = useLocale();
  const pathname = usePathname();
  const { location, setLocation } = useLocation();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<CountryCode>(location.country);
  const [lang, setLang] = useState<string>(locale);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        // The visible text span is display:none below sm — without a label the
        // button has NO accessible name on mobile (Lighthouse a11y + agentic
        // failure, audit/2026-07-15). Keep the label on all viewports so the
        // announced name stays stable across breakpoints.
        aria-label={t('changeLocation')}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
      >
        <MapPin className="h-4 w-4 text-accent" aria-hidden />
        <span className="hidden sm:inline">
          {location.country} · {LOCALE_LABELS[locale] ?? locale}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t('changeLocation')}
          className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-zinc-200 bg-white p-3 shadow-card-hover"
        >
          <label className="text-xs font-medium text-zinc-500" htmlFor="lp-country">
            {t('country')}
          </label>
          <select
            id="lp-country"
            value={country}
            onChange={(e) => {
              const next = e.target.value as CountryCode;
              setCountry(next);
              // Pre-select that country's usual language as a sensible default;
              // the user can still override it in the field below before applying.
              setLang(countryInfo(next).locale);
            }}
            className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{countryName(c.code, locale)}</option>
            ))}
          </select>

          <label className="mt-3 block text-xs font-medium text-zinc-500" htmlFor="lp-language">
            {t('language')}
          </label>
          <select
            id="lp-language"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>{LOCALE_LABELS[l] ?? l}</option>
            ))}
          </select>

          <Button
            className="mt-3 w-full"
            size="sm"
            onClick={() => {
              // city is no longer settable, so don't keep persisting a stale one:
              // stored state should match what the UI can actually express.
              const loc = { country, city: null, via: 'stored' as const };
              setOpen(false);
              if (lang !== locale) {
                // setLocation reloads the CURRENT locale, so persist first and
                // hard-navigate to the chosen one instead.
                persistLocation(loc);
                window.location.assign(`/${lang}${pathname === '/' ? '' : pathname}${window.location.search}`);
              } else {
                setLocation(loc);
              }
            }}
          >
            {t('apply')}
          </Button>
        </div>
      )}
    </div>
  );
}
