import { NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { SUPPORTED_COUNTRIES } from './lib/providers/types';

const handleIntl = createMiddleware(routing);

export default function middleware(req: NextRequest) {
  const res = handleIntl(req);

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
