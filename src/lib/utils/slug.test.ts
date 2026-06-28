import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('LG 4K OLED TV 55"')).toBe('lg-4k-oled-tv-55');
  });

  it('strips diacritics', () => {
    expect(slugify('Saint-Étienne Crème Brûlée')).toBe('saint-etienne-creme-brulee');
  });

  it('normalizes umlauts to ASCII; non-combining chars (ß) become separators', () => {
    expect(slugify('Müller')).toBe('muller'); // ü → u (combining mark stripped)
    expect(slugify('Größe')).toBe('gro-e');    // ö → o; ß is non-alphanumeric → hyphen
  });

  it('collapses consecutive separators and trims', () => {
    expect(slugify('  --Hello___World!!  ')).toBe('hello-world');
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
    expect(slugify('!!!')).toBe('');
  });
});
