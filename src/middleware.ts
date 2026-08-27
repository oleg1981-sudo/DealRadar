import { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { SUPPORTED_COUNTRIES } from './lib/providers/types';

const handleIntl = createMiddleware(routing);

/** Paths served from the CDN cache — must match the cache-header sources in
 *  next.config.mjs (`/:locale/deal/:slug` and its `/md` variant). */
const CDN_CACHED_PATH = /^\/[a-z]{2}\/deal\//;

export default function middleware(req: NextRequest) {
  const res = handleIntl(req);

  // A CDN-cached response must NEVER carry a per-visitor Set-Cookie: the first
  // visitor's cookie would be stored in the cache entry and replayed to every
  // later visitor behind it — pinning them to that visitor's detected country.
  // (Harmless today while DE is the only active market and also the fallback,
  // but it silently becomes a real bug the moment a second market activates.)
  // Many CDNs additionally refuse to cache any Set-Cookie response, which would
  // quietly defeat the caching these pages depend on.
  // Safe to strip here: the locale is already in the URL and the deal page
  // reads no location — the cookies are still set on every other (uncached)
  // page, so a visitor landing on a deal page first gets them on their next
  // navigation.
  if (CDN_CACHED_PATH.test(req.nextUrl.pathname)) {
    res.headers.delete('set-cookie');
    return res;
  }

  // If geo cookie isn't set yet, extract platform edge geo headers
  if (!req.cookies.has('dr_location')) {
    const headerCountry = (
      req.headers.get('x-nf-country') ||
      req.headers.get('x-vercel-ip-country') ||
      req.headers.get('cf-ipcountry') ||
      'DE'
    ).toUpperCase();

    const matchedCountry = (SUPPORTED_COUNTRIES as readonly string[]).includes(headerCountry)
      ? headerCountry
      : 'DE';

    res.cookies.set('dr_location', `${matchedCountry}|`, {
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: 'lax',
    });
  }

  return res;
}

export const config = {
  // Skip API routes, Next internals and static files.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
