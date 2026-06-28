import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Provider CDNs vary per network; tighten this list once live feeds are on.
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.dummyjson.com' },    // mock product images
      { protocol: 'https', hostname: '**.kelkoogroup.net' },
      { protocol: 'https', hostname: '**.awin1.com' },
      { protocol: 'https', hostname: '**.productserve.com' },  // AWIN feed image CDN (aw_image_url)
      { protocol: 'https', hostname: '**.tradedoubler.com' },
      { protocol: 'https', hostname: '**.strackr.com' },
    ],
  },
};

export default withNextIntl(nextConfig);
