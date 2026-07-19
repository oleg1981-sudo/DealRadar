import { describe, it, expect } from 'vitest';
import { clampSchemaText, SCHEMA_NAME_MAX, SCHEMA_DESCRIPTION_MAX } from './schema-text';

// The live PDP name that drew GSC's "Invalid string length in field 'name'"
// (157 chars — audit/2026-07-15_jsonld-schema/findings.md).
const LIVE_NAME =
  '2tlg.Wildkameras 64MP 1296p Video mit Audio und Bewegungsmelder Nachtsicht max. Entfernung bis 100Füße, 0,1s Trigger Geschwindigkeit, Wasserdicht IP66 | A323';

describe('clampSchemaText', () => {
  it('returns short input unchanged (no ellipsis)', () => {
    expect(clampSchemaText('Kurzer Name', SCHEMA_NAME_MAX)).toBe('Kurzer Name');
  });

  it('returns input unchanged at exactly the limit', () => {
    const s = 'a'.repeat(SCHEMA_NAME_MAX);
    expect(clampSchemaText(s, SCHEMA_NAME_MAX)).toBe(s);
  });

  it('cuts one-over-the-limit input to within the limit, at a word boundary, with ellipsis', () => {
    const s = `${'wort '.repeat(30)}ende`; // 154 chars
    const out = clampSchemaText(s, SCHEMA_NAME_MAX);
    expect(out.length).toBeLessThanOrEqual(SCHEMA_NAME_MAX);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\bwor…$/); // no mid-word cut
  });

  it('clamps the live 157-char GSC-flagged name to ≤150 without a partial word', () => {
    const out = clampSchemaText(LIVE_NAME, SCHEMA_NAME_MAX);
    expect(LIVE_NAME.length).toBe(157);
    expect(out.length).toBeLessThanOrEqual(SCHEMA_NAME_MAX);
    expect(out.endsWith('…')).toBe(true);
    // The kept prefix must be a clean word-boundary cut of the original:
    // it ends on a non-space char and the original continues with a space.
    const prefix = out.slice(0, -1);
    expect(LIVE_NAME.startsWith(prefix)).toBe(true);
    expect(prefix.endsWith(' ')).toBe(false);
    expect(LIVE_NAME.charAt(prefix.length)).toBe(' ');
  });

  it('umlauts survive (BMP multibyte chars count as one char)', () => {
    const s = `Wärmepumpe für Größenwahnsinnige ${'ö'.repeat(140)}`;
    const out = clampSchemaText(s, SCHEMA_NAME_MAX);
    expect(out.length).toBeLessThanOrEqual(SCHEMA_NAME_MAX);
    expect(out.includes('�')).toBe(false);
  });

  it('never splits a surrogate pair at the cut point', () => {
    // Position an astral char (💡 = 2 UTF-16 units) so the cut lands inside it.
    const s = 'x'.repeat(SCHEMA_NAME_MAX - 2) + '💡' + 'tail-with-more-text';
    const out = clampSchemaText(s, SCHEMA_NAME_MAX);
    expect(out.length).toBeLessThanOrEqual(SCHEMA_NAME_MAX);
    for (let i = 0; i < out.length; i++) {
      const c = out.charCodeAt(i);
      const isHigh = c >= 0xd800 && c <= 0xdbff;
      if (isHigh) expect(i).toBeLessThan(out.length - 1); // high surrogate must have its pair
    }
  });

  it('hard-cuts whitespace-free strings instead of returning just an ellipsis', () => {
    const s = 'A'.repeat(6000);
    const out = clampSchemaText(s, SCHEMA_DESCRIPTION_MAX);
    expect(out.length).toBeLessThanOrEqual(SCHEMA_DESCRIPTION_MAX);
    expect(out.length).toBeGreaterThan(SCHEMA_DESCRIPTION_MAX * 0.9);
    expect(out.endsWith('…')).toBe(true);
  });

  it('clamps a description just over the 5,000 limit (the 5,572-char live case)', () => {
    const s = `${'Beschreibung mit vielen Wörtern und Details. '.repeat(124)}Schluss`; // ~5.7k
    const out = clampSchemaText(s, SCHEMA_DESCRIPTION_MAX);
    expect(s.length).toBeGreaterThan(SCHEMA_DESCRIPTION_MAX);
    expect(out.length).toBeLessThanOrEqual(SCHEMA_DESCRIPTION_MAX);
    expect(out.endsWith('…')).toBe(true);
  });
});
