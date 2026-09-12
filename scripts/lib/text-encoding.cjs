'use strict';
/**
 * Repair Windows-1252 bytes that were decoded as Latin-1.
 *
 * Found 2026-09-12: the Awin feed shipped the advertiser "Nature's Way DE" with
 * its apostrophe as raw byte 0x92. Decoded as Latin-1 that becomes U+0092, a C1
 * control character, which then round-trips through UTF-8 as the two bytes
 * C2 92 and survives into the database. It is INVISIBLE — the shop name renders
 * as "Natures Way DE" on cards, matches no `WHERE shop_name = 'Nature''s Way DE'`
 * query, and silently forms its own identity in anything that groups by shop
 * (the sitemap's per-shop round-robin among them).
 *
 * C1 controls (U+0080-U+009F) have no legitimate use in product text, so their
 * presence is an unambiguous signal of this specific mis-decode. Each one maps
 * back to the character the merchant actually meant, which is why this repairs
 * rather than strips: deleting 0x92 would give "Natures Way", also wrong.
 *
 * C0 controls are left alone — `description` deliberately keeps newlines.
 */

/** Windows-1252's assignments for 0x80-0x9F, the range Latin-1 leaves as controls. */
const CP1252 = {
  0x80: '€',           0x82: '‚', 0x83: 'ƒ', 0x84: '„',
  0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰',
  0x8a: 'Š', 0x8b: '‹', 0x8c: 'Œ',                 0x8e: 'Ž',
  0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•',
  0x96: '–', 0x97: '—', 0x98: '˜', 0x99: '™',
  0x9a: 'š', 0x9b: '›', 0x9c: 'œ',                 0x9e: 'ž',
  0x9f: 'Ÿ',
};

const C1 = /[\u0080-\u009F]/g;

/**
 * @param {string} s
 * @returns {string} `s` with any stray C1 control replaced by the Windows-1252
 *   character it stands for. 0x81/0x8D/0x8F/0x90/0x9D are unassigned there and
 *   are dropped. Returns the input untouched (same reference) when clean, which
 *   is the case for every row but a handful.
 */
function repairMojibake(s) {
  if (typeof s !== 'string' || s.length === 0) return s;
  C1.lastIndex = 0;
  if (!C1.test(s)) return s;
  C1.lastIndex = 0;
  return s.replace(C1, (c) => CP1252[c.charCodeAt(0)] ?? '');
}

module.exports = { repairMojibake };
