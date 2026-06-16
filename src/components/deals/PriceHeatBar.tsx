import { formatPrice } from '@/lib/utils/format';
import type { PriceWindow } from '@/lib/utils/price-history';

/**
 * Price scale: a green→red bar spanning the deal's 3-month [low, high] range
 * (green = cheapest, red = dearest) with a marker that slides to show where
 * today's price sits — near the green/left end means today is close to the
 * cheapest it's been. Today's price is also shown as text. Pure presentational
 * server component — no client JS, keeps the grid cheap.
 */
export function PriceHeatBar({
  window,
  currency,
  locale,
  captionLabel,
  todayLabel,
}: {
  window: PriceWindow;
  currency: string;
  locale: string;
  captionLabel: string;
  todayLabel: string;
}) {
  const pct = Math.round(window.position * 100);
  const low = formatPrice(window.low, currency, locale);
  const high = formatPrice(window.high, currency, locale);
  const today = formatPrice(window.current, currency, locale);

  return (
    <div className="mt-1 rounded-xl border border-zinc-200/70 bg-gradient-to-b from-white to-zinc-50/60 p-2 shadow-sm ring-1 ring-zinc-900/5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{captionLabel}</p>
        <p className="text-[10px] font-semibold tabular-nums text-zinc-600">
          {todayLabel} <span className="text-accent">{today}</span>
        </p>
      </div>
      <div
        className="relative h-2.5 rounded-full ring-1 ring-inset ring-white/50"
        style={{
          // Tinted translucent gradient + inner highlight and drop shadow = glass.
          background:
            'linear-gradient(to right, rgba(22,163,74,0.9), rgba(234,179,8,0.9) 50%, rgba(220,38,38,0.9))',
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.18)',
        }}
        role="img"
        aria-label={`${captionLabel}: ${low} – ${high}. ${todayLabel}: ${today}.`}
      >
        {/* Glossy top sheen. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[45%] rounded-full"
          style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.65), rgba(255,255,255,0))' }}
        />
        {/* Today marker — slides along the range to show today's price. */}
        <span
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-accent bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
          style={{ left: `${pct}%` }}
          title={`${todayLabel}: ${today}`}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] tabular-nums">
        <span className="font-medium text-green-600">{low}</span>
        <span className="font-medium text-red-600">{high}</span>
      </div>
    </div>
  );
}
