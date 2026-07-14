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

// 1. robots.txt: prod-host sitemap, AI-crawler groups present, crawl traps blocked.
{
  const r = await get('/robots.txt');
  check('robots.txt 200', r.status === 200, `status=${r.status}`);
  check('robots.txt sitemap → dealradar.me', r.body.includes(`${BASE}/sitemap.xml`), r.body.match(/Sitemap:.*/i)?.[0] || 'no Sitemap line');
  for (const ua of ['OAI-SearchBot', 'GPTBot', 'ClaudeBot', 'PerplexityBot']) {
    check(`robots has explicit ${ua} group`, new RegExp(`User-Agent:\\s*${ua}`, 'i').test(r.body), 'group missing');
  }
  check('robots blocks internal search (/*/search)', r.body.includes('/*/search'), 'trap not blocked');
  check('robots blocks seed trap (/*?*seed=)', r.body.includes('/*?*seed='), 'trap not blocked');
}

// 1b. IndexNow key file — engines validate it on every submission; if it 404s,
// all IndexNow pings start silently failing.
{
  const KEY = '36c4f6d24ff2c383742acbda6243bb20';
  const r = await get(`/${KEY}.txt`);
  check('IndexNow key file served', r.status === 200 && r.body.trim() === KEY, `status=${r.status}`);
}

// 1c. Favicon + brand assets — must resolve on the site root so every route's
// auto-generated <link rel="icon"> works, and the OG/JSON-LD logo never 404s.
{
  for (const [path, label] of [
    ['/favicon.ico', 'favicon.ico'],
    ['/icon.png', 'icon.png'],
    ['/apple-icon.png', 'apple-touch icon'],
    ['/manifest.webmanifest', 'web manifest'],
    ['/dealradar-logo.png', 'brand logo (OG/JSON-LD)'],
  ]) {
    const r = await get(path);
    check(`${label} served`, r.status === 200, `${path} status=${r.status}`);
  }
}

// 2. sitemap INDEX + children: XML contract, prod-host deal URLs, zero .eu,
// every child under the 2 MB page-load budget, honest lastmod.
let sampleDealPath = null;
{
  const r = await get('/sitemap.xml');
  check('sitemap.xml 200', r.status === 200, `status=${r.status}`);
  const ct = r.headers.get('content-type') || '';
  check('sitemap Content-Type is XML', /\b(application|text)\/xml\b/.test(ct), ct || 'absent');
  check('sitemap starts with <?xml declaration', r.body.trimStart().startsWith('<?xml'), r.body.slice(0, 40));
  check('sitemap.xml is a sitemap INDEX', r.body.includes('<sitemapindex'), 'no <sitemapindex> root');
  const children = [...r.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  check('index lists static + ≥1 deals child', children.some((c) => c.includes('/sitemaps/static.xml')) && children.some((c) => c.includes('/sitemaps/deals-1.xml')), children.join(', ').slice(0, 120));
  check('index children on prod host, zero .eu', children.length > 0 && children.every((c) => c.startsWith(`${BASE}/`)), 'wrong host in child loc');

  // static child: urlset + hreflang + NO fabricated lastmod
  const st = await get('/sitemaps/static.xml');
  check('static child 200 + urlset', st.status === 200 && st.body.includes('http://www.sitemaps.org/schemas/sitemap/0.9'), `status=${st.status}`);
  const homeBlock = st.body.match(/<url>[\s\S]*?<\/url>/)?.[0] || '';
  check('static child omits fabricated lastmod', !homeBlock.includes('<lastmod>'), homeBlock.includes('<lastmod>') ? 'static entry stamps now()' : 'omitted');
  check('static child carries hreflang alternates', homeBlock.includes('xhtml:link'), 'no alternates');

  // first deals child: deal URLs, real lastmod, zero .eu, < 2 MB
  const d1 = await get('/sitemaps/deals-1.xml');
  check('deals-1 child 200 + urlset', d1.status === 200 && d1.body.includes('<urlset'), `status=${d1.status}`);
  const dealUrls = [...d1.body.matchAll(/<loc>(https:\/\/[^<]*\/deal\/[^<]+)<\/loc>/g)].map((m) => m[1]);
  check('deals-1 lists deal URLs (>50)', dealUrls.length > 50, `dealUrls=${dealUrls.length}`);
  check('deals-1 has ZERO dealradar.eu', !d1.body.includes('dealradar.eu'), 'eu leaked');
  const mb = Buffer.byteLength(d1.body, 'utf8') / 1024 / 1024;
  check('deals-1 under the 2 MB budget', mb < 2, `${mb.toFixed(2)} MB (chunking at 500/sitemap)`);
  check('deals-1 entries carry real lastmod', d1.body.includes('<lastmod>'), 'lastmod missing');
  if (dealUrls[0]) sampleDealPath = dealUrls[0].replace(BASE, '');
}

// 3. a real deal PDP: 200, canonical on prod host, escaped single-Offer JSON-LD.
if (sampleDealPath) {
  const r = await get(sampleDealPath);
  check('deal PDP 200', r.status === 200, `${sampleDealPath} status=${r.status}`);
  const canon = r.body.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/)?.[1];
  check('PDP canonical → dealradar.me', !!canon && canon.startsWith(`${BASE}/`), canon || 'no canonical');
  // A page can carry several ld+json nodes (Organization from the layout,
  // Product + BreadcrumbList from the PDP) — find the Product node.
  const ldBlocks = [...r.body.matchAll(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map((m) => m[1]);
  const parsedBlocks = ldBlocks.map((b) => { try { return JSON.parse(b); } catch { return null; } });
  const product = parsedBlocks.find((p) => p?.['@type'] === 'Product');
  check('PDP JSON-LD parseable + has Product node', !!product, `types=${parsedBlocks.map((p) => p?.['@type'] || 'unparseable').join(',')}`);
  check('PDP Product offer is single Offer (not AggregateOffer)', product?.offers?.['@type'] === 'Offer', product?.offers?.['@type'] || '?');
  // The escape fix: a raw </script> must never appear inside any ld+json block.
  const noBreakout = ldBlocks.length > 0 && ldBlocks.every((b) => !/<\/script/i.test(b));
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
  check('CSP allows Clarity analytics tag', h('content-security-policy').includes('clarity.ms'), 'clarity.ms not in script-src');
  check('CSP allows GA4 gtag.js', h('content-security-policy').includes('googletagmanager.com'), 'googletagmanager.com not in script-src');
  // Consent-gated analytics never appear in initial HTML; the server-rendered
  // CTA instrumentation is the shipped-analytics proxy.
  check('CTA instrumentation present (data-analytics-event)', r.body.includes('data-analytics-event="cta_go_to_deal"'), 'no instrumented CTA in homepage HTML');
  check('no analytics tag pre-consent (clarity)', !r.body.includes('clarity.ms/tag'), 'clarity tag in initial HTML');
  check('no analytics tag pre-consent (gtag)', !r.body.includes('googletagmanager.com/gtag'), 'gtag in initial HTML');
  check('favicon link in page head', /<link[^>]+rel="icon"/.test(r.body), 'no <link rel="icon">');
  check('og:image meta present', /property="og:image"/.test(r.body), 'no og:image');
  check('Organization JSON-LD (brand entity) present', r.body.includes('"@type":"Organization"'), 'no Organization node');
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
