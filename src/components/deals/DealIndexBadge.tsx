'use client';

import { useLocale, useTranslations } from 'next-intl';

/**
 * Deal-Index ring — the 0–10 buy-timing score on a card corner. The arc fills
 * with the score and sweeps red (0, bad time) → amber (5) → green (10, best
 * time). Sits on the white product-image area, so the chip keeps a light
 * frosted background in both themes. Hover/focus opens a popover card (styled
 * like the site's dropdowns, z-40 ladder) instead of a native title line;
 * the full sentence stays on aria-label for screen readers.
 */
const R = 15.5;
const CIRC = 2 * Math.PI * R;

export function DealIndexBadge({ score }: { score: number }) {
  const t = useTranslations('deal');
  const locale = useLocale();
  const s = Math.min(10, Math.max(0, score));
  // Piecewise hue so the midpoint reads as "meh", not already green:
  // 0 → 4° red, 5 → 45° amber, 10 → 142° green.
  const hue = s <= 5 ? 4 + (s / 5) * 41 : 45 + ((s - 5) / 5) * 97;
  const color = `hsl(${hue.toFixed(0)}, 78%, ${(38 + s * 0.6).toFixed(0)}%)`;
  const scoreText = s.toLocaleString(locale, { maximumFractionDigits: 1 });

  return (
    <span className="group/di absolute right-2 top-2 z-10 block h-10 w-10">
      <span
        aria-label={t('dealIndexTooltip', { score: scoreText })}
        className="grid h-full w-full place-items-center rounded-full bg-white/90 shadow-sm ring-1 ring-black/5 backdrop-blur-sm"
      >
        <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r={R} fill="none" strokeWidth="2.5" className="stroke-zinc-200" />
          <circle
            cx="18" cy="18" r={R} fill="none" strokeWidth="2.5" strokeLinecap="round"
            stroke={color}
            strokeDasharray={`${((s / 10) * CIRC).toFixed(2)} ${CIRC.toFixed(2)}`}
          />
        </svg>
        <span className="relative text-[11px] font-semibold leading-none tabular-nums" style={{ color }}>
          {scoreText}
        </span>
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute right-0 top-full z-40 mt-2 block w-44 rounded-lg border border-zinc-200 bg-white p-3 text-left opacity-0 shadow-card-hover transition-opacity duration-150 group-hover/di:visible group-hover/di:opacity-100"
      >
        <span className="block text-xs font-semibold" style={{ color }}>
          {t('dealIndex')} {scoreText}/10
        </span>
        <span className="mt-1 block text-[11px] font-normal leading-snug text-zinc-600">
          {t('dealIndexHint')}
        </span>
      </span>
    </span>
  );
}
