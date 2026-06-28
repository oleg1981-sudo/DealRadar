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

async function page(locale: string, ok: boolean): Promise<string> {
  let title: string, body: string;
  try {
    const t = await getTranslations({ locale, namespace: 'unsubscribe' });
    title = ok ? t('successTitle') : t('errorTitle');
    body = ok ? t('successBody') : t('errorBody');
  } catch {
    title = ok ? 'Unsubscribed successfully' : 'Invalid or expired unsubscribe link';
    body = ok ? 'You will no longer receive price drop alerts for this deal.' : 'Could not verify security token.';
  }
  return `<!DOCTYPE html><html lang="${locale}"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>${title}</title></head>
    <body style="font-family:system-ui,sans-serif;text-align:center;padding:50px;color:#18181b">
      <h2>${title}</h2><p style="color:#71717a">${body}</p>
    </body></html>`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const locale = pickLocale(searchParams.get('locale'));
  const ok = await unsubscribe(
    searchParams.get('email') || '',
    searchParams.get('productId') || '',
    searchParams.get('token') || '',
  );
  return new NextResponse(await page(locale, ok), {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

/**
 * RFC 8058 one-click unsubscribe. Mail clients (Gmail/Yahoo) POST
 * `List-Unsubscribe=One-Click` to the List-Unsubscribe URL; reply 200, no redirect.
 */
export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const ok = await unsubscribe(
    searchParams.get('email') || '',
    searchParams.get('productId') || '',
    searchParams.get('token') || '',
  );
  return new NextResponse(ok ? 'unsubscribed' : 'invalid token', {
    status: ok ? 200 : 400,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
