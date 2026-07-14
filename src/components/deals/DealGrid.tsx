import { DealCard } from './DealCard';
import { TrackViewItemList } from '@/components/analytics/TrackView';
import { gaItem } from '@/lib/analytics/items';
import type { NormalizedDeal } from '@/lib/providers/types';

/** Responsive grid per spec: 1 col mobile, 2 tablet, 3–4 desktop.
 *  `listName` labels the GA4 view_item_list impression (the CTR denominator)
 *  and joins with select_item's item_list_name on CTA click. */
export function DealGrid({ deals, listName = 'grid' }: { deals: NormalizedDeal[]; listName?: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <TrackViewItemList listName={listName} items={deals.map(gaItem)} />
      {deals.map((deal, i) => (
        // Mark the first row (up to 4 cols on xl) as priority for LCP.
        <DealCard key={deal.productId} deal={deal} priority={i < 4} listName={listName} />
      ))}
    </div>
  );
}
