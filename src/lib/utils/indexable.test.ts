// Guards the noindex rule. A wrong `false` here silently removes a page from
// Google, so the bar is deliberately low: only near-empty pages are excluded.
import { describe, it, expect } from 'vitest';
import { hasIndexableContent } from './indexable';

const deal = (description: string | null, descriptionHtml: string | null = null) =>
  ({ description, descriptionHtml }) as Parameters<typeof hasIndexableContent>[0];

describe('hasIndexableContent', () => {
  it('excludes the truly empty page (7,840 of these exist)', () => {
    expect(hasIndexableContent(deal(null, null))).toBe(false);
    expect(hasIndexableContent(deal('', null))).toBe(false);
    expect(hasIndexableContent(deal('   \n  ', null))).toBe(false);
  });

  it('excludes a label masquerading as a description', () => {
    expect(hasIndexableContent(deal('Schwarz / M'))).toBe(false);
  });

  it('counts description_html ALONE as content', () => {
    // 281 pages have only this; noindexing them would be a real loss.
    expect(hasIndexableContent(deal(null, '<p>Ein ausführlicher Produkttext.</p>'))).toBe(true);
    expect(hasIndexableContent(deal('', '<p>Ein ausführlicher Produkttext.</p>'))).toBe(true);
  });

  it('keeps a short-but-real description indexable', () => {
    // Not in the sitemap (that needs 300+), but still allowed in the index —
    // the two thresholds are deliberately different.
    expect(hasIndexableContent(deal('a'.repeat(50)))).toBe(true);
    expect(hasIndexableContent(deal('a'.repeat(120)))).toBe(true);
  });

  it('is exclusive at the boundary, not inclusive', () => {
    expect(hasIndexableContent(deal('a'.repeat(49)))).toBe(false);
    expect(hasIndexableContent(deal('a'.repeat(50)))).toBe(true);
  });

  it('ignores whitespace padding around real content', () => {
    expect(hasIndexableContent(deal(`   ${'a'.repeat(60)}   `))).toBe(true);
    expect(hasIndexableContent(deal(`   ${'a'.repeat(10)}   `))).toBe(false);
  });
});
