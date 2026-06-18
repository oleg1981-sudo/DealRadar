'use client';

/** Header location indicator + "change location" dropdown (country + city input). */
import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from '@/i18n/routing';
import { MapPin, ChevronDown } from 'lucide-react';
import { COUNTRIES, countryInfo } from '@/lib/geo/countries';
import { useLocation } from './LocationContext';
import { persistLocation } from '@/lib/geo/resolve';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { CountryCode } from '@/lib/providers/types';

export function LocationPicker() {
  const t = useTranslations('geo');
  const locale = useLocale();
  const pathname = usePathname();
  const { location, setLocation } = useLocation();
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState<CountryCode>(location.country);
  const [city, setCity] = useState(location.city ?? '');
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
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100"
      >
        <MapPin className="h-4 w-4 text-accent" aria-hidden />
        <span className="hidden sm:inline">
          {location.city ? `${location.city}, ` : ''}
          {location.country}
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
            onChange={(e) => setCountry(e.target.value as CountryCode)}
            className="mt-1 h-10 w-full rounded-lg border border-zinc-200 bg-white px-2 text-sm"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>

          <label className="mt-3 block text-xs font-medium text-zinc-500" htmlFor="lp-city">
            {t('cityOptional')}
          </label>
          <Input
            id="lp-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t('cityPlaceholder')}
            className="mt-1"
          />

          <Button
            className="mt-3 w-full"
            size="sm"
            onClick={() => {
              const loc = { country, city: city.trim() || null, via: 'stored' as const };
              const target = countryInfo(country).locale;
              setOpen(false);
              if (target !== locale) {
                // Country drives the language: persist the location, then reload
                // into that country's locale. (setLocation reloads the *current*
                // locale, so hard-navigate to the new one instead; the user can
                // still switch language afterward via the language switcher.)
                persistLocation(loc);
                window.location.assign(`/${target}${pathname === '/' ? '' : pathname}${window.location.search}`);
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
