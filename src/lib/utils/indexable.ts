import type { NormalizedDeal } from '@/lib/providers/types';

/** Below this, a "description" is a label, not content worth indexing. */
const MIN_DESCRIPTION_CHARS = 50;

/**
 * Does this deal page carry enough product copy to be worth indexing?
 *
 * Google is currently refusing this site at scale (2026-09-09: 28,055 URLs
 * "Discovered - currently not indexed", 5,772 "Crawled - currently not
 * indexed", indexed pages down 5,443 -> 2,850). 7,840 visible pages have
 * neither a description nor description_html — nothing to index — and at ~20%
 * of the catalogue they drag on how the whole domain is judged.
 *
 * Deliberately narrow, because a wrong `false` here removes a page from search:
 *  - `description_html` alone counts (281 pages have only that),
 *  - a short-but-real description counts; only near-empty text is excluded.
 *
 * Self-healing: the ingest's keep-richer merge and the verifier's capture both
 * populate these fields, so a page becomes indexable again the moment either
 * arrives. Nothing to backfill or un-flag.
 */
export function hasIndexableContent(
  deal: Pick<NormalizedDeal, 'description' | 'descriptionHtml'>,
): boolean {
  if (deal.descriptionHtml && deal.descriptionHtml.trim().length > 0) return true;
  return (deal.description ?? '').trim().length >= MIN_DESCRIPTION_CHARS;
}
