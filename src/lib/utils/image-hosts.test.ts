// FR-2.2 tripwire class — host gate parity with next.config remotePatterns.
import { describe, it, expect } from 'vitest';
import { matchRemotePattern } from 'next/dist/shared/lib/match-remote-pattern';
import { isAllowedImageHost } from './image-hosts';
import hostsJson from '../../../scripts/lib/image-hosts.json';

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

describe('next/image remotePatterns (mirrors next.config.mjs construction)', () => {
  const remotePatterns = (hostsJson as { hosts: string[] }).hosts.map((hostname) => ({
    protocol: 'https' as const,
    hostname,
  }));

  it('matches the bare apex of merchant networks that also carry a wildcard subdomain pattern', () => {
    // Next's '**.' wildcard requires at least one subdomain segment — it does NOT
    // match the apex (verified against next@14.2.35's match-remote-pattern), even
    // though isAllowedImageHost/hostAllowed both treat the apex as covered. A
    // bare-apex feed URL would otherwise pass our gate straight into next/image's
    // loader, which throws "hostname not configured" for it — the exact crash
    // SmartImage exists to prevent. Every wildcarded network needs its apex listed
    // as its own exact entry so next.config.mjs's generated remotePatterns agree.
    for (const apex of ['awin1.com', 'kelkoogroup.net', 'productserve.com', 'strackr.com', 'tradedoubler.com']) {
      const url = new URL(`https://${apex}/x.jpg`);
      const matched = remotePatterns.some((p) => matchRemotePattern(p, url));
      expect(matched).toBe(true);
    }
  });
});
