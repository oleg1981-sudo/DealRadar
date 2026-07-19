/**
 * Agent-readable markdown surface [FR-5.2, docs/specs/pdp-full-content]:
 * GET /<locale>/deal/<slug>/md — the same verified facts the PDP renders, as
 * text/markdown with PINNED field labels (the acceptance harness EC-18 parses
 * them; change labels only with a spec amendment). Discovery: /llms.txt names
 * this surface; every sitemap deal URL + `/md` is the corresponding document.
 * Hidden deals follow Q-1: reachable (200) but X-Robots-Tag: noindex.
 */
import { getDealBySlug } from '@/lib/db/deals.repo';
import { unproxyImage } from '@/lib/utils/product-details';
import { renderableAttrs } from '@/lib/utils/renderable-attrs';
import { siteUrl } from '@/lib/utils/site-url';
import { routing } from '@/i18n/routing';

export const dynamic = 'force-dynamic';

const DISCLOSURE =
  'DealRadar may earn a commission when you buy through links on this site — at no extra cost to you.';

export async function GET(_req: Request, { params }: { params: { locale: string; slug: string } }) {
  // Route handlers bypass the locale layout's notFound() AND the middleware
  // matcher (dotted paths) — validate here or /en.%0A…/md reflects attacker
  // text into the pinned-label surface [review wf_0a8eb867].
  if (!(routing.locales as readonly string[]).includes(params.locale)) {
    return new Response('not found', { status: 404 });
  }
  const deal = await getDealBySlug(params.slug);
  if (!deal) return new Response('not found', { status: 404 });

  const base = siteUrl();
  const gallery = [...new Set((deal.gallery?.length ? deal.gallery : [deal.imageUrl]).filter(Boolean).map((u) => unproxyImage(u as string)))];
  const attrs = Object.entries(renderableAttrs(deal.feedAttrs));
  const lines = [
    `# ${deal.productName}`,
    '',
    `Price: ${deal.salePrice.toFixed(2)} ${deal.currency}`,
    `Was: ${deal.originalPrice.toFixed(2)} ${deal.currency} (-${deal.discountPercent}%)`,
    `Availability: ${deal.hidden ? 'unavailable' : 'in_stock'}`,
    `Shop: ${deal.shopName}`,
    ...(deal.brand ? [`Brand: ${deal.brand}`] : []),
    ...(deal.eanCode ? [`GTIN: ${deal.eanCode}`] : []),
    ...(deal.mpn || deal.modelNumber ? [`MPN: ${deal.mpn || deal.modelNumber}`] : []),
    `Page: ${base}/${params.locale}/deal/${params.slug}`,
    '',
    ...(deal.description ? ['## Description', '', deal.description, ''] : []),
    ...(attrs.length
      ? ['## Attributes', '', ...attrs.map(([k, v]) => `- ${k}: ${v}`), '']
      : []),
    ...(gallery.length ? ['## Images', '', ...gallery.map((u) => `- ${u}`), ''] : []),
    ...(deal.ratingSource && deal.ratingValue != null
      ? [`Rating: ${deal.ratingValue.toFixed(1)}${deal.ratingCount != null ? ` (${deal.ratingCount})` : ''} — source: ${deal.ratingSource}`, '']
      : []),
    `Disclosure: ${DISCLOSURE}`,
    '',
  ];

  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // Q-1 invariant [EC-24]: proven deals indexable, hidden never.
      ...(deal.hidden ? { 'X-Robots-Tag': 'noindex' } : {}),
    },
  });
}
