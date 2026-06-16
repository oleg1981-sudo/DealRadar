import { formatPrice } from '@/lib/utils/format';
import type { PriceWindow } from '@/lib/utils/price-history';

/**
 * Price sparkline: the deal's 3-month price history drawn as a thin green→red
 * line, with a marker dot at today's price (the last point). Min/max of the
 * window are labelled below. Pure presentational server component — no client
 * JS, keeps the grid cheap.
 */

// SVG user-space coordinate system (stretched to fit via preserveAspectRatio).
const VB_W = 100;
const VB_H = 36;
const PAD_X = 3;
const PAD_Y = 6;

export function PriceHeatBar({
  window,
  series,
  currency,
  locale,
  captionLabel,
  todayLabel,
}: {
  window: PriceWindow;
  series: number[];
  currency: string;
  locale: string;
  captionLabel: string;
  todayLabel: string;
}) {
  const low = formatPrice(window.low, currency, locale);
  const high = formatPrice(window.high, currency, locale);
  const today = formatPrice(window.current, currency, locale);

  const span = window.high - window.low || 1;
  const last = series.length - 1;
  const x = (i: number) => PAD_X + (i / last) * (VB_W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + (1 - (v - window.low) / span) * (VB_H - 2 * PAD_Y);

  const points = series.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const line = `M${points.join(' L')}`;
  const area = `${line} L${x(last).toFixed(2)},${VB_H} L${x(0).toFixed(2)},${VB_H} Z`;

  // Today marker — last point, as a % so an HTML knob can sit over the stretched SVG.
  const markerLeft = (x(last) / VB_W) * 100;
  const markerTop = (y(window.current) / VB_H) * 100;

  return (
    <div className="mt-1 rounded-xl border border-zinc-200/70 bg-gradient-to-b from-white to-zinc-50/60 p-2 shadow-sm ring-1 ring-zinc-900/5">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        {captionLabel}
      </p>
      <div
        className="relative h-10 w-full"
        role="img"
        aria-label={`${captionLabel}: ${low} – ${high}. ${todayLabel}: ${today}.`}
      >
        <svg
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <linearGradient id="phb-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#16a34a" />
              <stop offset="55%" stopColor="#eab308" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
            <linearGradient id="phb-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#phb-area)" />
          <path
            d={line}
            fill="none"
            stroke="url(#phb-stroke)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {/* Today marker — a small knob over the last point. */}
        <span
          className="absolute z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-white shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
          style={{ left: `${markerLeft}%`, top: `${markerTop}%` }}
          title={`${todayLabel}: ${today}`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums">
        <span className="font-medium text-green-600">{low}</span>
        <span className="font-medium text-red-600">{high}</span>
      </div>
    </div>
  );
}
