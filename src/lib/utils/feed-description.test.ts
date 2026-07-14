/**
 * Tests for scripts/lib/description.cjs — the shared feed/merchant description
 * handling used by ingest-awin.cjs (plain text) and verify-awin.cjs (HTML).
 * The module is dependency-free CJS (runs on a bare CI runner), so it is
 * required directly rather than imported through the TS graph.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
// eslint-disable-next-line
const { feedDescription, reduceMerchantHtml } = require_('../../../scripts/lib/description.cjs');

describe('feedDescription', () => {
  it('returns null for empty / whitespace input', () => {
    expect(feedDescription('')).toBeNull();
    expect(feedDescription('   \n  ')).toBeNull();
    expect(feedDescription(null)).toBeNull();
    expect(feedDescription(undefined)).toBeNull();
  });

  it('preserves paragraph breaks instead of collapsing all whitespace', () => {
    const out = feedDescription('First paragraph.\n\nSecond   paragraph\twith  tabs.');
    expect(out).toBe('First paragraph.\n\nSecond paragraph with tabs.');
  });

  it('normalizes CRLF and collapses 3+ newlines to a single paragraph break', () => {
    expect(feedDescription('a\r\n\r\n\r\nb')).toBe('a\n\nb');
  });

  it('strips HTML tags to breaks/spaces instead of leaking literal markup', () => {
    const out = feedDescription('<p>Hello <strong>world</strong></p><ul><li>one</li><li>two</li></ul>');
    expect(out).not.toMatch(/[<>]/);
    expect(out).toContain('Hello world');
    expect(out).toContain('one');
    // block tags became line breaks, so list items are on separate lines
    expect(out!.split('\n').length).toBeGreaterThan(1);
  });

  it('decodes common entities exactly once', () => {
    expect(feedDescription('Fish &amp; Chips &nbsp; &quot;fresh&quot;')).toBe('Fish & Chips "fresh"');
    // author literally wrote &amp;lt; — must decode to &lt;, not to <
    expect(feedDescription('a &amp;lt; b')).toBe('a &lt; b');
  });

  it('caps at a whitespace boundary with an ellipsis, never mid-word', () => {
    const word = 'Wildkamera';
    const text = Array(2000).fill(word).join(' '); // ~22k chars
    const out = feedDescription(text)!;
    expect(out.length).toBeLessThanOrEqual(8001);
    expect(out.endsWith('…')).toBe(true);
    // the char before the ellipsis ends a COMPLETE word
    const body = out.slice(0, -1);
    expect(body.endsWith(word)).toBe(true);
  });

  it('does not add an ellipsis to short descriptions', () => {
    expect(feedDescription('Short and sweet.')).toBe('Short and sweet.');
  });
});

describe('reduceMerchantHtml', () => {
  it('returns null for empty input or markup with no visible text', () => {
    expect(reduceMerchantHtml('')).toBeNull();
    expect(reduceMerchantHtml('<div><span></span></div>')).toBeNull();
    expect(reduceMerchantHtml(null)).toBeNull();
  });

  it('drops scripts, styles and iframes WITH their content', () => {
    const out = reduceMerchantHtml(
      '<p>keep</p><script>alert("x")</script><style>p{color:red}</style>' +
      '<iframe src="https://www.youtube.com/embed/x"></iframe><p>also keep</p>',
    )!;
    expect(out).toContain('keep');
    expect(out).not.toMatch(/script|alert|style|color|iframe|youtube/);
  });

  it('drops Shopify tab-label chrome (ul.tabs-desc) with its content', () => {
    const out = reduceMerchantHtml(
      '<ul class="tabs-desc"><li class="tab-desc active">ProduktInformation</li>' +
      '<li class="tab-desc">Technische Details</li></ul><h2>Real heading</h2><p>Body</p>',
    )!;
    expect(out).not.toContain('ProduktInformation');
    expect(out).toContain('<h2>Real heading</h2>');
    expect(out).toContain('<p>Body</p>');
  });

  it('unwraps non-allowlisted tags but keeps their content', () => {
    const out = reduceMerchantHtml('<div style="text-align:left"><span>Feature</span> text</div>')!;
    expect(out).not.toMatch(/<div|<span|style/);
    expect(out).toContain('Feature');
  });

  it('strips every attribute except a[href] and img[src,alt], https-only', () => {
    const out = reduceMerchantHtml(
      '<p id="x" class="y" onclick="evil()">t</p>' +
      '<img src="//cdn.shopify.com/a.jpg" alt="A" width="900" onerror="evil()">' +
      '<a href="https://example.com/p" target="_blank" onmouseover="evil()">link</a>' +
      '<a href="javascript:alert(1)">bad</a>' +
      '<img src="http://insecure.example/x.jpg">',
    )!;
    expect(out).toContain('<p>t</p>');
    expect(out).toContain('<img src="https://cdn.shopify.com/a.jpg" alt="A">');
    expect(out).toContain('<a href="https://example.com/p">link</a>');
    expect(out).not.toMatch(/onclick|onerror|onmouseover|javascript:|width=|class=|target=/);
    expect(out).not.toContain('insecure.example');
  });

  it('collapses <br> runs used as fake vertical spacing', () => {
    const out = reduceMerchantHtml('<p>a</p><br><br> <br>\n<br><p>b</p>')!;
    expect(out.match(/<br>/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(out).toContain('<p>a</p>');
    expect(out).toContain('<p>b</p>');
  });

  it('normalizes h1/h5/h6 to the h2–h4 range', () => {
    const out = reduceMerchantHtml('<h1>Top</h1><h5>Deep</h5><h6>Deeper</h6>')!;
    expect(out).toContain('<h2>Top</h2>');
    expect(out).toContain('<h4>Deep</h4>');
    expect(out).toContain('<h4>Deeper</h4>');
    expect(out).not.toMatch(/<h[156]/);
  });

  it('bounds oversized payloads at a closing block tag', () => {
    const html = Array(3000).fill('<p>A paragraph of filler content for size testing.</p>').join('');
    const out = reduceMerchantHtml(html)!;
    expect(out.length).toBeLessThanOrEqual(60000);
    expect(out.endsWith('</p>')).toBe(true);
  });

  it('survives the real-world Shopify shape (tabs + inline styles + iframe)', () => {
    const shopifyLike =
      '<ul class="tabs-desc"><li data-content-id="tab-content-desc-1" class="tab-desc active">ProduktInformation<br></li></ul>' +
      '<div id="tab-content-desc-1" class="tab-content-desc active"><div style="text-align: left;">' +
      '<strong><iframe width="924" height="520" src="https://www.youtube.com/embed/x" frameborder="0"></iframe></strong>' +
      '<h2><span style="color:#38761d">SENSOR FÜR SEHR SCHWACHES LICHT</span></h2>' +
      '<p>Dank des eingebauten <strong>Sony Starvis</strong>-Bildsensors…</p>' +
      '<img src="https://cdn.shopify.com/s/files/1/0492/A323-features.webp" alt="features"></div></div>';
    const out = reduceMerchantHtml(shopifyLike)!;
    expect(out).toContain('<h2>SENSOR FÜR SEHR SCHWACHES LICHT</h2>');
    expect(out).toContain('<strong>Sony Starvis</strong>');
    expect(out).toContain('<img src="https://cdn.shopify.com/s/files/1/0492/A323-features.webp" alt="features">');
    expect(out).not.toMatch(/iframe|youtube|tabs-desc|style=|data-content-id/);
  });
});
