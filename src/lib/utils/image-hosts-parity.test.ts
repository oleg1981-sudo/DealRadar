// FR-2.2 tripwire class — the matcher is deliberately duplicated (CJS
// script-lib for the watchdog vs. client-bundle TS for SmartImage); only the
// JSON host list in scripts/lib/image-hosts.json is shared. This test is the
// guard against the two copies drifting apart.
import { describe, it, expect } from 'vitest';
import { isAllowedImageHost } from './image-hosts';
// Watchdog lib is a dependency-free CJS script-lib; tests live in src/ (vitest include).
import { hostAllowed } from '../../../scripts/lib/image-hosts.cjs';

function watchdogAllows(url: string): boolean {
  try {
    return hostAllowed(new URL(url).host);
  } catch {
    return false;
  }
}

const CASES: Array<[label: string, url: string, expected: boolean]> = [
  ['bare apex of a wildcarded network', 'https://productserve.com/x.jpg', true],
  ['subdomain of a wildcarded network', 'https://images2.productserve.com/x.jpg', true],
  ['exact-listed non-wildcard host', 'https://cdn.shopify.com/x.jpg', true],
  ['unlisted host', 'https://unknown-merchant.example/x.jpg', false],
  ['lookalike apex (prefix, not subdomain)', 'https://evil-productserve.com/x.jpg', false],
  ['lookalike suffix (subdomain confusion)', 'https://cdn.shopify.com.attacker.test/x.jpg', false],
  ['malformed input', 'not a url', false],
  // URL.host (both implementations use it) includes the port; Next matches on
  // hostname only. A port-carrying URL therefore fails our allowlist and falls
  // back to a plain <img> — the safe direction — even on an otherwise-allowed host.
  ['port-carrying URL on an allowed host', 'https://cdn.shopify.com:8443/x.jpg', false],
];

describe('image-host allowlist parity: cjs watchdog vs ts SmartImage gate', () => {
  it.each(CASES)('%s — %s', (_label, url, expected) => {
    expect(watchdogAllows(url)).toBe(expected);
    expect(isAllowedImageHost(url)).toBe(expected);
  });
});
