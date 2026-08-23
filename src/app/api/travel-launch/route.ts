/**
 * POST /api/travel-launch — send the TravelDeal launch announcement to everyone
 * on `travel_signups` who has not had it yet. Protected by CRON_SECRET.
 *
 * Body (optional): { "dryRun": boolean, "limit": number }
 *
 * **dryRun defaults to TRUE.** Unlike the other cron endpoints this one is a
 * one-shot bulk send to real people that cannot be taken back, so the safe
 * outcome is the default and a real send has to be asked for by name:
 *
 *   curl -X POST "$APP_URL/api/travel-launch" -H "Authorization: Bearer $CRON_SECRET" \
 *        -H 'Content-Type: application/json' -d '{"dryRun":false}'
 *
 * A dry run returns the recipient count, the locale breakdown, and one fully
 * rendered email per locale, so the copy can be read before it is sent.
 *
 * Deliberately NOT on a schedule: `notified` makes the send idempotent, but a
 * recurring job for a one-time announcement is a standing risk with no upside.
 */
import { NextRequest, NextResponse } from 'next/server';
import { notifyTravelLaunch } from '@/lib/db/travel-signups.repo';
import { timingSafeEqualStr } from '@/lib/utils/crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || !auth || !timingSafeEqualStr(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let dryRun = true;
  let limit: number | undefined;
  try {
    const body = await req.json();
    // Only the exact boolean false arms a real send — a truthy string, a 0, or
    // a typo'd key all leave the dry run in place.
    if (body?.dryRun === false) dryRun = false;
    if (typeof body?.limit === 'number' && body.limit > 0) limit = body.limit;
  } catch {
    /* empty body = dry run over the default limit */
  }

  try {
    const result = await notifyTravelLaunch({ dryRun, limit });
    return NextResponse.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (e) {
    console.error('[api/travel-launch]', e);
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
