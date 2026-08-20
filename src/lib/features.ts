/**
 * Server-evaluated feature flags.
 *
 * Deliberately NOT `NEXT_PUBLIC_*`. Those are inlined into the client bundle at
 * BUILD time, and this project's Dockerfile declares no matching `ARG` — so a
 * NEXT_PUBLIC flag set in Coolify would never reach the build and would appear
 * to do nothing. Reading a plain env var on the server and passing the result
 * down as a prop means the flag is a pure RUNTIME switch: set the variable in
 * Coolify, redeploy, done. No rebuild, no image change, no code edit.
 */
import 'server-only';

/** Accepts the values a person would plausibly type in a dashboard field. */
function truthy(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/**
 * TravelDeal — the cruise & package vertical.
 *
 * OFF by default, and intentionally so: the menu is fully built and translated,
 * but its links resolve to searches with no travel inventory behind them. Turn
 * it on only once an AWIN travel feed or the TourRadar Distribution API is
 * actually ingesting, or visitors get a prominent menu leading to empty pages.
 *
 * Enable with:  TRAVELDEAL_ENABLED=1
 */
export function travelDealEnabled(): boolean {
  return truthy(process.env.TRAVELDEAL_ENABLED);
}
