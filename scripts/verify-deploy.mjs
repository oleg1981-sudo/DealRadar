#!/usr/bin/env node
/**
 * Deploy acceptance test — asserts the LIVE site reflects the ship-gate
 * remediation. Dependency-free (global fetch). Exit 0 = deploy verified.
 *
 *   node scripts/verify-deploy.mjs [https://dealradar.me]
 *
 * These assertions are the executable spec of "the correct build is live":
 * they FAIL against the old build (wrong-domain sitemap, no CSP, raw i18n key)
 * and PASS once the remediated build deploys. Re-run after every deploy.
 */
const BASE = (process.argv[2] || 'https://dealradar.me').replace(/\/+$/, '');
let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`[verify] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, { redirect: 'follow', headers: { 'user-agent': 'dealradar-deploy-verify' } });
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
};

// 1. robots.txt points its sitemap at the prod host.
{
  const r = await get('/robots.txt');
  check('robots.txt 200', r.status === 200, `status=${r.status}`);
  check('robots.txt sitemap → dealradar.me', r.body.includes(`${BASE}/sitemap.xml`), r.body.match(/Sitemap:.*/i)?.[0] || 'no Sitemap line');
}

// 2. sitemap: prod-host deal URLs, zero .eu, not a stale empty build.
let sampleDealPath = null;
{
  const r = await get('/sitemap.xml');
  check('sitemap.xml 200', r.status === 200, `status=${r.status}`);
  const eu = (r.body.match(/dealradar\.eu/g) || []).length;
  const dealUrls = [...r.body.matchAll(/<loc>(https:\/\/[^<]*\/deal\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  check('sitemap has ZERO dealradar.eu', eu === 0, `eu=${eu}`);
  check('sitemap lists deal URLs (>50, DB has ~835)', dealUrls.length > 50, `dealUrls=${dealUrls.length}`);
  if (dealUrls[0]) sampleDealPath = dealUrls[0].replace(BASE, '');
}

// 3. a real deal PDP: 200, canonical on prod host, escaped single-Offer JSON-LD.
if (sampleDealPath) {
  const r = await get(sampleDealPath);
  check('deal PDP 200', r.status === 200, `${sampleDealPath} status=${r.status}`);
  const canon = r.body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1];
  check('PDP canonical → dealradar.me', !!canon && canon.startsWith(`${BASE}/`), canon || 'no canonical');
  const ld = r.body.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)?.[1];
  let parsed = null;
  try { parsed = ld ? JSON.parse(ld) : null; } catch { /* stays null */ }
  check('PDP JSON-LD present + parseable', !!parsed, parsed ? `@type=${parsed['@type']}` : (ld ? 'unparseable' : 'absent'));
  check('PDP JSON-LD is single Offer (not AggregateOffer)', parsed?.offers?.['@type'] === 'Offer', parsed?.offers?.['@type'] || '?');
  // The escape fix: a raw </script> must never appear inside the ld+json block.
  const noBreakout = !!ld && !/<\/script/i.test(ld);
  check('PDP JSON-LD has no raw </script> breakout', noBreakout, noBreakout ? 'escaped' : 'raw </script> present');
} else {
  check('deal PDP reachable (needs a sitemap deal URL)', false, 'no sample deal slug from sitemap');
}

// 4. security headers on an app route.
{
  const r = await get('/en');
  const h = (k) => r.headers.get(k) || '';
  check('/en 200', r.status === 200, `status=${r.status}`);
  check('CSP present w/ frame-ancestors none', /frame-ancestors 'none'/.test(h('content-security-policy')), h('content-security-policy').slice(0, 60) || 'absent');
  check('X-Frame-Options DENY', h('x-frame-options').toUpperCase() === 'DENY', h('x-frame-options') || 'absent');
  check('X-Content-Type-Options nosniff', h('x-content-type-options') === 'nosniff', h('x-content-type-options') || 'absent');
  check('HSTS max-age=63072000 (this build)', h('strict-transport-security').includes('63072000'), h('strict-transport-security') || 'absent');
  // 6. i18n regression: the literal key must NOT render on deal cards.
  check('homepage does not leak literal "deal.priceNote"', !r.body.includes('deal.priceNote'), 'raw i18n key in HTML');
}

// 5. search page is noindex (crawl-trap hygiene).
{
  const r = await get('/en/search');
  const robotsMeta = r.body.match(/<meta name="robots" content="([^"]+)"/)?.[1] || r.headers.get('x-robots-tag') || '';
  check('/en/search is noindex', /noindex/i.test(robotsMeta), robotsMeta || 'no noindex signal');
}

console.log(failures === 0 ? `\n[verify] DEPLOY VERIFIED — all checks passed against ${BASE}` : `\n[verify] ${failures} check(s) FAILED against ${BASE}`);
process.exit(failures === 0 ? 0 : 1);
