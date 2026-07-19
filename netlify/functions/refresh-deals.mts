/**
 * Netlify Scheduled Function — runs once daily (06:00 UTC, see config below)
 * and triggers the app's protected refresh route, which re-pulls deals from
 * the providers, upserts them, and emails anyone whose price-drop alert has
 * been beaten.
 *
 * Requires the CRON_SECRET environment variable (the same value /api/refresh
 * checks). `URL` is injected automatically by Netlify with the site's address.
 */
export default async () => {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.CRON_SECRET;

  if (!base || !secret) {
    console.warn('[refresh-deals] URL or CRON_SECRET not set — skipping run');
    return new Response('not configured', { status: 200 });
  }

  const res = await fetch(`${base}/api/refresh`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  console.log(`[refresh-deals] ${res.status} ${body}`);
  return new Response(body, { status: res.status });
};

export const config = {
  // Once daily at 06:00 UTC, AFTER the 03:00 feed ingest. 06:00 UTC ≈
  // 07:00–08:00 Berlin, a reasonable hour for alert emails.
  // BEST-EFFORT ordering only [FR-3.8]: under current budgets the 05:00
  // live-shop verify sweep nominally finishes ~07:15 UTC (110-min budget; the
  // 2026-07-16 sweep alone took 98.6 min), so this alert pass runs BEFORE
  // same-day verification EVERY day — alerts compare against feed-ingested
  // (not yet live-verified) prices; GitHub scheduler lateness only widens the
  // gap. Accepted trade-off until the pipeline chains this via dispatch after
  // the verify workflow completes.
  schedule: '0 6 * * *',
};
