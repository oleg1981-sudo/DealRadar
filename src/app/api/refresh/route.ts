/**
 * POST /api/refresh — scheduled provider sync. Protected by CRON_SECRET.
 *
 * This is what keeps the 30-minute freshness guarantee: a cron (Vercel cron,
 * GitHub Action, or the docker-compose `cron` service) hits this route every
 * 15 minutes; it fans out across countries × categories, pulls from providers
 * via the registry, and upserts into Supabase. User-facing routes never call
 * upstream APIs directly.
 *
 * Body (optional): { "countries": ["DE","FR"], "categories": ["electronics"] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { fetchDealsAcrossProviders } from '@/lib/providers/registry';
import { upsertDeals, updateHistoricalLows } from '@/lib/db/deals.repo';
import { notifyPriceDrops } from '@/lib/db/alerts.repo';
import { SUPPORTED_COUNTRIES, CATEGORY_SLUGS, type CategorySlug, type CountryCode } from '@/lib/providers/types';
import { timingSafeEqualStr } from '@/lib/utils/crypto';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || !auth || !timingSafeEqualStr(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { countries?: CountryCode[]; categories?: CategorySlug[] } = {};
  try { body = await req.json(); } catch { /* empty body = full sync */ }

  const countries = body.countries ?? [...SUPPORTED_COUNTRIES];
  const categories = body.categories ?? [...CATEGORY_SLUGS];
  const summary: Record<string, number> = {};
  let notified = 0;

  // Fan out (country × category) through a bounded worker pool so a full sync
  // (16 countries × 10 categories = 160 tasks) runs in parallel without
  // unleashing 160 simultaneous upstream chains. JS is single-threaded, so the
  // shared cursor/accumulators mutate only at synchronous points — race-free.
  const tasks: { country: CountryCode; category: CategorySlug }[] = [];
  for (const country of countries) {
    summary[country] = 0;
    for (const category of categories) tasks.push({ country, category });
  }
  const concurrency = Math.max(1, Math.min(Number(process.env.REFRESH_CONCURRENCY) || 6, tasks.length || 1));

  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const { country, category } = tasks[cursor++];
      try {
        const deals = await fetchDealsAcrossProviders({ country, category, limit: 100 });
        summary[country] += await upsertDeals(deals);
        // Email anyone whose alert price has now been beaten by these deals.
        notified += await notifyPriceDrops(deals);
      } catch (e) {
        console.error(`[api/refresh] ${country}/${category} failed:`, e);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  await updateHistoricalLows();

  return NextResponse.json({ ok: true, upserted: summary, alertsSent: notified, at: new Date().toISOString() });
}
