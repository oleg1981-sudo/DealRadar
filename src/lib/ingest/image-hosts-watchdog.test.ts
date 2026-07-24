// FR-2.2 tripwire — watchdog side of the image-host gate. The runtime side
// (SmartImage) is covered by src/lib/utils/image-hosts.test.ts; this file
// guards the half that broke: the watchdog once read its patterns by scraping
// next.config.mjs, so moving the list into JSON silently emptied the pattern
// set and every host in the DB was reported uncovered (issue #27).
import { describe, it, expect } from 'vitest';
// Watchdog libs are dependency-free CJS script-libs; tests live in src/ (vitest include).
import { hosts, hostAllowed, uncoveredImageHosts } from '../../../scripts/lib/image-hosts.cjs';

describe('watchdog image-host allowlist', () => {
  it('loads a non-empty pattern list', () => {
    // The empty-pattern state is the bug itself: it makes every host "uncovered".
    expect(hosts.length).toBeGreaterThan(0);
  });

  it('covers the hosts the digest wrongly flagged', () => {
    for (const h of ['images2.productserve.com', 'www.sanicare.de', 'cdn.shopify.com', 'lyra-pet.de', 'mediakos.de']) {
      expect(hostAllowed(h)).toBe(true);
    }
  });

  it('matches wildcards on the apex and on subdomains, exact hosts exactly', () => {
    expect(hostAllowed('productserve.com')).toBe(true);
    expect(hostAllowed('images2.productserve.com')).toBe(true);
    expect(hostAllowed('evil-productserve.com')).toBe(false);
    expect(hostAllowed('cdn.shopify.com.attacker.test')).toBe(false);
  });
});

describe('uncoveredImageHosts', () => {
  it('reports nothing when every deal image is on an allowed host', () => {
    const rows = [
      { image_url: 'https://images2.productserve.com/a.jpg', gallery: ['https://cdn.shopify.com/b.jpg'] },
      { image_url: 'https://www.sanicare.de/c.jpg', gallery: null },
    ];
    expect([...uncoveredImageHosts(rows).keys()]).toEqual([]);
  });

  it('counts rows per uncovered host across image_url and gallery', () => {
    const rows = [
      { image_url: 'https://new-merchant.example/a.jpg', gallery: ['https://new-merchant.example/b.jpg'] },
      { image_url: 'https://other.example/c.jpg', gallery: [] },
      { image_url: null, gallery: ['not a url'] },
    ];
    expect(uncoveredImageHosts(rows)).toEqual(
      new Map([['new-merchant.example', 2], ['other.example', 1]]),
    );
  });
});
