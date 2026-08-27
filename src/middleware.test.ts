// CDN cache-safety contract for the middleware.
//
// Deal pages are served from a CDN (see the cache headers in next.config.mjs).
// A cached response that carries Set-Cookie stores the FIRST visitor's cookies
// in the cache entry and replays them to everyone behind it — pinning later
// visitors to that visitor's detected country. These tests pin the invariant so
// a future middleware change can't silently reintroduce it.
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import middleware from './middleware';

const req = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(`https://dealradar.me${path}`, { headers });

describe('middleware — CDN-cached paths ship cookie-free', () => {
  it('strips Set-Cookie on a deal page', () => {
    const res = middleware(req('/de/deal/seifenspender-gold-awin-40164107238'));
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('strips Set-Cookie on the /md deal variant and for every locale', () => {
    for (const path of [
      '/de/deal/x-awin-1/md',
      '/en/deal/x-awin-1',
      '/fr/deal/x-awin-1',
    ]) {
      expect(middleware(req(path)).headers.get('set-cookie'), path).toBeNull();
    }
  });

  it('strips it even when the visitor presents a foreign geo header', () => {
    // The exact poisoning vector: an AT visitor must not seed `dr_location=AT`
    // into the shared cache entry for a /de/deal/… URL.
    const res = middleware(req('/de/deal/x-awin-1', { 'cf-ipcountry': 'AT' }));
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('middleware — uncached paths still set cookies', () => {
  it('sets the location cookie on home, category and search', () => {
    for (const path of ['/de', '/de/category/electronics', '/de/search?q=akku']) {
      const cookie = middleware(req(path)).headers.get('set-cookie') ?? '';
      expect(cookie, path).toContain('dr_location=');
    }
  });

  it('honours the Cloudflare geo header (the app now sits behind Cloudflare)', () => {
    const cookie = middleware(req('/de', { 'cf-ipcountry': 'AT' })).headers.get('set-cookie') ?? '';
    expect(cookie).toContain('dr_location=AT');
  });

  it('falls back to DE for an unsupported country', () => {
    const cookie = middleware(req('/de', { 'cf-ipcountry': 'US' })).headers.get('set-cookie') ?? '';
    expect(cookie).toContain('dr_location=DE');
  });

  it('does not re-set the location cookie when the visitor already has one', () => {
    const r = req('/de');
    r.cookies.set('dr_location', 'AT|Wien');
    const cookie = middleware(r).headers.get('set-cookie') ?? '';
    expect(cookie).not.toContain('dr_location=');
  });
});
