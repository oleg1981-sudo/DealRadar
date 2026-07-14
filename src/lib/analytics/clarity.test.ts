import { describe, it, expect, vi, afterEach } from 'vitest';
import { clarityEvent, clarityTag } from './clarity';

// Analytics must be unconditionally safe: no-throw without a window/tag, and
// exact forwarding when Clarity is present.
afterEach(() => {
  // @ts-expect-error test cleanup of the simulated browser global
  delete globalThis.window;
});

describe('clarity wrappers', () => {
  it('no-ops (never throws) when window is undefined (SSR)', () => {
    expect(() => clarityEvent('x')).not.toThrow();
    expect(() => clarityTag('k', 'v')).not.toThrow();
  });

  it('no-ops when Clarity is not loaded (no consent)', () => {
    // @ts-expect-error minimal window stub
    globalThis.window = {};
    expect(() => clarityEvent('x')).not.toThrow();
  });

  it('forwards event and tag calls to window.clarity when loaded', () => {
    const spy = vi.fn();
    // @ts-expect-error minimal window stub
    globalThis.window = { clarity: spy };
    clarityEvent('cta_go_to_deal');
    clarityTag('cta_source', 'pdp');
    expect(spy).toHaveBeenCalledWith('event', 'cta_go_to_deal');
    expect(spy).toHaveBeenCalledWith('set', 'cta_source', 'pdp');
  });

  it('swallows a throwing clarity implementation', () => {
    // @ts-expect-error minimal window stub
    globalThis.window = { clarity: () => { throw new Error('boom'); } };
    expect(() => clarityEvent('x')).not.toThrow();
  });
});
