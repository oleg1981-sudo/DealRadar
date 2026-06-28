import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholder mirroring DealGrid. Used as an inline <Suspense> fallback
 * on listing pages. Intentionally NOT a route-level loading.tsx: a Suspense
 * boundary above a route that can call notFound() (e.g. /deal/[slug]) flushes a
 * 200 shell before the 404 resolves, so 404 status would be lost.
 */
export function DealGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <span className="sr-only">Loading deals…</span>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-zinc-100 p-4">
          <Skeleton className="aspect-[4/3] w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-2 h-9 w-full" />
        </div>
      ))}
    </div>
  );
}
