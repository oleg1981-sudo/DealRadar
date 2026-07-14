// Shared description handling for the AWIN pipeline scripts.
//
// Two writers use this module:
//   - ingest-awin.cjs   → feedDescription(): feed CSV text → display-ready PLAIN text
//   - verify-awin.cjs   → reduceMerchantHtml(): merchant Shopify HTML → reduced HTML
//
// reduceMerchantHtml is a size/noise reducer, NOT the security boundary — the
// app sanitizes again at render time with sanitize-html (allowlist, balanced
// tags). Keeping the stored payload pre-reduced bounds row size and strips the
// obviously-executable content before it ever reaches the DB.
//
// Dependency-free (Node built-ins only) so the ingest runner needs no install.
'use strict';

/** Hard cap for plain-text descriptions — generous (the old 1500 cut half the
 *  catalog mid-word) but bounded so a pathological feed can't store megabytes. */
const MAX_PLAIN = 8000;
/** Cap for reduced merchant HTML (BlazeVideo's full description is ~11 KB raw). */
const MAX_HTML = 60000;

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&'); // last, so &amp;lt; doesn't double-decode
}

/**
 * Normalize a feed description to display-ready plain text:
 * - block-level tags (if the feed ships HTML) become paragraph breaks, the rest
 *   are stripped, entities decoded — never render markup as literal text
 * - paragraph structure survives: spaces/tabs collapse, newlines are KEPT
 *   (the old `\s+ → ' '` collapse destroyed every paragraph in the catalog)
 * - capped at a whitespace boundary with an ellipsis — never mid-word
 * Returns null when nothing readable remains.
 */
function feedDescription(raw, max = MAX_PLAIN) {
  let s = String(raw ?? '');
  if (!s.trim()) return null;
  s = s.replace(/<\s*\/?\s*(?:p|div|br|li|ul|ol|h[1-6]|tr|table|section)\b[^>]*>/gi, '\n');
  s = s.replace(/<[^>]*>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/[^\S\n]+/g, ' ');
  s = s.split('\n').map((line) => line.trim()).join('\n');
  s = s.replace(/\n{2,}/g, '\n\n').replace(/^\n+|\n+$/g, '').trim();
  if (!s) return null;
  if (s.length > max) {
    const head = s.slice(0, max);
    const cut = head.replace(/\s+\S*$/, '');
    s = (cut.length >= max * 0.6 ? cut : head).trimEnd() + '…';
  }
  return s;
}

const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'ul', 'ol', 'li', 'h2', 'h3', 'h4',
  'strong', 'b', 'em', 'i', 'u', 'blockquote',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img',
]);
const RENAME_TAGS = { h1: 'h2', h5: 'h4', h6: 'h4' };
// Containers whose CONTENT must go with them (scripts, styles, embeds, chrome).
const DROP_WITH_CONTENT = 'script|style|iframe|noscript|object|embed|form|svg|video|audio|select|textarea';

function attrOf(attrs, name) {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[1] ?? m[2] ?? m[3] ?? '') : null;
}
function escapeAttr(v) {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Reduce merchant product-page HTML (Shopify `products/<handle>.js` →
 * `description`) to a bounded, display-oriented subset:
 * - scripts/styles/iframes/media dropped WITH their content; comments dropped
 * - Shopify theme tab-label lists (`<ul class="…tabs-desc…">`) dropped — they
 *   are widget chrome, not content
 * - non-allowlisted tags unwrapped (content kept); h1/h5/h6 normalized to h2/h4
 * - ALL attributes dropped except a[href] and img[src,alt], https-only
 * - over-long payloads cut at a closing block tag; unbalanced output is fine —
 *   the render-side sanitizer re-balances
 * Returns null when no visible text remains (or the payload can't be bounded).
 */
function reduceMerchantHtml(html, max = MAX_HTML) {
  let s = String(html ?? '');
  if (!s.trim()) return null;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<ul[^>]*class\s*=\s*"[^"]*tabs?-desc[^"]*"[^>]*>[\s\S]*?<\/ul\s*>/gi, ' ');
  s = s.replace(new RegExp(`<(${DROP_WITH_CONTENT})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), ' ');
  s = s.replace(new RegExp(`<\\/?(?:${DROP_WITH_CONTENT}|link|meta|button|input)\\b[^>]*\\/?>`, 'gi'), ' ');

  s = s.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g, (_m, close, rawName, attrs) => {
    let name = rawName.toLowerCase();
    name = RENAME_TAGS[name] || name;
    if (!ALLOWED_TAGS.has(name)) return ' ';
    if (close) return `</${name}>`;
    if (name === 'a') {
      const href = attrOf(attrs, 'href');
      return href && /^https:\/\//i.test(href.trim()) ? `<a href="${escapeAttr(href.trim())}">` : ' ';
    }
    if (name === 'img') {
      let src = (attrOf(attrs, 'src') || '').trim();
      if (src.startsWith('//')) src = `https:${src}`;
      if (!/^https:\/\//i.test(src)) return ' ';
      const alt = attrOf(attrs, 'alt') || '';
      return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">`;
    }
    return `<${name}>`;
  });

  s = s.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  // Unwrapping leaves whitespace just inside tags and empty husks (e.g. a
  // <strong> that only wrapped a removed iframe) — clean both, repeating for
  // nested husks until stable.
  s = s.replace(/(<(?:h2|h3|h4|p|li|th|td|blockquote|strong|b|em|i|u|a[^>]*)>)\s+/g, '$1');
  s = s.replace(/\s+(<\/(?:h2|h3|h4|p|li|th|td|blockquote|strong|b|em|i|u|a)>)/g, '$1');
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(/<(p|li|ul|ol|h2|h3|h4|strong|b|em|i|u|blockquote|thead|tbody|tr|th|td|table|a)(?:[^>]*)>\s*<\/\1>/g, ' ');
    s = s.replace(/[^\S\n]+/g, ' ');
  }
  // Merchant themes fake vertical spacing with <br> runs — one is enough.
  s = s.replace(/(?:<br>\s*){2,}/gi, '<br>');
  s = s.trim();
  const visible = s.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  if (!visible) return null;
  if (s.length > max) {
    let cut = -1;
    for (const t of ['</p>', '</ul>', '</ol>', '</table>', '</li>', '</h2>', '</h3>', '</h4>']) {
      const i = s.lastIndexOf(t, max - t.length);
      if (i > cut) cut = i + t.length;
    }
    if (cut < 1000) return null; // can't bound it sensibly — skip capture
    s = s.slice(0, cut);
  }
  return s;
}

module.exports = { feedDescription, reduceMerchantHtml, MAX_PLAIN, MAX_HTML };
