//@ts-check

const bundleAnalyzer = require('@next/bundle-analyzer')

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  // (F7) The nuScenes sample files (photos, point clouds, boxes) are static and
  // large in number: 3,253 files, a few hundred KB per frame. Files in public/
  // are served with `Cache-Control: public, max-age=0` by default, so the
  // browser asks the server "has this changed?" for every photo on every visit
  // to a frame. One day of caching removes those round trips.
  // The price: after the data is regenerated and deployed, a browser that has
  // seen the old files may show them for up to a day.
  async headers() {
    return [
      {
        source: '/sample-data/nuscenes/scenes/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ];
  },
};

module.exports = withBundleAnalyzer(nextConfig);