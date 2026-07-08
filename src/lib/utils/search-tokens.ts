/**
 * Split a free-text query into normalized tokens for matching. Lowercases,
 * splits on anything that isn't a letter or digit (Unicode-aware, so German
 * words like "Geländer" or "Küche" stay whole instead of splitting at the
 * umlaut), drops 1-char noise, and does a light singularization (trailing "s")
 * so menu terms like "OLED TVs" or "Laptops" match product names like
 * "LG 4K OLED TV 55\"" or "Gaming Laptop RTX".
 *
 * SAFETY: tokens contain ONLY letters/digits — no PostgREST-reserved characters
 * (, . ( ) ") and no LIKE wildcards (% _) — so callers may interpolate them
 * into ilike filters (see deals.repo).
 */
export function queryTokens(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2)
    .map((w) => (w.length > 2 && w.endsWith('s') ? w.slice(0, -1) : w));
}
