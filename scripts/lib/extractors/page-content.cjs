// Merchant-PAGE content extractor [FR-1.4/Q-3, docs/specs/pdp-full-content] —
// for merchants whose Shopify product JSON carries NO description (the
// "Renogy class": content lives in page sections/metafields). Called by the
// verifier ONLY when the product-JSON description is empty, so it adds at most
// one extra page fetch per such row per sweep, under the same per-host pacing.
//
// Extraction chain (first non-empty wins):
//   1. JSON-LD Product/ProductGroup `description`
//   2. Shopify metafield rich-text sections (`metafield-rich_text_field` divs —
//      a stock Shopify pattern, not merchant-specific; largest block wins)
//   3. og:description meta (short, last resort)
// aggregateRating rides the same parse when a JSON-LD block carries it (Q-5
// provenance = 'merchant-jsonld').
//
// Dependency-free; pure functions over an HTML string (fixture-tested).
'use strict';

/** All parsed JSON-LD objects in the page (malformed blocks skipped). */
function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      const parsed = JSON.parse(m[1]);
      // Unwrap @graph containers; flatten arrays.
      const nodes = Array.isArray(parsed) ? parsed : parsed && parsed['@graph'] ? parsed['@graph'] : [parsed];
      out.push(...(Array.isArray(nodes) ? nodes : [nodes]));
    } catch { /* malformed block — skip */ }
  }
  return out;
}

/** Inner HTML of every `metafield-rich_text_field` div, via balanced-div scan. */
function metafieldRichTextBlocks(html) {
  const blocks = [];
  const re = /<div[^>]*class="[^"]*metafield-rich_text_field[^"]*"[^>]*>/g;
  let m;
  while ((m = re.exec(html))) {
    let depth = 1;
    let i = re.lastIndex;
    const tag = /<\/?div\b[^>]*>/g;
    tag.lastIndex = i;
    let t;
    while (depth > 0 && (t = tag.exec(html))) {
      depth += t[0][1] === '/' ? -1 : 1;
      if (depth === 0) {
        blocks.push(html.slice(i, t.index));
        re.lastIndex = t.index; // nested metafield divs must not extract twice
        break;
      }
    }
  }
  return blocks;
}

function ogDescription(html) {
  const m = html.match(/<meta property="og:description" content="([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * → { descriptionHtml, descriptionSource, rating: {value, count}|null }.
 * descriptionHtml is RAW page HTML — the caller MUST pass it through
 * reduceMerchantHtml (same sanitation contract as product-JSON captures).
 */
/** Normalize a JSON-LD aggregateRating node to the deals schema (0–5, 2dp,
 *  integer count) — or null when out of range/scale-unknown. */
function normalizeRating(ar) {
  if (!ar || ar.ratingValue == null) return null;
  let value = Number(ar.ratingValue);
  const best = ar.bestRating != null ? Number(ar.bestRating) : 5;
  if (Number.isFinite(best) && best > 0 && best !== 5) value = (value / best) * 5;
  if (!Number.isFinite(value) || value < 0 || value > 5) return null;
  const rawCount = ar.ratingCount != null ? Number(ar.ratingCount) : (ar.reviewCount != null ? Number(ar.reviewCount) : null);
  const count = Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : null;
  return { value: Math.round(value * 100) / 100, count };
}

function extractPageContent(html) {
  // Rating binds to the FIRST Product/ProductGroup node (page order) — later
  // blocks (related-product carousels, bundles) must never overwrite it.
  let rating = null;
  let ldDescription = null;
  for (const n of jsonLdBlocks(html)) {
    if (!n || typeof n !== 'object') continue;
    const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
    if (types.includes('Product') || types.includes('ProductGroup')) {
      if (!ldDescription && typeof n.description === 'string' && n.description.trim()) ldDescription = n.description;
      if (!rating) rating = normalizeRating(n.aggregateRating);
    }
  }
  if (ldDescription) return { descriptionHtml: ldDescription, descriptionSource: 'page-jsonld', rating };
  // Anchor on the PRODUCT-description section: pages carry metafield rich-text
  // in unrelated sections too (returns policy, loyalty banners) and page-wide
  // extraction picks boilerplate — verified on de.renogy.com. No product
  // section → NO metafield extraction (og:description is the safe fallback);
  // publishing boilerplate is worse than publishing a short description.
  const secStart = html.search(/class="[^"]*section-product-description/);
  if (secStart >= 0) {
    const end = html.indexOf('</section>', secStart);
    const scope = html.slice(secStart, end >= 0 ? end + 10 : undefined);
    const blocks = metafieldRichTextBlocks(scope);
    if (blocks.length) {
      // Within the product section every block is product content
      // (description, notes, package contents) — keep them all, in page order.
      const joined = blocks.map((b) => b.trim()).filter(Boolean).join('\n');
      if (joined) return { descriptionHtml: joined, descriptionSource: 'page-metafield', rating };
    }
  }
  const og = ogDescription(html);
  if (og) return { descriptionHtml: `<p>${og}</p>`, descriptionSource: 'page-og', rating };
  return { descriptionHtml: null, descriptionSource: null, rating };
}

module.exports = { extractPageContent, jsonLdBlocks, metafieldRichTextBlocks, ogDescription, normalizeRating };
