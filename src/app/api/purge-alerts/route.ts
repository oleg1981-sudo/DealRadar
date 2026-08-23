/**
 * POST /api/purge-alerts — GDPR retention sweep (R-MAIL-5 / NFR-PRIV-1) for
 * every table holding a visitor's email address: `price_alerts` and
 * `travel_signups`. Both keep the same policy — delete rows past the retention
 * window, and already-notified rows past a shorter one — applied by their
 * respective SQL functions. Run on a daily schedule (see
 * .github/workflows/purge-alerts.yml). Protected by CRON_SECRET.
 *
 * The route keeps its original name: it is the one retention sweep, and
 * renaming it would mean re-pointing the workflow and the APP_URL secret for no
 * behavioural gain. Any new table storing an address belongs here too.
 *
 * Body (optional): { "retentionDays": number, "notifiedDays": number }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { purgeStaleAlerts } from '@/lib/db/alerts.repo';
import { purgeStaleTravelSignups } from '@/lib/db/travel-signups.repo';
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
    // Independent tables, so sweep them concurrently. If either throws the run
    // fails loudly — a silent partial sweep is how retention quietly stops.
    const [priceAlerts, travelSignups] = await Promise.all([
      purgeStaleAlerts(retentionDays, notifiedDays),
      purgeStaleTravelSignups(retentionDays, notifiedDays),
    ]);
    return NextResponse.json({
      ok: true,
      deleted: priceAlerts + travelSignups,
      breakdown: { priceAlerts, travelSignups },
      at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[api/purge-alerts]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
