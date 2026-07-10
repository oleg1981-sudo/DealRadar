/**
 * Numbered pagination for the browse pages (category / search). Pure links —
 * server-rendered, so every page is shareable, bookmarkable and crawlable.
 * Filters/sort survive page changes because the current query params are
 * rebuilt into each href; changing a filter drops `page` and naturally resets
 * to page 1 (the FilterPanel builds its own URLs without it).
 */
import { Link } from '@/i18n/routing';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  /** Route path without locale, e.g. `/category/electronics` or `/search`. */
  basePath: string;
  /** Current query params to preserve (without `page`). */
  params: Record<string, string>;
  page: number;
  totalPages: number;
  prevLabel: string;
  nextLabel: string;
}

/** Window of page numbers: 1 … page-1 page page+1 … last (null = ellipsis). */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  const wanted = new Set([1, page - 1, page, page + 1, totalPages]);
  const list = [...wanted].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  let prev = 0;
  for (const p of list) {
    if (p - prev > 1) out.push(null);
    out.push(p);
    prev = p;
  }
  return out;
}

const CHIP = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 text-sm transition-colors';
const IDLE = `${CHIP} border-zinc-200 text-zinc-600 hover:border-accent/40 hover:text-accent`;

export function Pagination({ basePath, params, page, totalPages, prevLabel, nextLabel }: PaginationProps) {
  if (totalPages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams(params);
    if (p > 1) sp.set('page', String(p));
    else sp.delete('page'); // page 1 = clean canonical URL
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 && (
        <Link href={href(page - 1)} aria-label={prevLabel} className={IDLE}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
      )}
      {pageWindow(page, totalPages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} aria-hidden className="px-1 text-zinc-400">…</span>
        ) : p === page ? (
          <span key={p} aria-current="page" className={`${CHIP} border-accent bg-accent-soft font-medium text-accent`}>
            {p}
          </span>
        ) : (
          <Link key={p} href={href(p)} className={IDLE}>
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link href={href(page + 1)} aria-label={nextLabel} className={IDLE}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </nav>
  );
}
