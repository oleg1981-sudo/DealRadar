import { formatPrice } from '@/lib/utils/format';
import type { PriceWindow, PriceSeries } from '@/lib/utils/price-history';

/**
 * Price cardiogram. Price is the vertical axis — expensive at the top (red),
 * cheap at the bottom (green). Two modes:
 *  - recorded `series` (non-synthetic, ≥2 points, last = today): a
 *    chronological curve, dot on the last (= today's) point, captioned as
 *    price history.
 *  - no `series`, or the synthetic compare-at fallback: a straight line across
 *    the window with the dot at today's position — captioned/announced as a
 *    price RANGE, never as measured history [FR-4.4,
 *    docs/specs/pdp-full-content].
 */
const VB_W = 100;
const VB_H = 40;
const PAD_X = 2;
const PAD_Y = 4;

export function PriceHeatBar({
  window,
  series,
  currency,
  locale,
  captionLabel,
  rangeCaptionLabel,
  todayLabel,
}: {
  window: PriceWindow;
  /** priceSeries() output. Omitted or synthetic → range mode. */
  series?: PriceSeries;
  currency: string;
  locale: string;
  /** Caption for genuinely recorded history (chronological mode). */
  captionLabel: string;
  /** Caption when the line is only the low–high window (range mode). */
  rangeCaptionLabel: string;
  todayLabel: string;
}) {
  const low = formatPrice(window.low, currency, locale);
  const high = formatPrice(window.high, currency, locale);
  const today = formatPrice(window.current, currency, locale);

  // Chronological mode plots the recorded curve oldest → newest. The fallback
  // draws cheapest → dearest, left to right (and bottom → top on the price
  // axis), so the line runs from the green bottom-left up to the red top-right.
  // A recorded series whose points are all the SAME price carries no shape: it
  // renders as a flat line pinned to the axis floor while the axis top (the
  // compare-at reference) is never touched — which reads as a broken chart. A
  // freshly-tracked deal looks exactly like that until its price first moves.
  // Until there is real variation the honest, informative view is the range
  // (reference → today), which also re-captions away from "history".
  const varies = series !== undefined && new Set(series.points).size > 1;
  const chronological = series !== undefined && !series.synthetic && series.points.length >= 2 && varies;
  const points = chronological ? series.points : [window.low, window.high];
  // Caption is mode-bound: a synthetic range must never read as history.
  const caption = chronological ? captionLabel : rangeCaptionLabel;
  const last = points.length - 1;
  const span = window.high - window.low || 1;
  const x = (i: number) => PAD_X + (i / last) * (VB_W - 2 * PAD_X);
  const y = (v: number) => PAD_Y + (1 - (v - window.low) / span) * (VB_H - 2 * PAD_Y); // high→top, low→bottom

  const pts = points.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(last).toFixed(2)},${VB_H} L${x(0).toFixed(2)},${VB_H} Z`;
  // Today's dot: on the curve's last point (chronological), or along the range
  // at today's price position (fallback). viewBox units 0–100 ≈ percent.
  const pos = Math.min(1, Math.max(0, window.position));
  const dotLeft = chronological ? x(last) : PAD_X + pos * (VB_W - 2 * PAD_X);
  const dotTop = (y(window.current) / VB_H) * 100;

  return (
    <div className="mt-1 rounded-xl border border-zinc-200/70 bg-gradient-to-b from-white to-zinc-50/60 p-2 shadow-sm ring-1 ring-zinc-900/5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{caption}</p>
        <p className="text-[10px] font-semibold tabular-nums text-zinc-600">
          {todayLabel} <span className="text-accent">{today}</span>
        </p>
      </div>
      <div className="flex h-12 gap-1.5">
        {/* Price axis: expensive (red) at top, cheap (green) at bottom. */}
        <div className="flex flex-col justify-between py-px text-[10px] font-medium tabular-nums">
          <span className="text-red-600">{high}</span>
          <span className="text-green-600">{low}</span>
        </div>
        <div
          className="relative flex-1"
          role="img"
          aria-label={`${caption}: ${low} – ${high}. ${todayLabel}: ${today}.`}
        >
          <svg
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              {/* Vertical wash: red (expensive) at top → green (cheap) at bottom.
                  userSpaceOnUse so it paints regardless of the path's bbox. */}
              <linearGradient id="phb-line" gradientUnits="userSpaceOnUse" x1="0" y1={PAD_Y} x2="0" y2={VB_H - PAD_Y}>
                <stop offset="0%" stopColor="#dc2626" />
                <stop offset="55%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#16a34a" />
              </linearGradient>
              <linearGradient id="phb-area" gradientUnits="userSpaceOnUse" x1="0" y1={PAD_Y} x2="0" y2={VB_H}>
                <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#phb-area)" />
            <path
              d={line}
              fill="none"
              stroke="url(#phb-line)"
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {/* Today marker — sits on the line at today's price. */}
          <span
            className="absolute z-10 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
            style={{ left: `${dotLeft}%`, top: `${dotTop}%` }}
            title={`${todayLabel}: ${today}`}
          />
        </div>
      </div>
    </div>
  );
}
