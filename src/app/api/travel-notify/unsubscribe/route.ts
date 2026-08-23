/**
 * Unsubscribe from the TravelDeal launch list.
 *
 * Mirrors /api/alerts/unsubscribe — same HMAC token scheme, same RFC 8058
 * one-click POST, same page shell — but deletes from `travel_signups` and says
 * so in its own words. It is a separate route because the token scopes differ:
 * a launch-list token carries TRAVEL_LAUNCH_SCOPE where an alert token carries
 * a productId, so neither can unsubscribe the other's list.
 *
 * This exists because ePrivacy Art. 13(2) requires a clear opt-out in every
 * direct-marketing message and GDPR Art. 7(3) requires withdrawal to be as easy
 * as the one-field form that granted consent.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { unsubscribePageHtml } from '@/lib/email/unsubscribe-page';
import { unsubscribeTravelSignup, TRAVEL_LAUNCH_SCOPE } from '@/lib/db/travel-signups.repo';
import { verifyUnsubscribeToken } from '@/lib/utils/crypto';

export const runtime = 'nodejs';

function pickLocale(raw: string | null): string {
  return raw && (routing.locales as readonly string[]).includes(raw) ? raw : routing.defaultLocale;
}

async function renderPage(locale: string, kind: 'success' | 'error' | 'confirm'): Promise<string> {
  let title = '';
  let body = '';
  let buttonText = '';

  try {
    const t = await getTranslations({ locale, namespace: 'unsubscribe' });
    if (kind === 'success') {
      title = t('travelSuccessTitle');
      body = t('travelSuccessBody');
    } else if (kind === 'error') {
      // The token failure is the same failure on either list, so this copy is
      // shared rather than duplicated per vertical.
      title = t('errorTitle');
      body = t('errorBody');
    } else {
      title = t('travelConfirmTitle');
      body = t('travelConfirmBody');
      buttonText = t('travelConfirmButton');
    }
  } catch {
    // Same fallback posture as the alerts route: never fail to render the page
    // a person clicked through to, even if message loading breaks.
    if (kind === 'success') {
      title = 'Removed';
      body = 'Your email address has been deleted from the travel launch list.';
    } else if (kind === 'error') {
      title = 'Invalid or expired unsubscribe link';
      body = 'We could not verify the security token. The link may be incomplete or expired.';
    } else {
      title = 'Confirm removal';
      body = 'Click the button below to remove your email address from the travel launch list.';
      buttonText = 'Remove my details';
    }
  }

  return unsubscribePageHtml({ locale, title, body, buttonText: buttonText || undefined });
}

/** GET renders a one-button confirmation; prefetch scanners change no state. */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';
  const locale = pickLocale(searchParams.get('locale'));

  const valid = verifyUnsubscribeToken(email, TRAVEL_LAUNCH_SCOPE, token);
  return new NextResponse(await renderPage(locale, valid ? 'confirm' : 'error'), {
    status: valid ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/** POST performs the removal — RFC 8058 one-click, or the browser form. */
export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';
  const locale = pickLocale(searchParams.get('locale'));

  let isOneClick = false;
  try {
    isOneClick = (await req.clone().text()) === 'List-Unsubscribe=One-Click';
  } catch {
    /* not a one-click body */
  }

  const ok = await unsubscribeTravelSignup(email, token);

  if (isOneClick) {
    return new NextResponse(ok ? 'unsubscribed' : 'invalid token', {
      status: ok ? 200 : 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  return new NextResponse(await renderPage(locale, ok ? 'success' : 'error'), {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
