// FR-4.3/EC-16 — census-seeded brand normalization (exact whole-value match).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeBrand } = require('../../../scripts/lib/brand-normalize.cjs');

describe('normalizeBrand', () => {
  it('maps recorded polluted aliases to their canonical brand', () => {
    expect(normalizeBrand('Renogy DE')).toBe('Renogy');
    expect(normalizeBrand('ROCKBROS-EU')).toBe('ROCKBROS');
    expect(normalizeBrand('ROCKBORS')).toBe('ROCKBROS'); // census typo
    expect(normalizeBrand('aosu | SECURITY')).toBe('aosu');
    expect(normalizeBrand('Sunshare Deutschland')).toBe('Sunshare');
    expect(normalizeBrand('ANTHBOT-DE')).toBe('ANTHBOT');
  });

  it('matches map keys case-insensitively', () => {
    expect(normalizeBrand('rockbros-eu')).toBe('ROCKBROS');
    expect(normalizeBrand('WELAX DE')).toBe('Welax');
    expect(normalizeBrand('omidi')).toBe('Omidi');
  });

  it('passes exceptions through unchanged (legit brands that look polluted)', () => {
    expect(normalizeBrand('aosu')).toBe('aosu'); // canonical lowercase styling, not a case error
    expect(normalizeBrand('Sunshine')).toBe('Sunshine'); // distinct brand, not a Sunshare variant
    expect(normalizeBrand('ROAD TO SKY')).toBe('ROAD TO SKY'); // sold via the ROCKBROS storefront
  });

  it('passes unknown brands through trimmed, otherwise unchanged', () => {
    expect(normalizeBrand('Samsung')).toBe('Samsung');
    expect(normalizeBrand('  Samsung ')).toBe('Samsung');
    expect(normalizeBrand('DHU-Arzneimittel GmbH & Co. KG')).toBe('DHU-Arzneimittel GmbH & Co. KG');
  });

  it('empty/nullish input → empty string', () => {
    expect(normalizeBrand('')).toBe('');
    expect(normalizeBrand('   ')).toBe('');
    expect(normalizeBrand(null)).toBe('');
    expect(normalizeBrand(undefined)).toBe('');
  });
});
