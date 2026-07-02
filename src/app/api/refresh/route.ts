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
import { fetchDealsAcrossProviders, initProviders } from '@/lib/providers/registry';
import { upsertDeals } from '@/lib/db/deals.repo';
import { notifyPriceDrops, notifyPendingAlerts } from '@/lib/db/alerts.repo';
import { SUPPORTED_COUNTRIES, CATEGORY_SLUGS, type CategorySlug, type CountryCode } from '@/lib/providers/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { countries?: CountryCode[]; categories?: CategorySlug[] } = {};
  try { body = await req.json(); } catch { /* empty body = full sync */ }

  const countries = body.countries ?? [...SUPPORTED_COUNTRIES];
  const categories = body.categories ?? [...CATEGORY_SLUGS];
  const summary: Record<string, number> = {};
  let notified = 0;
  let skippedMock = 0;

  // Only REAL provider data may reach the system-of-record. Providers without
  // credentials fall back to mock; persisting that would pollute the deals table
  // (and fire alert emails on fake prices). AWIN is excluded here too — it's
  // feed-ingested out of band (scripts/ingest-awin.cjs), so it returns [] on the
  // query path. When a provider gets real credentials, its isMock flips false
  // and it starts persisting automatically.
  const health = await initProviders();
  // dummyjson reports isMock:false (it IS a real HTTP API) but its catalogue is
  // synthetic — it must never be persisted. It's excluded from production
  // registries anyway; this guards a dev machine with CRON_SECRET set locally.
  const isReal = (source: string) => source !== 'dummyjson' && health.get(source)?.isMock === false;

  for (const country of countries) {
    let count = 0;
    for (const category of categories) {
      try {
        const deals = await fetchDealsAcrossProviders({ country, category, limit: 100 });
        const realDeals = deals.filter((d) => isReal(d.source));
        skippedMock += deals.length - realDeals.length;
        count += await upsertDeals(realDeals);
        // Email anyone whose alert price has now been beaten by these deals.
        notified += await notifyPriceDrops(realDeals);
      } catch (e) {
        console.error(`[api/refresh] ${country}/${category} failed:`, e);
      }
    }
    summary[country] = count;
  }

  // Reconcile ALL pending price alerts against current DB prices. Prices are
  // mostly updated out-of-band (AWIN feed ingest + live-shop verifier, both in
  // GitHub Actions), so this daily pass — not the per-provider loop above — is
  // what actually delivers alert emails.
  try {
    notified += await notifyPendingAlerts();
  } catch (e) {
    console.error('[api/refresh] alert reconciliation failed:', e);
  }

  return NextResponse.json({ ok: true, upserted: summary, skippedMock, alertsSent: notified, at: new Date().toISOString() });
}
