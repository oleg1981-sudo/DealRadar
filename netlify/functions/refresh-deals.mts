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
  // Every 15 minutes — matches the 30-min Redis TTL freshness window.
  schedule: '*/15 * * * *',
};
