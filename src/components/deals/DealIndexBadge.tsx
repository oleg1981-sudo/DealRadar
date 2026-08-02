'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

/**
 * Deal-Index ring — the 0–10 buy-timing score on a card corner. The arc fills
 * with the score and sweeps red (0, bad time) → amber (5) → green (10, best
 * time). Sits on the white product-image area, so the chip keeps a light
 * frosted background in both themes.
 *
 * A real <button> rendered as a SIBLING of the card's image link (never inside
 * it — nested interactive elements are invalid HTML, and on touch screens the
 * tap must open the explainer, not navigate to the product). Desktop keeps the
 * pure-CSS hover popover; tap/click/Enter toggles it and an outside tap or
 * Escape closes it.
 */
const R = 15.5;
const CIRC = 2 * Math.PI * R;

export function DealIndexBadge({ score }: { score: number }) {
  const t = useTranslations('deal');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const s = Math.min(10, Math.max(0, score));
  // Piecewise hue so the midpoint reads as "meh", not already green:
  // 0 → 4° red, 5 → 45° amber, 10 → 142° green.
  const hue = s <= 5 ? 4 + (s / 5) * 41 : 45 + ((s - 5) / 5) * 97;
  const color = `hsl(${hue.toFixed(0)}, 78%, ${(38 + s * 0.6).toFixed(0)}%)`;
  const scoreText = s.toLocaleString(locale, { maximumFractionDigits: 1 });

  return (
    <span ref={rootRef} className="group/di absolute right-2 top-2 z-10 block h-10 w-10">
      <button
        type="button"
        aria-expanded={open}
        aria-label={t('dealIndexTooltip', { score: scoreText })}
        onClick={() => setOpen((v) => !v)}
        className="grid h-full w-full cursor-help place-items-center rounded-full bg-white/90 shadow-sm ring-1 ring-black/5 backdrop-blur-sm"
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
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute right-0 top-full z-40 mt-2 block w-44 rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-card-hover transition-opacity duration-150 ${
          open ? 'visible opacity-100' : 'invisible opacity-0 group-hover/di:visible group-hover/di:opacity-100'
        }`}
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
