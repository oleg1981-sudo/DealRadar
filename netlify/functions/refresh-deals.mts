/**
 * Netlify Scheduled Function — runs every 15 minutes and triggers the app's
 * protected refresh route, which re-pulls deals from the providers, upserts
 * them, and emails anyone whose price-drop alert has been beaten.
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
  // Once daily, ~6am Central Europe. Netlify cron is UTC with no DST handling,
  // so 04:00 UTC = 06:00 in Berlin during summer (CEST) / 05:00 in winter (CET).
  // This also gives one price snapshot per day to build real price history.
  // NOTE: true per-country 06:00-local would need several schedules (or an
  // hourly run that only refreshes the countries whose local time is 6am).
  schedule: '0 4 * * *',
};
