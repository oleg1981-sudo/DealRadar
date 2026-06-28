/**
 * POST /api/purge-alerts — GDPR retention sweep for price_alerts (R-MAIL-5 /
 * NFR-PRIV-1). Deletes subscriptions past the retention window and notified rows
 * past a shorter window, via the purge_stale_price_alerts SQL function. Run on a
 * daily schedule (see .github/workflows/purge-alerts.yml). Protected by CRON_SECRET.
 *
 * Body (optional): { "retentionDays": number, "notifiedDays": number }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { purgeStaleAlerts } from '@/lib/db/alerts.repo';
import { timingSafeEqualStr } from '@/lib/utils/crypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || !auth || !timingSafeEqualStr(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let retentionDays = 365;
  let notifiedDays = 30;
  try {
    const body = await req.json();
    if (typeof body?.retentionDays === 'number' && body.retentionDays > 0) retentionDays = body.retentionDays;
    if (typeof body?.notifiedDays === 'number' && body.notifiedDays > 0) notifiedDays = body.notifiedDays;
  } catch {
    /* empty body = default windows */
  }

  try {
    const deleted = await purgeStaleAlerts(retentionDays, notifiedDays);
    return NextResponse.json({ ok: true, deleted, at: new Date().toISOString() });
  } catch (e) {
    console.error('[api/purge-alerts]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
