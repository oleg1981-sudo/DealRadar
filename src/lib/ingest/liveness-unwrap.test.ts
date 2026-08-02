// Regression guard for the 2026-08 Aliva mass-hide: verify-liveness probed the
// t23.intelliad.de click tracker (which 404s for datacenter IPs) instead of the
// wrapped aliva.de product page, and hid ~16k live deals as "gone". The probe
// URL must be the unwrapped destination, never the tracker.
import { describe, it, expect } from 'vitest';
// Script is dependency-free CJS; tests live in src/ (vitest include).
import { unwrapTrackerUrl, isShopifyProductUrl } from '../../../scripts/verify-liveness.cjs';

// Real (redacted) shape of an Aliva merchant_url from the AWIN feed: the
// destination is percent-encoded once in `redirect=`, with its own query
// double-encoded.
const ALIVA_TRACKER =
  'https://t23.intelliad.de/index.php?cl=530&bm=100&cp=101&subid=AWIN' +
  '&redirect=https%3A%2F%2Fwww.aliva.de%2Fp%2Fdorm-20-tabletten-01580867' +
  '%3FaffiliateCode%3Dawin%26utm_source%3Dawin%2526awc%253D!!!awc!!!';

describe('unwrapTrackerUrl', () => {
  it('extracts the wrapped aliva.de product page from the intelliad tracker', () => {
    const target = unwrapTrackerUrl(ALIVA_TRACKER);
    expect(target.startsWith('https://www.aliva.de/p/dorm-20-tabletten-01580867')).toBe(true);
    expect(new URL(target).host).toBe('www.aliva.de');
  });

  it('handles a double-encoded destination', () => {
    const doubly = 'https://tracker.example/go?redirect=' +
      encodeURIComponent(encodeURIComponent('https://shop.example/p/x-123'));
    expect(unwrapTrackerUrl(doubly)).toBe('https://shop.example/p/x-123');
  });

  it('returns direct product URLs unchanged', () => {
    const direct = 'https://lyra-pet.de/artikel/hundefutter-42?utm_source=awin';
    expect(unwrapTrackerUrl(direct)).toBe(direct);
  });

  it('ignores non-URL redirect params and falls back to the original', () => {
    const weird = 'https://tracker.example/go?redirect=not-a-url&x=1';
    expect(unwrapTrackerUrl(weird)).toBe(weird);
  });

  it('survives malformed input without throwing', () => {
    expect(unwrapTrackerUrl('not a url at all')).toBe('not a url at all');
    expect(unwrapTrackerUrl('')).toBe('');
  });
});

describe('isShopifyProductUrl', () => {
  it('keeps the ownership split with the Shopify verifier intact', () => {
    expect(isShopifyProductUrl('https://rockbrosbike.de/products/some-handle')).toBe(true);
    expect(isShopifyProductUrl(ALIVA_TRACKER)).toBe(false);
  });
});
