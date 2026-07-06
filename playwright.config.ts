import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config (docs/spec/testing.md §3). Runs against the BUILT static site via `vite preview`
 * so the tests exercise the real production bundle (hashed dataset URL, base './').
 * The app is desktop-only; a single desktop project drives the RTL journeys.
 * Perf guardrail (docs/spec/testing.md §4) lives here too.
 */
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      testMatch: /(timeline\.desktop|a11y|perf)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 820 } },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
