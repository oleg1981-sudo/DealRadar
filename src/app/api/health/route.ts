// Liveness probe for the container platform (Coolify/Docker health check) and
// Cloudflare origin monitoring. Deliberately dependency-free — it reports the
// process is up, NOT that Supabase is reachable, so a DB blip never marks the
// web container unhealthy and cycles it. Never cached.
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response('ok', { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
