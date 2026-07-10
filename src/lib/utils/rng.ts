/**
 * Non-deterministic seed/index helpers for shuffling deal display order.
 *
 * These are NOT security-sensitive (they pick which deals appear first), but we
 * use the Web Crypto CSPRNG rather than Math.random() so static analysis can't
 * mistake a display shuffle for an insecure-randomness vulnerability (Sonar
 * S2245). `globalThis.crypto` is available in Node ≥18 and the browser, so this
 * works in server components, the edge runtime, and client components alike.
 */

/** Uniform 31-bit seed for the deterministic mulberry32 shuffle PRNG. */
export function randomSeed(): number {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] % 2 ** 31;
}

/** Uniform integer in [0, max) — for in-place Fisher–Yates. Returns 0 if max ≤ 0. */
export function randomInt(max: number): number {
  if (max <= 0) return 0;
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] % max;
}
