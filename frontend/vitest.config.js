import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 15000,
    include: ['src/**/*.test.{js,jsx}'],
    exclude: ['node_modules/**', 'tests-e2e/**'],
    setupFiles: './src/test/setup.js',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/components/AlertCenter.jsx', 'src/components/UnifiedSearch.jsx', 'src/pages/Finance/FinancialLedgerPage.jsx'],
      thresholds: { lines: 60, functions: 60, branches: 50, statements: 60 },
    },
  },
});
