/**
 * GET/POST /api/alerts/unsubscribe?email=...&token=...
 *
 * Removes ALL price alerts for the address. The token is an HMAC of the email
 * (see lib/email/unsubscribe.ts), so only someone holding the emailed link can
 * unsubscribe that address. GET serves the human click from the email footer;
 * POST serves RFC 8058 one-click unsubscribe (the List-Unsubscribe-Post header).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/supabase';
import { verifyUnsubscribeToken } from '@/lib/email/unsubscribe';

export const runtime = 'nodejs';

async function unsubscribe(req: NextRequest): Promise<NextResponse> {
  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase();
  const token = req.nextUrl.searchParams.get('token') ?? '';

  if (!email || !verifyUnsubscribeToken(email, token)) {
    return new NextResponse('Invalid or expired unsubscribe link.', { status: 400 });
  }
  if (supabaseConfigured()) {
    const { error } = await supabase().from('price_alerts').delete().eq('email', email);
    if (error) {
      console.error('[api/alerts/unsubscribe]', error);
      return new NextResponse('Something went wrong — please try again later.', { status: 500 });
    }
  }
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Unsubscribed — DealRadar</title>
<div style="font-family:system-ui,sans-serif;max-width:480px;margin:80px auto;color:#18181b">
  <h1 style="font-size:20px">You're unsubscribed</h1>
  <p style="color:#52525b">All price alerts for <strong>${email.replace(/</g, '&lt;')}</strong> have been removed. You can set new ones on DealRadar any time.</p>
</div>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(req: NextRequest) {
  return unsubscribe(req);
}

// RFC 8058 one-click: mail clients POST to the List-Unsubscribe URL.
export async function POST(req: NextRequest) {
  return unsubscribe(req);
}
