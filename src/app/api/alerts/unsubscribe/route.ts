import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/utils/crypto';
import { supabase, supabaseConfigured } from '@/lib/db/supabase';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { unsubscribePageHtml } from '@/lib/email/unsubscribe-page';

export const runtime = 'nodejs';

/** Verify the HMAC token and (idempotently) delete the subscription. */
async function unsubscribe(email: string, productId: string, token: string): Promise<boolean> {
  if (!verifyUnsubscribeToken(email, productId, token)) return false;
  if (supabaseConfigured()) {
    const { error } = await supabase()
      .from('price_alerts')
      .delete()
      .eq('email', email.toLowerCase().trim())
      .eq('product_id', productId);
    if (error) console.error('[unsubscribe] DB deletion failed:', error.message);
  }
  return true; // idempotent: success even if the row was already gone
}

function pickLocale(raw: string | null): string {
  return raw && (routing.locales as readonly string[]).includes(raw) ? raw : routing.defaultLocale;
}

/** Render a localized HTML card page. */
async function renderHtmlPage(locale: string, namespace: 'success' | 'error' | 'confirm'): Promise<string> {
  let title = '';
  let body = '';
  let buttonText = '';

  try {
    const t = await getTranslations({ locale, namespace: 'unsubscribe' });
    if (namespace === 'success') {
      title = t('successTitle');
      body = t('successBody');
    } else if (namespace === 'error') {
      title = t('errorTitle');
      body = t('errorBody');
    } else {
      title = t('confirmTitle');
      body = t('confirmBody');
      buttonText = t('confirmButton');
    }
  } catch {
    // Fallback translations if next-intl fails
    if (namespace === 'success') {
      title = 'Unsubscribed successfully';
      body = 'You will no longer receive price-drop alerts for this deal.';
    } else if (namespace === 'error') {
      title = 'Invalid or expired unsubscribe link';
      body = 'We could not verify the security token. The link may be incomplete or expired.';
    } else {
      title = 'Confirm Unsubscribe';
      body = 'Click the button below to confirm that you want to unsubscribe from price-drop alerts for this deal.';
      buttonText = 'Confirm Unsubscribe';
    }
  }

  return unsubscribePageHtml({ locale, title, body, buttonText: buttonText || undefined });
}

/**
 * GET - renders a one-button confirmation page.
 * Prefetch scanners hitting GET will see the form but won't change state.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const email = searchParams.get('email') || '';
  const productId = searchParams.get('productId') || '';
  const token = searchParams.get('token') || '';
  const locale = pickLocale(searchParams.get('locale'));

  const validToken = verifyUnsubscribeToken(email, productId, token);
  const pageHtml = await renderHtmlPage(locale, validToken ? 'confirm' : 'error');

  return new NextResponse(pageHtml, {
    status: validToken ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * POST - performs the unsubscribe action.
 * Supports both RFC 8058 One-Click (plain text return) and browser form submission (HTML return).
 */
export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const email = searchParams.get('email') || '';
  const productId = searchParams.get('productId') || '';
  const token = searchParams.get('token') || '';
  const locale = pickLocale(searchParams.get('locale'));

  let isOneClick = false;
  try {
    const text = await req.clone().text();
    if (text === 'List-Unsubscribe=One-Click') {
      isOneClick = true;
    }
  } catch {
    // ignore
  }

  const ok = await unsubscribe(email, productId, token);

  if (isOneClick) {
    return new NextResponse(ok ? 'unsubscribed' : 'invalid token', {
      status: ok ? 200 : 400,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const pageHtml = await renderHtmlPage(locale, ok ? 'success' : 'error');
  return new NextResponse(pageHtml, {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}
