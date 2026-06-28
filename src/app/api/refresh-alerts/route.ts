/**
 * POST /api/refresh-alerts — dispatch price-drop emails for deals written by the
 * out-of-band ingestion pipeline (e.g. scripts/ingest-awin.cjs). The main
 * /api/refresh path only sees per-query providers; AWIN deals arrive via the
 * ingest script, so without this pass feed-ingested price drops never notify
 * (audit GAP-2 / FR-ING-8). Protected by CRON_SECRET.
 *
 * Body (optional): { "sinceMinutes": number }  — default 1440 (24h).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getRecentlyUpdatedDeals } from '@/lib/db/deals.repo';
import { notifyPriceDrops } from '@/lib/db/alerts.repo';
import { timingSafeEqualStr } from '@/lib/utils/crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || !auth || !timingSafeEqualStr(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let sinceMinutes = 1440;
  try {
    const body = await req.json();
    if (typeof body?.sinceMinutes === 'number' && body.sinceMinutes > 0) sinceMinutes = body.sinceMinutes;
  } catch {
    /* empty body = default window */
  }

  const sinceIso = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
  const deals = await getRecentlyUpdatedDeals(sinceIso);
  const alertsSent = await notifyPriceDrops(deals);

  return NextResponse.json({ ok: true, scanned: deals.length, alertsSent, at: new Date().toISOString() });
}
