/**
 * Render-side handling of product descriptions — the SECURITY BOUNDARY for
 * merchant-captured HTML.
 *
 * `descriptionHtml` is written by scripts/verify-awin.cjs, which pre-reduces
 * the merchant payload (allowlist, https-only, size-bounded). That reducer is
 * a regex pass over third-party HTML, so it is treated as untrusted here and
 * everything is sanitized AGAIN with sanitize-html (real parser, balanced
 * output) before it can reach dangerouslySetInnerHTML.
 */
import 'server-only';
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'ul', 'ol', 'li', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img',
];

/** Merchant description HTML → safe, balanced HTML (empty string when nothing
 *  visible survives — callers treat '' as "no rich description"). */
export function sanitizeDescriptionHtml(html: string): string {
  const safe = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // rel/target/loading are set by transformTags below — the allowlist must
    // include them or they'd be stripped right after being added.
    allowedAttributes: { a: ['href', 'rel', 'target'], img: ['src', 'alt', 'loading'] },
    allowedSchemes: ['https'],
    // Merchant links must not leak referrer/opener nor pass PageRank.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener noreferrer sponsored', target: '_blank' }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, loading: 'lazy' } }),
      h1: 'h2', h5: 'h4', h6: 'h4',
    },
  }).trim();
  // Tag-only output (e.g. a lone <hr>) counts as empty.
  return safe.replace(/<[^>]*>/g, '').trim() ? safe : '';
}

/** Plain feed description → paragraphs (blank-line separated), each paragraph
 *  a list of lines (single newlines become <br> at render). */
export function splitPlainDescription(text: string): string[][] {
  return text
    .split(/\n{2,}/)
    .map((para) => para.split('\n').map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length > 0);
}
