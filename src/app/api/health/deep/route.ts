// Dependency health check — reports whether the app can actually SERVE, i.e.
// whether Supabase answers. Deliberately NOT the container health check:
// /api/health stays dependency-free so a DB blip never cycles the web
// container (restarting the app cannot fix a database problem). This endpoint
// is for external monitoring, which should alert rather than restart.
//
// Exists because on 2026-08-18 the database stalled for ~3 days and nothing
// noticed: every page timed out while /api/health kept returning 200, so the
// platform reported "healthy" throughout.
import { supabase, supabaseConfigured } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

/** Bound the probe itself — a hanging check is as useless as no check. */
const PROBE_TIMEOUT_MS = 5_000;

export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };

  // No credentials = local/dev mock mode. The app genuinely works this way, so
  // report it plainly rather than paging someone at 3am over a dev box.
  if (!supabaseConfigured()) {
    return Response.json({ ok: true, db: 'not-configured' }, { status: 200, headers });
  }

  const started = Date.now();
  try {
    // Cheapest possible real read: one row by primary key index, no count
    // (`count: 'exact'` scans, and that is what fell over in the first place).
    const { error } = await supabase()
      .from('deals')
      .select('product_id')
      .limit(1)
      .abortSignal(AbortSignal.timeout(PROBE_TIMEOUT_MS));

    const latencyMs = Date.now() - started;
    if (error) {
      return Response.json(
        { ok: false, db: 'error', latencyMs, error: error.message || 'unknown' },
        { status: 503, headers },
      );
    }
    return Response.json({ ok: true, db: 'up', latencyMs }, { status: 200, headers });
  } catch (e) {
    // Timeout or network failure — both mean "cannot serve".
    return Response.json(
      { ok: false, db: 'unreachable', latencyMs: Date.now() - started, error: (e as Error).message },
      { status: 503, headers },
    );
  }
}
