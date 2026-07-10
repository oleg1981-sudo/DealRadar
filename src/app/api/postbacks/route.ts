import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseConfigured } from '@/lib/db/supabase';
import { timingSafeEqualStr } from '@/lib/utils/crypto';
import { decodeSubId } from '@/lib/utils/affiliate';

export const runtime = 'nodejs';

/** Network status vocabularies → the DB enum (pending|approved|declined|paid). */
const STATUS_MAP: Record<string, 'pending' | 'approved' | 'declined' | 'paid'> = {
  pending: 'pending', new: 'pending', open: 'pending',
  approved: 'approved', confirmed: 'approved', validated: 'approved', accepted: 'approved',
  declined: 'declined', rejected: 'declined', cancelled: 'declined', canceled: 'declined', void: 'declined',
  paid: 'paid', cleared: 'paid',
};

/** Per-network body field that carries our outbound sub-id (and its tertiary). */
const PRIMARY_SUBID_FIELD: Record<string, string> = {
  awin: 'clickref', kelkoo: 'custom1', tradedoubler: 'epi', strackr: 'subid',
};
const TERTIARY_SUBID_FIELD: Record<string, string> = {
  awin: 'clickref3', kelkoo: 'custom3', tradedoubler: 'epi3',
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Shared secret check — the secret always travels in the query string, never
 *  the body, so it never lands in `raw_payload`. Returns an error response, or
 *  null when authorized. */
function checkAuth(req: NextRequest): NextResponse | null {
  // Dedicated webhook secret — no CRON_SECRET fallback (postbacks ≠ cron auth).
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) {
    console.error('[postback] WEBHOOK_SECRET not configured — rejecting');
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const provided = req.nextUrl.searchParams.get('secret') || '';
  if (!timingSafeEqualStr(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * GET /api/postbacks?secret=…&transaction_id=…&… — query-string postbacks.
 * Some networks (Strackr) default to GET pixels rather than POST/JSON. Fields
 * arrive as query params; `secret` is stripped so it never enters raw_payload.
 */
export async function GET(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;
  const body: Record<string, unknown> = {};
  for (const [k, v] of req.nextUrl.searchParams) {
    if (k !== 'secret') body[k] = v;
  }
  return processPostback(body);
}

export async function POST(req: NextRequest) {
  const unauthorized = checkAuth(req);
  if (unauthorized) return unauthorized;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  }
  return processPostback(body);
}

async function processPostback(body: Record<string, unknown>): Promise<NextResponse> {
  const transactionId = str(body.transaction_id) || str(body.id);
  if (!transactionId) {
    return NextResponse.json({ error: 'missing_transaction_id' }, { status: 400 });
  }

  const network = (str(body.network) || 'unknown').toLowerCase();

  // Commission: finite, non-negative (mirrors transactions_commission_chk).
  const commission = Number(body.commission_earned ?? body.commission ?? 0);
  if (!Number.isFinite(commission) || commission < 0) {
    return NextResponse.json({ error: 'invalid_commission' }, { status: 400 });
  }

  // Status: normalize network vocab to the enum; unknown → pending (+ warn).
  const rawStatus = str(body.status).toLowerCase().trim();
  const status = STATUS_MAP[rawStatus] ?? 'pending';
  if (rawStatus && !STATUS_MAP[rawStatus]) {
    console.warn(`[postback] unknown status "${rawStatus}" from ${network} — defaulting to pending`);
  }

  // Network-aware sub-id extraction, with generic fallbacks.
  const primaryField = PRIMARY_SUBID_FIELD[network];
  const subid =
    (primaryField ? str(body[primaryField]) : '') ||
    str(body.subid) || str(body.clickref) || str(body.custom1) || str(body.epi);
  const tertiaryField = TERTIARY_SUBID_FIELD[network];
  const subid3 =
    ((tertiaryField ? str(body[tertiaryField]) : '') || str(body.subid3) || str(body.clickref3)) || null;

  // Recover the exact productId we encoded into the sub-id (lossless round-trip).
  const productId = decodeSubId(subid)?.productId ?? null;

  if (!supabaseConfigured()) {
    console.warn('[postback] Supabase unconfigured — logging transaction:', {
      transactionId, network, commission, status,
    });
    return NextResponse.json({ ok: true, persisted: false });
  }

  const row = {
    transaction_id: transactionId,
    product_id: productId,
    network,
    commission_earned: commission,
    status,
    subid3,
    raw_payload: body,
    received_at: new Date().toISOString(),
  };

  let { error } = await supabase().from('transactions').upsert(row, { onConflict: 'transaction_id' });
  // FK guard: a postback can reference a product no longer in `deals`. Persist
  // the commission record with a null product_id rather than dropping it.
  if (error?.code === '23503' && productId) {
    console.warn(`[postback] product_id ${productId} absent from deals — persisting with null FK`);
    ({ error } = await supabase()
      .from('transactions')
      .upsert({ ...row, product_id: null }, { onConflict: 'transaction_id' }));
  }
  if (error) {
    console.error('[postback] DB write failed:', error.message);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
}
