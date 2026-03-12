import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : undefined,
  reporter: isCI ? 'github' : 'html',
  timeout: isCI ? 60_000 : 15_000,
  expect: {
    timeout: isCI ? 30_000 : 5_000,
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    actionTimeout: isCI ? 30_000 : 10_000,
  },
  // CI: chromium only (firefox/webkit E2E is too slow with retries + timeouts)
  // Local: all 3 browsers for comprehensive cross-browser testing
  projects: isCI
    ? [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit', use: { ...devices['Desktop Safari'] } },
      ],
  webServer: {
    command: 'pnpm --filter playground run dev',
    port: 5173,
    timeout: 120_000,
    reuseExistingServer: !isCI,
  },
});
