/**
 * Affiliate link decoration. Kelkoo/AWIN/Tradedoubler URLs already arrive
 * monetized (goUrl / aw_deep_link / productUrl). We only append our own
 * sub-id for attribution where the network supports it.
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
