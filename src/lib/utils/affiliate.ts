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

export function decorateAffiliateUrl(
  shopUrl: string,
  source: string,
  country?: string,
  category?: string,
  productId?: string
): string {
  const param = SUBID_PARAM[source];
  if (!param || !shopUrl) return shopUrl;
  try {
    const url = new URL(shopUrl);
    const cleanCountry = country || 'ALL';
    const cleanCat = category || 'gen';
    const cleanId = productId ? productId.replace(/[^a-z0-9]/gi, '_') : 'na';
    const dynamicSubId = `dealradar_${cleanCountry}_${cleanCat}_${cleanId}`;
    url.searchParams.set(param, dynamicSubId);
    return url.toString();
  } catch {
    return shopUrl;
  }
}
