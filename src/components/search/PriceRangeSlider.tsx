'use client';
/** Dual-thumb price range using two native range inputs — accessible, tiny. */
import { useTranslations } from 'next-intl';

export function PriceRangeSlider({
  min, max, value, onChange,
}: {
  min: number; max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const t = useTranslations('filters');
  const [lo, hi] = value;
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-medium text-gray-500">{t('priceRange')}</legend>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="price-min">{t('minPrice')}</label>
        <input id="price-min" type="range" min={min} max={max} value={lo}
          onChange={(e) => onChange([Math.min(Number(e.target.value), hi), hi])}
          className="w-full accent-accent" />
        <label className="sr-only" htmlFor="price-max">{t('maxPrice')}</label>
        <input id="price-max" type="range" min={min} max={max} value={hi}
          onChange={(e) => onChange([lo, Math.max(Number(e.target.value), lo)])}
          className="w-full accent-accent" />
      </div>
      <p className="mt-1 text-xs text-gray-500">{lo} – {hi}</p>
    </fieldset>
  );
}
