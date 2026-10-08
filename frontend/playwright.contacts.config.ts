import { defineConfig, devices } from '@playwright/test';

// Deterministic UI checks use mocked API data and never access a real ledger.
export default defineConfig({
  testDir: './tests-ui',
  testMatch: ['contact-cards.spec.ts', 'flock-cycles.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: true,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    env: { VITE_API_URL: '' },
  },
});
