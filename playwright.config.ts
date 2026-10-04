import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 45000,
  use: {
    baseURL: 'http://localhost:3101', trace: 'retain-on-failure', screenshot: 'only-on-failure', permissions: ['microphone'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npm run dev', url: 'http://localhost:3101/api/health', timeout: 120000,
    // No provider keys: the rules fallback and operator controls must carry the demo on their own.
    env: { PORT: '3101', HOST: '127.0.0.1', PUBLIC_BASE_URL: 'http://localhost:3101', NEXT_TEST_DIST: 'true', GEMINI_API_KEY: '', ELEVENLABS_API_KEY: '', DATABASE_URL: '', TIGER_DATABASE_URL: '', DEMO_MODE: 'true', OPERATOR_KEY: 'unused-key-in-public-demo' },
    reuseExistingServer: false,
  },
});
