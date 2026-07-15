/**
 * Upstash Redis (REST) cache layer. TTL default 30 minutes — the hard freshness
 * bound from the project constraints ("never stale beyond 30 minutes").
 *
 * Degrades gracefully: if UPSTASH_* env vars are absent (local dev without
 * Redis), every get() misses and set() is a no-op, so the app still works —
 * it just hits Supabase every time.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const URL_ = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

export const CACHE_TTL_SECONDS = 30 * 60;

async function command<T>(args: (string | number)[]): Promise<T | null> {
  if (!URL_ || !TOKEN) return null;
  try {
    const res = await fetch(`${URL_}/${args.map((a) => encodeURIComponent(String(a))).join('/')}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result: T };
    return body.result;
  } catch (e) {
    console.error('[redis] command failed:', e);
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await command<string | null>(['GET', key]);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = CACHE_TTL_SECONDS): Promise<void> {
  await command(['SET', key, JSON.stringify(value), 'EX', ttlSeconds]);
}

/**
 * Atomic sliding-window rate limiters, one per protected endpoint. Uses
 * @upstash/ratelimit, whose Lua-backed algorithm increments and expires in a
 * single atomic round-trip — no racy GET-then-SET (two parallel requests
 * could both read N and both pass). Every limiter fails OPEN when Upstash is
 * unconfigured (local dev / secrets not set), each logging its own one-time
 * "rate-limiter unconfigured" warning so an operator can tell which endpoints
 * are actually unprotected rather than getting one ambiguous global warning.
 *
 * Per-endpoint budgets (documented here, not just in the call sites, so the
 * whole policy is visible in one place):
 *   alerts     5 req / 1h   — cheap to abuse into a third-party inbox flood.
 *   refresh   10 req / 1h   — cron-only in practice (CRON_SECRET-gated), but
 *                             each call fans out a full provider sync; rate
 *                             limiting is defense-in-depth if the secret leaks.
 *   postbacks 60 req / 1m   — webhook receiver; real affiliate networks can
 *                             legitimately burst on conversion spikes, so this
 *                             is sized to tolerate that while still capping
 *                             brute-force/replay floods against the endpoint.
 *   search    30 req / 1m   — typeahead; client already debounces keystrokes,
 *                             this is headroom against scripted abuse, not the
 *                             primary throttle.
 *   deals    120 req / 1m   — the main read/browse path (listing, filters,
 *                             pagination), so it gets the highest ceiling.
 */
type LimiterName = 'alerts' | 'refresh' | 'postbacks' | 'search' | 'deals';
type SlidingWindowDuration = Parameters<typeof Ratelimit.slidingWindow>[1];

const RATE_LIMIT_BUDGETS: Record<LimiterName, [tokens: number, window: SlidingWindowDuration]> = {
  alerts: [5, '1 h'],
  refresh: [10, '1 h'],
  postbacks: [60, '1 m'],
  search: [30, '1 m'],
  deals: [120, '1 m'],
};

const limiters = new Map<LimiterName, Ratelimit | null>();
const warnedUnconfigured = new Set<LimiterName>();

function getLimiter(name: LimiterName): Ratelimit | null {
  const cached = limiters.get(name);
  if (cached !== undefined) return cached;
  if (!URL_ || !TOKEN) {
    if (!warnedUnconfigured.has(name)) {
      console.warn(`[redis] UPSTASH_* not configured — rate-limiter "${name}" unconfigured (fail-open)`);
      warnedUnconfigured.add(name);
    }
    limiters.set(name, null);
    return null;
  }
  const [tokens, window] = RATE_LIMIT_BUDGETS[name];
  const limiter = new Ratelimit({
    redis: new Redis({ url: URL_, token: TOKEN }),
    limiter: Ratelimit.slidingWindow(tokens, window),
    prefix: `ratelimit:${name}`,
    analytics: false,
  });
  limiters.set(name, limiter);
  return limiter;
}

async function checkRateLimit(name: LimiterName, identifier: string): Promise<{ success: boolean }> {
  const limiter = getLimiter(name);
  if (!limiter) return { success: true }; // fail-open when Redis is absent
  try {
    const { success } = await limiter.limit(identifier);
    return { success };
  } catch (e) {
    console.error(`[redis] rate-limit check failed for "${name}" (fail-open):`, e);
    return { success: true };
  }
}

export async function rateLimitAlerts(identifier: string): Promise<{ success: boolean }> {
  return checkRateLimit('alerts', identifier);
}

export async function rateLimitRefresh(identifier: string): Promise<{ success: boolean }> {
  return checkRateLimit('refresh', identifier);
}

export async function rateLimitPostbacks(identifier: string): Promise<{ success: boolean }> {
  return checkRateLimit('postbacks', identifier);
}

export async function rateLimitSearch(identifier: string): Promise<{ success: boolean }> {
  return checkRateLimit('search', identifier);
}

export async function rateLimitDeals(identifier: string): Promise<{ success: boolean }> {
  return checkRateLimit('deals', identifier);
}

/**
 * One-time-use claim for a postback HMAC signature (replay dedup — see
 * src/app/api/postbacks/route.ts). SET NX EX means the FIRST request bearing
 * a given signature within `ttlSeconds` claims the key and proceeds; any
 * later request presenting the identical signature within that window is a
 * replay and is rejected. Fails OPEN (treats as "not yet claimed") when Redis
 * is unconfigured — consistent with every other function in this file:
 * availability over strict replay-proofing when the cache is down.
 */
export async function claimPostbackSignature(signatureHex: string, ttlSeconds: number): Promise<boolean> {
  if (!URL_ || !TOKEN) return true;
  const result = await command<string | null>(['SET', `postback:sig:${signatureHex}`, '1', 'NX', 'EX', ttlSeconds]);
  return result === 'OK';
}

/** Stable cache key from route + sorted params. */
export function cacheKey(scope: string, params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `dealradar:${scope}:${parts.join('&')}`;
}
