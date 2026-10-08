import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/utils/site-url';

/**
 * Single source of truth for robots.txt. There must be NO public/robots.txt —
 * a static file silently shadows this route (that's how a hardcoded
 * dealradar.eu sitemap URL shipped for months).
 *
 * Policy (GEO/AEO thesis — organic + AI-answer visibility is the traffic
 * model, so answer/search AI crawlers are explicitly INVITED):
 *
 *  - Search/answer-index bots (drive citations + referral traffic) and
 *    user-triggered fetchers (fetch a page when a human asks an assistant)
 *    get explicit ALLOW groups. A robots.txt group is exclusive — a UA obeys
 *    only its most specific match — so every named group must repeat the
 *    disallow list; it does NOT inherit from `*`.
 *  - Model-TRAINING crawlers are DISALLOWED (2026-08-07). They send zero
 *    referral traffic yet, on a ~31k-deal × 13-locale force-dynamic (uncached)
 *    surface, each fetch is a billed function invocation — a full training
 *    sweep helped exhaust the Netlify compute budget on Aug 6. Answer-engine
 *    visibility (the actual GEO upside) is preserved by the search/user groups
 *    below; only the no-referral training class is cut. Reversible: move a UA
 *    back to an ALLOW group to re-invite it.
 *  - Crawl-trap hygiene (commerce faceted-nav standard): internal search
 *    results and infinite/duplicate parameter spaces are disallowed for
 *    everyone — they waste crawl budget without adding indexable value.
 *    Plain ?page= pagination stays crawlable.
 */

const DISALLOW = [
  '/api/',        // machine endpoints, never content
  '/*/search',    // internal search results (noindex'd as belt; blocked as suspenders)
  '/*?*seed=',    // random-shuffle seed → infinite unique-URL space
  '/*?*sort=',    // sort permutations → duplicate content
  '/*?*minPrice=',
  '/*?*maxPrice=',
  '/*?*minDiscount=',
  '/*?*brand=',   // facet params: duplicates of the canonical category view
  // Next.js RSC payloads. When Googlebot renders a page, <Link> prefetches the
  // React Server Component data for every link in view, and each response is a
  // fresh URL (`?_rsc=<build hash>`). Search Console, 2026-10-08: these were 57%
  // of all Googlebot requests ("Other file type"), against 39% for actual HTML —
  // on a site Google is crawling at near-zero rate, more than half the allowance
  // went to data that is never indexed. The page being rendered does not need
  // them (its own RSC payload is inlined in the HTML); they only serve
  // client-side navigation, which a crawler never performs. `?*` also covers the
  // `?page=2&_rsc=` form.
  '/*?*_rsc=',
];

// Answer/search-engine indexers + assistants' live-retrieval bots.
const AI_SEARCH_BOTS = ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'DuckAssistBot', 'Amazonbot', 'Applebot'];
// User-triggered fetchers (act on a human's behalf inside an assistant).
const AI_USER_FETCHERS = ['ChatGPT-User', 'Claude-User', 'Perplexity-User', 'Meta-ExternalFetcher'];
// Model-training crawlers — DISALLOWED (no referral value; billed compute on an
// uncached surface). Re-invite one by moving it to an ALLOW group above.
const AI_TRAINING_BOTS = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Meta-ExternalAgent', 'Bytespider'];

export default function robots(): MetadataRoute.Robots {
  const allow = (userAgent: string) => ({ userAgent, allow: '/', disallow: DISALLOW });
  // Block the whole site for training crawlers (compliant ones obey `/`).
  const block = (userAgent: string) => ({ userAgent, disallow: '/' });
  return {
    rules: [
      allow('*'),
      ...AI_SEARCH_BOTS.map(allow),
      ...AI_USER_FETCHERS.map(allow),
      ...AI_TRAINING_BOTS.map(block),
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
