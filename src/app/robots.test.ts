import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/utils/site-url', () => ({ siteUrl: () => 'https://dealradar.me' }));

import robots from './robots';

type Rule = { userAgent: string; allow?: string; disallow?: string | string[] };
const rules = robots().rules as Rule[];
const asList = (d: Rule['disallow']) => (Array.isArray(d) ? d : d ? [d] : []);

describe('robots', () => {
  it('blocks Next.js RSC payloads for every crawler it lets in', () => {
    // A robots.txt group does not inherit from `*`, so a rule missing from any
    // ALLOW group is a rule that crawler never sees.
    const allowGroups = rules.filter((r) => r.allow === '/');
    expect(allowGroups.length).toBeGreaterThan(1);
    for (const r of allowGroups) {
      expect(asList(r.disallow), r.userAgent).toContain('/*?*_rsc=');
    }
  });

  it('still lets Googlebot reach ordinary pages and pagination', () => {
    const star = rules.find((r) => r.userAgent === '*')!;
    expect(star.allow).toBe('/');
    // `?page=` must stay crawlable — only `_rsc` and the facet params are cut.
    expect(asList(star.disallow).some((d) => d.includes('page='))).toBe(false);
  });

  it('keeps training crawlers blocked outright', () => {
    const gpt = rules.find((r) => r.userAgent === 'GPTBot')!;
    expect(gpt.disallow).toBe('/');
  });
});
