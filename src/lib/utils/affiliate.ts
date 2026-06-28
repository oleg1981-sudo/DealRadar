/**
 * Affiliate link decoration + sub-id round-trip.
 *
 * We append a structured sub-id `dealradar_<country>_<category>_<productHex>`
 * for attribution where the network supports it. The productId is hex-encoded
 * (delimiter-free), so the postback handler recovers the EXACT original
 * productId losslessly via decodeSubId — even when the productId itself
 * contains ':' '-' '.' or other separators.
 *
 * Browser-safe: used by client components, so no Buffer (TextEncoder only).
 */
const SUBID_PARAM: Record<string, string> = {
  kelkoo: 'custom1',
  awin: 'clickref',
  tradedoubler: 'epi',
  strackr: 'subid',
};

const SUBID_PREFIX = 'dealradar';

/** Hex-encode arbitrary UTF-8 → [0-9a-f]*. Browser- and Node-safe. */
function toHex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

function fromHex(hex: string): string {
  const len = hex.length / 2;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
}

/** Build the attribution sub-id. Country/category are sanitized to single, */
/** delimiter-free tokens so the 4-field split is unambiguous. */
export function buildSubId(country?: string, category?: string, productId?: string): string {
  const c = (country || 'ALL').replace(/[^A-Za-z0-9]/g, '') || 'ALL';
  // Strip '_' (the field delimiter) but keep hyphens so slugs like home-garden survive.
  const cat = (category || 'gen').replace(/[^A-Za-z0-9-]/g, '-') || 'gen';
  const id = productId ? toHex(productId) : '';
  return `${SUBID_PREFIX}_${c}_${cat}_${id}`;
}

/**
 * Inverse of buildSubId. Returns null if the value isn't one of ours or is
 * malformed; productId is null when none was encoded.
 */
export function decodeSubId(
  subid: string,
): { country: string; category: string; productId: string | null } | null {
  if (!subid) return null;
  const parts = subid.split('_');
  if (parts.length !== 4 || parts[0] !== SUBID_PREFIX) return null;
  const [, country, category, hex] = parts;
  if (hex === '') return { country, category, productId: null };
  if (hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  let productId: string;
  try {
    productId = fromHex(hex);
  } catch {
    return null;
  }
  // Round-trip guard: re-encoding must reproduce the hex exactly.
  if (toHex(productId) !== hex.toLowerCase()) return null;
  return { country, category, productId };
}

export function decorateAffiliateUrl(
  shopUrl: string,
  source: string,
  country?: string,
  category?: string,
  productId?: string,
): string {
  const param = SUBID_PARAM[source];
  if (!param || !shopUrl) return shopUrl;
  try {
    const url = new URL(shopUrl);
    url.searchParams.set(param, buildSubId(country, category, productId));
    return url.toString();
  } catch {
    return shopUrl;
  }
}
