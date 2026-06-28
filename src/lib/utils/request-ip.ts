import type { NextRequest } from 'next/server';

/**
 * Best trustworthy client IP for rate-limiting.
 *
 * The first `x-forwarded-for` hop is client-controlled (spoofable), so it must
 * never be trusted directly. We prefer platform-injected, edge-observed headers
 * (Netlify's `x-nf-client-connection-ip` is authoritative), then `x-real-ip`,
 * and only fall back to the LAST `x-forwarded-for` hop — the one appended by the
 * nearest trusted proxy — never the client-supplied first hop.
 */
export function clientIp(req: NextRequest): string {
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
