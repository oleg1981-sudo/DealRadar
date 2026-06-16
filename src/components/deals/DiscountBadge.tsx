import { Badge } from '@/components/ui/badge';

/** "-45%" badge on each deal card. */
export function DiscountBadge({ percent }: { percent: number }) {
  return (
    <Badge className="bg-deal text-white" aria-label={`${percent}% off`}>
      -{percent}%
    </Badge>
  );
}
