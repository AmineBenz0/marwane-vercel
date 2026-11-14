import { defineConfig, devices } from '@playwright/test';

// Phase 8 isolated browser acceptance: real React pages + API mocks.
// Never sends a request to staging or production. The write flag is scoped
// to the disposable Vite server in this test only.
export default defineConfig({
  testDir: './tests-ui',
  testMatch: ['release4-deferred-cancellation.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 12_000 },
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'release4-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'release4-mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    env: {
      VITE_API_URL: '',
      VITE_ENABLE_DEFERRED_CANCELLATION_WRITES: 'true',
      VITE_ENABLE_CREDIT_REFUND_WRITES: 'false',
    },
  },
});
