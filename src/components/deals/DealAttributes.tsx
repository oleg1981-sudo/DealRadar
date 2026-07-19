/**
 * Real product attributes from the feed [FR-4.1/FR-2.1] — renders ONLY what
 * the feed actually shipped (deals.feed_attrs); no fabricated rows (FR-PDP-6).
 * Split into an attributes table and a shipping section; condition and energy
 * rows carry row-level markers so the harness can address them individually.
 * The rating block renders ONLY with provenance (ratingSource, Q-5).
 */

const SHIPPING_KEYS = ['delivery_cost', 'delivery_time', 'shipping', 'shipping_weight'] as const;
// item_group_id: variants block deferred — empty in every active feed today
// (audit/2026-07-16 §Empirical schema); tracking/meta keys never render.
const NEVER_RENDER = new Set(['item_group_id', 'availability', 'identifier_exists', 'adult']);
const ROW_MARKERS: Record<string, string> = {
  condition: 'condition',
  energy_efficiency_class: 'energy',
  min_energy_efficiency_class: 'energy',
  max_energy_efficiency_class: 'energy',
};

const prettify = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Rows({ entries }: { entries: [string, string][] }) {
  return (
    <dl className="grid max-w-md grid-cols-[auto,1fr] gap-x-8 gap-y-2 text-sm">
      {entries.map(([k, v]) => (
        <div key={k} className="contents" data-attr={ROW_MARKERS[k] ?? k}>
          <dt className="text-zinc-500">{prettify(k)}</dt>
          <dd className="text-zinc-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Props {
  readonly attrs: Record<string, string> | null | undefined;
  readonly ratingValue?: number | null;
  readonly ratingCount?: number | null;
  readonly ratingSource?: string | null;
  readonly attrsTitle: string;
  readonly shippingTitle: string;
  readonly ratingTitle: string;
}

export function DealAttributes({ attrs, ratingValue, ratingCount, ratingSource, attrsTitle, shippingTitle, ratingTitle }: Props) {
  const entries = Object.entries(attrs ?? {}).filter(([k, v]) => v && !NEVER_RENDER.has(k));
  const shipping = entries.filter(([k]) => (SHIPPING_KEYS as readonly string[]).includes(k));
  const general = entries.filter(([k]) => !(SHIPPING_KEYS as readonly string[]).includes(k));
  const hasRating = ratingSource != null && ratingValue != null;
  if (!general.length && !shipping.length && !hasRating) return null;

  return (
    <>
      {general.length > 0 && (
        <section data-block="attrs" className="mt-10 border-t border-zinc-100 pt-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">{attrsTitle}</h2>
          <Rows entries={general} />
        </section>
      )}
      {shipping.length > 0 && (
        <section data-block="shipping" className="mt-10 border-t border-zinc-100 pt-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">{shippingTitle}</h2>
          <Rows entries={shipping} />
        </section>
      )}
      {hasRating && (
        <section data-block="rating" className="mt-10 border-t border-zinc-100 pt-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">{ratingTitle}</h2>
          <p className="text-sm text-zinc-900">
            <span aria-hidden>★</span> {ratingValue!.toFixed(1)}
            {ratingCount != null && <span className="text-zinc-500"> ({ratingCount})</span>}
            {/* Provenance is part of the honesty contract [Q-5]: second-hand
                ratings are labeled as the merchant's, never presented as ours. */}
            <span className="ml-2 text-xs text-zinc-400">({ratingSource})</span>
          </p>
        </section>
      )}
    </>
  );
}
