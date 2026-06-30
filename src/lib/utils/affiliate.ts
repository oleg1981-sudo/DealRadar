/**
 * Affiliate link decoration. Kelkoo/AWIN/Tradedoubler URLs already arrive
 * monetized (goUrl / aw_deep_link / productUrl) with our publisher ID baked in,
 * so commission is attributed to our account regardless.
 *
 * On top of that we set the network's "click reference" sub-id to the DEAL's
 * productId, so a conversion in the network's transaction report can be traced
 * back to the exact product that drove it (not just "came from DealRadar").
 * Pass `ref` (the deal's productId) for per-deal attribution; without it we fall
 * back to a generic site tag.
 */
const SUBID_PARAM: Record<string, string> = {
  kelkoo: 'custom1',
  awin: 'clickref',
  tradedoubler: 'epi',
};

const SITE_TAG = 'dealradar';

/** Networks accept only a limited charset for the click-ref; keep it short + safe. */
function sanitizeRef(ref: string): string {
  const clean = ref.replace(/[^A-Za-z0-9_.-]/g, '_').replace(/_{2,}/g, '_').slice(0, 80);
  return clean || SITE_TAG;
}

export function decorateAffiliateUrl(shopUrl: string, source: string, ref?: string): string {
  const param = SUBID_PARAM[source];
  if (!param || !shopUrl) return shopUrl;
  try {
    const url = new URL(shopUrl);
    // Always set our own ref (overwriting any network default) so attribution
    // points at this deal, not whatever the feed happened to ship.
    url.searchParams.set(param, ref ? sanitizeRef(ref) : SITE_TAG);
    return url.toString();
  } catch {
    return shopUrl;
  }
}
