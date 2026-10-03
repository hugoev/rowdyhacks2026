import type { NextConfig } from 'next';
const config: NextConfig = { poweredByHeader: false, ...(process.env.NEXT_TEST_DIST ? { distDir: '.next-e2e' } : {}) };
export default config;
