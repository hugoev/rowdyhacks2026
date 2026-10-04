import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  distDir: process.env.TRIPWIRE_NEXT_DIST_DIR || (process.env.NEXT_TEST_DIST ? '.next-e2e' : '.next'),
  async redirects() {
    return [{ source: '/offline.html', destination: '/', permanent: false }];
  },
  async headers() {
    return [{ source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }] }];
  },
};
export default config;
