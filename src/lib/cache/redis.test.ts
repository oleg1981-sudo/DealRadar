import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Mocks for the two Upstash packages so these tests don't need a live Redis.
 * The mock Ratelimit.limit() is driven by a per-prefix queue of results so we
 * can simulate "request N passes, request N+1 is denied" without looping
 * hundreds of real calls through the vendor's sliding-window math — that
 * math is @upstash/ratelimit's own tested code, not ours. What we're testing
 * here is OUR factory (src/lib/cache/redis.ts): does it wire each named
 * limiter to its own window/prefix, keep limiters independent of each other,
 * and fail open with a one-time warning when Upstash is unconfigured.
 */
const h = vi.hoisted(() => ({ queues: new Map<string, boolean[]>() }));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(_opts: unknown) {}
  },
}));

vi.mock('@upstash/ratelimit', () => {
  class Ratelimit {
    prefix: string;
    constructor(opts: { prefix: string }) {
      this.prefix = opts.prefix;
    }
    async limit(_identifier: string) {
      const queue = h.queues.get(this.prefix);
      const success = queue && queue.length ? queue.shift()! : true;
      return { success };
    }
    static slidingWindow(tokens: number, window: string) {
      return { tokens, window };
    }
  }
  return { Ratelimit };
});

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  h.queues.clear();
  vi.resetModules();
  process.env = { ...ORIGINAL_ENV };
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe('rate limiters — fail-open when Upstash is unconfigured', () => {
  it('every named limiter returns success:true and warns exactly once each', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const redis = await import('./redis');

    expect(await redis.rateLimitAlerts('1.2.3.4')).toEqual({ success: true });
    expect(await redis.rateLimitRefresh('1.2.3.4')).toEqual({ success: true });
    expect(await redis.rateLimitPostbacks('1.2.3.4')).toEqual({ success: true });
    expect(await redis.rateLimitSearch('1.2.3.4')).toEqual({ success: true });
    expect(await redis.rateLimitDeals('1.2.3.4')).toEqual({ success: true });

    // Call each again — the "unconfigured" warning must not repeat per call.
    await redis.rateLimitAlerts('5.6.7.8');
    await redis.rateLimitDeals('5.6.7.8');

    const messages = warn.mock.calls.map((c) => String(c[0]));
    for (const name of ['alerts', 'refresh', 'postbacks', 'search', 'deals']) {
      const matches = messages.filter((m) => m.includes(name) && m.includes('rate-limiter') && m.includes('unconfigured'));
      expect(matches).toHaveLength(1);
    }
  });

  it('claimPostbackSignature fails open (returns true / "claimed") with no Redis configured', async () => {
    const redis = await import('./redis');
    expect(await redis.claimPostbackSignature('some-signature', 300)).toBe(true);
    // Fail-open means it can't actually dedup — calling again with the same
    // signature still returns true, since there's nothing tracking state.
    expect(await redis.claimPostbackSignature('some-signature', 300)).toBe(true);
  });
});

describe('rate limiters — configured (mocked Upstash), limiters are independently keyed', () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';
  });

  it('the (N+1)th request against a given limiter is denied while other limiters are unaffected', async () => {
    const redis = await import('./redis');

    // Simulate the deals limiter's budget being exhausted: its next call is denied.
    h.queues.set('ratelimit:deals', [true, false]);

    expect(await redis.rateLimitDeals('9.9.9.9')).toEqual({ success: true }); // request N
    expect(await redis.rateLimitDeals('9.9.9.9')).toEqual({ success: false }); // request N+1 → 429 upstream

    // A completely different limiter (different prefix / no queued denial) is untouched.
    expect(await redis.rateLimitSearch('9.9.9.9')).toEqual({ success: true });
    expect(await redis.rateLimitPostbacks('9.9.9.9')).toEqual({ success: true });
  });

  it('claimPostbackSignature: first claim succeeds, replay of the same signature is rejected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: 'OK' }) }) // SET NX succeeds (first claim)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: null }) }); // NX no-op (already claimed)
    vi.stubGlobal('fetch', fetchMock);

    const redis = await import('./redis');
    expect(await redis.claimPostbackSignature('sig-abc', 300)).toBe(true);
    expect(await redis.claimPostbackSignature('sig-abc', 300)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
