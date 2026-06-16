/**
 * Split a free-text query into normalized tokens for matching. Lowercases,
 * splits on non-alphanumerics, drops 1-char noise, and does a light
 * singularization (trailing "s") so menu terms like "OLED TVs" or "Laptops"
 * match product names like "LG 4K OLED TV 55\"" or "Gaming Laptop RTX".
 */
export function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((w) => w.length >= 2)
    .map((w) => (w.length > 2 && w.endsWith('s') ? w.slice(0, -1) : w));
}
