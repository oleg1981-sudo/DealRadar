// FR-2.2 tripwire class — host gate parity with next.config remotePatterns.
import { describe, it, expect } from 'vitest';
import { isAllowedImageHost } from './image-hosts';

describe('isAllowedImageHost', () => {
  it('allows exact hosts from the shared list', () => {
    expect(isAllowedImageHost('https://cdn.shopify.com/x.jpg')).toBe(true);
    expect(isAllowedImageHost('https://mediakos.de/img/y.png')).toBe(true);
  });
  it('allows wildcard subdomain patterns', () => {
    expect(isAllowedImageHost('https://images2.productserve.com/?url=x')).toBe(true);
  });
  it('rejects unlisted hosts and garbage', () => {
    expect(isAllowedImageHost('https://unknown-merchant.example/x.jpg')).toBe(false);
    expect(isAllowedImageHost('not a url')).toBe(false);
  });
});
