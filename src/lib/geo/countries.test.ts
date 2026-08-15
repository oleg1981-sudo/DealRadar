// Country names must follow the reader's locale — the surrounding copy is
// translated, so an English country name renders a hybrid heading
// ("Top-Angebote in Germany") on the homepage h1 in every non-English locale.
import { describe, it, expect } from 'vitest';
import { countryName, countryInfo, COUNTRIES } from './countries';
// routing.ts is the shipped list (13) — lib/i18n/config.ts still lists only 10.
import { LOCALES } from '../../i18n/routing';

describe('countryName', () => {
  it('localises the country into the reader’s language', () => {
    expect(countryName('DE', 'de')).toBe('Deutschland');
    expect(countryName('DE', 'fr')).toBe('Allemagne');
    expect(countryName('DE', 'sv')).toBe('Tyskland');
    expect(countryName('DE', 'en')).toBe('Germany');
  });

  it('localises every supported country, not just the default market', () => {
    expect(countryName('SE', 'de')).toBe('Schweden');
    expect(countryName('NL', 'fr')).toBe('Pays-Bas');
    expect(countryName('GB', 'es')).toBe('Reino Unido');
  });

  it('returns a non-empty name for every country × locale pair', () => {
    for (const c of COUNTRIES) {
      for (const locale of LOCALES) {
        const name = countryName(c.code, locale);
        expect(name.length).toBeGreaterThan(0);
        // Never leak the raw ISO code to the UI.
        expect(name).not.toBe(c.code);
      }
    }
  });

  it('falls back to the English name for an unusable locale tag', () => {
    expect(countryName('DE', 'not-a-locale!!')).toBe(countryInfo('DE').name);
  });
});
