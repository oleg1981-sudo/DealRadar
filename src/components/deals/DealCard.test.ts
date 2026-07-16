import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Affiliate disclosure badge presence', () => {
  it('ensures DealCard renders the SponsoredBadge', () => {
    const cardPath = path.resolve(process.cwd(), 'src/components/deals/DealCard.tsx');
    const content = fs.readFileSync(cardPath, 'utf8');

    // Assert that the component imports and uses SponsoredBadge
    expect(content).toContain("import { SponsoredBadge } from './SponsoredBadge';");
    expect(content).toContain('<SponsoredBadge');
  });

  it('ensures PDP detail page renders the SponsoredBadge', () => {
    const pagePath = path.resolve(process.cwd(), 'src/app/[locale]/deal/[slug]/page.tsx');
    const content = fs.readFileSync(pagePath, 'utf8');

    // Assert that the page imports and uses SponsoredBadge
    expect(content).toContain("import { SponsoredBadge } from '@/components/deals/SponsoredBadge';");
    expect(content).toContain('<SponsoredBadge');
  });

  it('enumerates all components calling decorateAffiliateUrl and ensures they render a badge', () => {
    // Audit all decorateAffiliateUrl call sites in components (src/components/ or src/app/)
    const srcDir = path.resolve(process.cwd(), 'src');
    const filesToCheck: string[] = [];

    function walk(dir: string) {
      for (const file of fs.readdirSync(dir)) {
        const full = path.join(dir, file);
        if (fs.statSync(full).isDirectory()) {
          walk(full);
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          filesToCheck.push(full);
        }
      }
    }
    walk(srcDir);

    const callSites: string[] = [];
    for (const f of filesToCheck) {
      const code = fs.readFileSync(f, 'utf8');
      if (code.includes('decorateAffiliateUrl') && !f.endsWith('.test.ts') && !f.endsWith('affiliate.ts')) {
        callSites.push(f);
        // If it's a component or page rendering an affiliate URL, it must include a SponsoredBadge
        if (f.endsWith('.tsx')) {
          expect(code).toContain('SponsoredBadge');
        }
      }
    }

    // Ensure we found both known components
    expect(callSites.some(f => f.endsWith('DealCard.tsx'))).toBe(true);
    expect(callSites.some(f => f.endsWith('page.tsx'))).toBe(true);
  });
});
