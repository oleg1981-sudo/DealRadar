import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// eslint-disable-next-line import/first
import { sanitizeDescriptionHtml, splitPlainDescription } from './description-render';

describe('sanitizeDescriptionHtml (the security boundary)', () => {
  it('removes script content entirely', () => {
    expect(sanitizeDescriptionHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
  });

  it('neutralizes event handlers and javascript: URLs', () => {
    const out = sanitizeDescriptionHtml(
      '<img src="https://cdn.shopify.com/x.jpg" onerror="alert(1)">' +
      '<a href="javascript:alert(1)">x</a><a href="https://ok.example/p">y</a>',
    );
    expect(out).not.toMatch(/onerror|javascript:/);
    expect(out).toContain('src="https://cdn.shopify.com/x.jpg"');
    expect(out).toContain('href="https://ok.example/p"');
  });

  it('drops http (non-https) resources', () => {
    expect(sanitizeDescriptionHtml('<img src="http://x.example/a.jpg">')).toBe('');
  });

  it('adds rel/target to links and lazy-loading to images', () => {
    const out = sanitizeDescriptionHtml('<a href="https://x.example">l</a><img src="https://x.example/i.jpg" alt="a">');
    expect(out).toContain('rel="nofollow noopener noreferrer sponsored"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('loading="lazy"');
  });

  it('balances unclosed tags (the write-side reducer may emit unbalanced HTML)', () => {
    const out = sanitizeDescriptionHtml('<ul><li>one<li>two');
    expect(out).toBe('<ul><li>one</li><li>two</li></ul>');
  });

  it('normalizes h1/h5/h6 into the h2–h4 range and strips styles/classes', () => {
    const out = sanitizeDescriptionHtml('<h1 class="x" style="color:red">T</h1><h5>d</h5>');
    expect(out).toBe('<h2>T</h2><h4>d</h4>');
  });

  it('returns empty string for tag-only or executable-only payloads', () => {
    expect(sanitizeDescriptionHtml('<hr><br>')).toBe('');
    expect(sanitizeDescriptionHtml('<script>alert(1)</script>')).toBe('');
  });
});

describe('splitPlainDescription', () => {
  it('splits on blank lines into paragraphs of lines', () => {
    expect(splitPlainDescription('a\nb\n\nc')).toEqual([['a', 'b'], ['c']]);
  });

  it('drops empty paragraphs and blank lines', () => {
    expect(splitPlainDescription('a\n\n\n\n  \n\nb')).toEqual([['a'], ['b']]);
  });

  it('handles a single-paragraph description', () => {
    expect(splitPlainDescription('just one block')).toEqual([['just one block']]);
  });
});
