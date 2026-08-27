// Rate-limit identity contract. Behind a CDN this is easy to get silently
// wrong: if every visitor resolves to the proxy's address they share one
// bucket, and the limiter throttles real users collectively.
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { clientIp } from './request-ip';

const req = (headers: Record<string, string>) =>
  new NextRequest('https://dealradar.me/api/deals', { headers });

describe('clientIp', () => {
  it('prefers cf-connecting-ip — the app sits behind Cloudflare', () => {
    // The regression this guards: x-real-ip / the last XFF hop are BOTH the
    // Cloudflare edge once proxied, so without cf-connecting-ip every visitor
    // would collapse onto one shared rate-limit bucket.
    const ip = clientIp(req({
      'cf-connecting-ip': '203.0.113.7',
      'x-real-ip': '172.71.0.1',
      'x-forwarded-for': '203.0.113.7, 172.71.0.1',
    }));
    expect(ip).toBe('203.0.113.7');
  });

  it('distinguishes two visitors arriving through the same Cloudflare edge', () => {
    const edge = { 'x-real-ip': '172.71.0.1', 'x-forwarded-for': '172.71.0.1' };
    const a = clientIp(req({ ...edge, 'cf-connecting-ip': '203.0.113.7' }));
    const b = clientIp(req({ ...edge, 'cf-connecting-ip': '198.51.100.9' }));
    expect(a).not.toBe(b);
  });

  it('still honours the Netlify header when Cloudflare is absent', () => {
    expect(clientIp(req({
      'x-nf-client-connection-ip': '203.0.113.5',
      'x-real-ip': '10.0.0.1',
    }))).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip, then the LAST forwarded hop', () => {
    expect(clientIp(req({ 'x-real-ip': '203.0.113.6' }))).toBe('203.0.113.6');
    // Never the first hop: it is client-supplied and therefore spoofable.
    expect(clientIp(req({ 'x-forwarded-for': '1.2.3.4, 203.0.113.8' }))).toBe('203.0.113.8');
  });

  it('returns a stable placeholder when no proxy header is present', () => {
    expect(clientIp(req({}))).toBe('anon');
  });
});
