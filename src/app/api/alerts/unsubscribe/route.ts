import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubscribeToken } from '@/lib/utils/crypto';
import { supabase, supabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const email = searchParams.get('email') || '';
  const productId = searchParams.get('productId') || '';
  const token = searchParams.get('token') || '';

  const isValid = verifyUnsubscribeToken(email, productId, token);

  if (!isValid) {
    return new NextResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;">
        <h2>Invalid or expired unsubscribe link</h2>
        <p>Could not verify security token.</p>
      </body></html>`,
      { status: 400, headers: { 'content-type': 'text/html' } }
    );
  }

  if (supabaseConfigured()) {
    const { error } = await supabase()
      .from('price_alerts')
      .delete()
      .eq('email', email.toLowerCase().trim())
      .eq('product_id', productId);

    if (error) {
      console.error('[unsubscribe] DB deletion failed:', error.message);
    }
  }

  return new NextResponse(
    `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:50px;">
      <h2>Unsubscribed successfully</h2>
      <p>You will no longer receive price drop alerts for this deal.</p>
    </body></html>`,
    { status: 200, headers: { 'content-type': 'text/html' } }
  );
}
