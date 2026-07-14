import type { MetadataRoute } from 'next';

/** Web app manifest — Android/Chrome install icons + brand colors. Served at
 *  /manifest.webmanifest and auto-linked on every route by Next. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DealRadar — best local deals across Europe',
    short_name: 'DealRadar',
    description: 'Geo-located European price comparison: the biggest discounts from local shops, by category.',
    start_url: '/',
    display: 'browser',
    background_color: '#ffffff',
    theme_color: '#EA580C',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
