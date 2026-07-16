import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/utils/crypto';
import { supabase, supabaseConfigured } from '@/lib/db/supabase';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';

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

  const actionHtml = namespace === 'confirm'
    ? `<form method="POST">
        <button type="submit" style="background:#EA580C;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px;transition:background 0.2s">
          ${buttonText}
        </button>
       </form>`
    : '';

  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title></head>
    <body style="font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:50px;color:#18181b;background:#fafafa;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;margin:0">
      <div style="background:#fff;padding:40px;border-radius:12px;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);max-width:440px;width:100%;box-sizing:border-box">
        <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;line-height:1.25">${title}</h2>
        <p style="color:#71717a;font-size:14px;line-height:1.5;margin:0 0 24px">${body}</p>
        ${actionHtml}
      </div>
    </body></html>`;
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
