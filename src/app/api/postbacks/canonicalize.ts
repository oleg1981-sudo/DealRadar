/**
 * Deterministic canonical form of a postback's query params, used as the
 * signed "message" for GET's `sig` (see route.ts#checkAuthGet). Excludes
 * `secret` and `sig` themselves; every other param (including `ts`) is kept,
 * sorted by (decoded) key ascending, each key/value pair re-encoded via
 * encodeURIComponent and joined as `k=v&k=v`.
 *
 * Re-encoding (rather than joining the raw decoded values) closes a
 * signature-forging ambiguity: without it, two different param sets could
 * canonicalize to the identical string if a value itself contained a literal
 * `&` or `=`.
 *
 * This lives in its own module — NOT exported from route.ts — because
 * Next.js's App Router route-file convention only allows HTTP-method
 * handlers plus a small set of config exports (`runtime`, `dynamic`, …) from
 * a `route.ts`; any other named export fails the generated route types
 * (`.next/types/app/**\/route.ts`). Tests import this module directly so
 * they sign requests exactly the way the route verifies them — no separate
 * reimplementation to drift out of sync.
 */
export function canonicalizePostbackQuery(searchParams: URLSearchParams): string {
  const pairs: [string, string][] = [];
  for (const [k, v] of searchParams) {
    if (k === 'secret' || k === 'sig') continue;
    pairs.push([k, v]);
  }
  pairs.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}
