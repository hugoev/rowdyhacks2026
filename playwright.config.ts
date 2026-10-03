import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: 'http://localhost:3101', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: {
    command: 'node --import tsx server/index.ts', url: 'http://localhost:3101/api/health', timeout: 120000,
    env: { PORT: '3101', HOST: '127.0.0.1', APP_ORIGIN: 'http://localhost:3101', NEXT_TEST_DIST: 'true', DATA_DIR: './test-results/server-data', DEMO_MODE: 'true', GEMINI_API_KEY: '', ELEVENLABS_API_KEY: '' },
    reuseExistingServer: false,
  },
});
