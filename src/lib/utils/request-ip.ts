import type { NextRequest } from 'next/server';

/**
 * Best trustworthy client IP for rate-limiting.
 *
 * The first `x-forwarded-for` hop is client-controlled (spoofable), so it must
 * never be trusted directly. We prefer platform-injected, edge-observed headers,
 * then `x-real-ip`, and only fall back to the LAST `x-forwarded-for` hop — the
 * one appended by the nearest trusted proxy — never the client-supplied first.
 *
 * `cf-connecting-ip` is checked FIRST because the app now sits behind Cloudflare
 * (Hetzner origin). Without it every visitor resolves to the same value: the
 * reverse proxy sees Cloudflare's edge as the peer, so `x-real-ip` and the last
 * `x-forwarded-for` hop are both a Cloudflare address — collapsing all traffic
 * into ONE rate-limit bucket and throttling real users collectively across all
 * seven rate-limited API routes. Cloudflare overwrites `cf-connecting-ip` on
 * every proxied request, so a client cannot forge it.
 *
 * NOTE: that guarantee holds only for traffic that actually transits Cloudflare.
 * Lock the origin's firewall to Cloudflare's IP ranges, or someone hitting the
 * origin IP directly could spoof this header to sidestep the limiter.
 * `x-nf-client-connection-ip` is retained for the Netlify deployment path.
 */
export function clientIp(req: NextRequest): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const nf = req.headers.get('x-nf-client-connection-ip');
  if (nf) return nf.trim();

  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const hops = xff.split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }

  return 'anon';
}
