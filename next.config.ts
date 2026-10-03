import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, distDir: process.env.TRIPWIRE_NEXT_DIST_DIR || (process.env.NEXT_TEST_DIST ? '.next-e2e' : '.next') };
export default config;
