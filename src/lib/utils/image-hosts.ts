/**
 * Merchant-image host gate [FR-2.2 tripwire class] — shares the SAME list
 * next.config.mjs feeds to next/image remotePatterns. SmartImage uses it to
 * fall back to a plain <img> for unlisted hosts, so a newly-joined merchant's
 * image host can degrade optimization but can NEVER crash a PDP render again
 * (the class the watchdog flagged three times: sanicare, lyra-pet, mediakos).
 * Static JSON import — client-bundle safe (DealGallery is a client component).
 */
import hostsJson from '../../../scripts/lib/image-hosts.json';

const hosts: string[] = (hostsJson as { hosts: string[] }).hosts;

export function isAllowedImageHost(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return false;
  }
  return hosts.some((p) =>
    p.startsWith('**.') ? host === p.slice(3) || host.endsWith(p.slice(2)) : host === p,
  );
}
