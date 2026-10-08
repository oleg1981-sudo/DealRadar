import { describe, it, expect } from 'vitest';
import { contentLocale } from '../geo/countries';
import { dealCanonicalUrl } from './deal-url';

describe('contentLocale', () => {
  it('maps a market to the language its merchants write in', () => {
    expect(contentLocale('DE')).toBe('de');
    expect(contentLocale('AT')).toBe('de');
    expect(contentLocale('CH')).toBe('de');
    expect(contentLocale('FR')).toBe('fr');
    expect(contentLocale('GB')).toBe('en');
  });

  it('tolerates the char(2) column arriving lowercase or padded', () => {
    expect(contentLocale('de')).toBe('de');
    expect(contentLocale(' fr ')).toBe('fr');
  });

  it("falls back to the default market's language for an unknown country", () => {
    expect(contentLocale('ZZ')).toBe('de');
    expect(contentLocale('')).toBe('de');
  });
});

describe('dealCanonicalUrl', () => {
  it('points every deal at its content-language copy', () => {
    expect(dealCanonicalUrl('https://dealradar.me', 'seifenspender-awin-1', 'DE')).toBe(
      'https://dealradar.me/de/deal/seifenspender-awin-1',
    );
  });

  it('is independent of the locale being viewed — the whole point', () => {
    // The page's own locale is not an input: /en/, /fi/ and /de/ copies of a
    // German deal all name the same canonical.
    const url = dealCanonicalUrl('https://dealradar.me', 'x-awin-2', 'DE');
    expect(url).not.toContain('/en/');
    expect(url).toContain('/de/deal/');
  });
});
