// Guards the Windows-1252 repair. The bug this covers is invisible by
// construction — a C1 control renders as nothing, so a regression here would
// show up only as a shop that quietly stops matching its own name.
import { describe, it, expect } from 'vitest';
// Dependency-free CJS script-lib (runs on bare CI runners); tests live in src/
// because vitest's include is src/**.
import { repairMojibake } from '../../../scripts/lib/text-encoding.cjs';

/** Build strings with the literal control byte, never typed into source. */
const c1 = (code: number) => String.fromCharCode(code);

describe('repairMojibake', () => {
  it('repairs the advertiser name that caused this (2026-09-12)', () => {
    expect(repairMojibake(`Nature${c1(0x92)}s Way DE`)).toBe('Nature’s Way DE');
  });

  it('repairs, rather than strips — dropping the byte is also wrong', () => {
    // "Natures Way" would match no rule and read as a different merchant.
    expect(repairMojibake(`Nature${c1(0x92)}s Way DE`)).not.toBe('Natures Way DE');
  });

  it('covers the quotes and dashes a German catalogue actually uses', () => {
    expect(repairMojibake(`${c1(0x93)}MADE IN GERMANY${c1(0x94)}`)).toBe('“MADE IN GERMANY”');
    expect(repairMojibake(`Handsprüher 2L ${c1(0x96)} 304 B`)).toBe('Handsprüher 2L – 304 B');
    expect(repairMojibake(`Preis ${c1(0x80)}9,99`)).toBe('Preis €9,99');
  });

  it('drops the five codepoints Windows-1252 leaves unassigned', () => {
    for (const code of [0x81, 0x8d, 0x8f, 0x90, 0x9d]) {
      expect(repairMojibake(`x${c1(code)}y`)).toBe('xy');
    }
  });

  it('leaves clean text exactly as it was', () => {
    for (const s of ['vbs-hobby AT', 'Aliva', '', 'Gießpulver "Raysin 200"']) {
      expect(repairMojibake(s)).toBe(s);
    }
  });

  it('keeps newlines and tabs — descriptions preserve paragraphs', () => {
    expect(repairMojibake('para one\n\npara two\tindented')).toBe('para one\n\npara two\tindented');
  });

  it('tolerates the non-strings a sparse CSV row can yield', () => {
    expect(repairMojibake(undefined as unknown as string)).toBe(undefined);
    expect(repairMojibake(null as unknown as string)).toBe(null);
  });

  it('is not stateful across calls (the regex carries the g flag)', () => {
    const bad = `a${c1(0x92)}b${c1(0x92)}c`;
    expect(repairMojibake(bad)).toBe('a’b’c');
    expect(repairMojibake(bad)).toBe('a’b’c'); // same answer the second time
  });
});
