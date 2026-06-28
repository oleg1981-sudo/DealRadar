import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/supabase';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }

  const transactionId = typeof body.transaction_id === 'string' ? body.transaction_id : '';
  const network = typeof body.network === 'string' ? body.network : 'unknown';
  const commission = Number(body.commission_earned ?? body.commission ?? 0);
  const status = typeof body.status === 'string' ? body.status : 'pending';
  const subid = typeof body.subid === 'string' ? body.subid : (typeof body.clickref === 'string' ? body.clickref : '');

  if (!transactionId) {
    return NextResponse.json({ error: 'missing_transaction_id' }, { status: 400 });
  }

  // Extract productId if encoded in subid (e.g., dealradar_DE_electronics_kelkoo_123)
  let productId: string | null = null;
  if (subid && subid.includes('_')) {
    const parts = subid.split('_');
    if (parts.length >= 4) {
      productId = parts.slice(3).join(':'); // reconnect provider:id
    }
  }

  if (!supabaseConfigured()) {
    console.warn('[postback] Supabase unconfigured — logging transaction:', { transactionId, commission, status });
    return NextResponse.json({ ok: true, persisted: false });
  }

  const { error } = await supabase().from('transactions').upsert(
    {
      transaction_id: transactionId,
      product_id: productId,
      network,
      commission_earned: commission,
      status,
    },
    { onConflict: 'transaction_id' }
  );

  if (error) {
    console.error('[postback] DB write failed:', error.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
}
