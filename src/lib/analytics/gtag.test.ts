import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Controllable consent state — gaEvent must gate on it.
const consent = vi.hoisted(() => ({ granted: false }));
vi.mock('vanilla-cookieconsent', () => ({
  acceptedCategory: () => consent.granted,
}));

import { gaEvent, gaConsentUpdate, gaFlushPending, GA_ID } from './gtag';

beforeEach(() => {
  consent.granted = false;
  gaFlushPending(); // drain any buffer state between tests (window absent → clears)
});
afterEach(() => {
  // @ts-expect-error test cleanup of the simulated browser global
  delete globalThis.window;
});

describe('gtag wrappers', () => {
  it('no-ops (never throws) when window is undefined (SSR)', () => {
    expect(() => gaEvent('x')).not.toThrow();
    expect(() => gaConsentUpdate(true)).not.toThrow();
  });

  it('DROPS events without consent, even with the tag loaded', () => {
    const spy = vi.fn();
    // @ts-expect-error minimal window stub
    globalThis.window = { gtag: spy };
    consent.granted = false;
    gaEvent('view_item', { value: 1 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('forwards events with params when consented and loaded', () => {
    const spy = vi.fn();
    // @ts-expect-error minimal window stub
    globalThis.window = { gtag: spy };
    consent.granted = true;
    gaEvent('affiliate_click', { merchant: 'TestShop', price: 9.99 });
    expect(spy).toHaveBeenCalledWith('event', 'affiliate_click', { merchant: 'TestShop', price: 9.99 });
  });

  it('buffers consented events fired before the tag loads, flushes after', () => {
    // @ts-expect-error minimal window stub (no gtag yet — the landing-page race)
    globalThis.window = {};
    consent.granted = true;
    gaEvent('view_item_list', { item_list_name: 'home_hero' });
    const spy = vi.fn();
    (globalThis.window as unknown as { gtag: unknown }).gtag = spy;
    gaFlushPending();
    expect(spy).toHaveBeenCalledWith('event', 'view_item_list', { item_list_name: 'home_hero' });
  });

  it('consent update toggles the ga-disable kill switch and grants ONLY analytics_storage', () => {
    const spy = vi.fn();
    // @ts-expect-error minimal window stub
    globalThis.window = { gtag: spy };
    gaConsentUpdate(true);
    expect((globalThis.window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`]).toBe(false);
    expect(spy).toHaveBeenCalledWith('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    gaConsentUpdate(false);
    expect((globalThis.window as unknown as Record<string, unknown>)[`ga-disable-${GA_ID}`]).toBe(true);
    expect(spy).toHaveBeenLastCalledWith('consent', 'update', expect.objectContaining({ analytics_storage: 'denied' }));
  });

  it('swallows a throwing gtag implementation', () => {
    // @ts-expect-error minimal window stub
    globalThis.window = { gtag: () => { throw new Error('boom'); } };
    consent.granted = true;
    expect(() => gaEvent('x')).not.toThrow();
  });
});
