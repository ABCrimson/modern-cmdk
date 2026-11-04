import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const port = 4173;
// The docs are served under the GitHub Pages project base (apps/docs/.vitepress/config.ts: base)
const baseURL = `http://localhost:${port}/modern-cmdk/`;

// Render pass over every built docs page. Run `pnpm docs:build` first: the spec enumerates
// apps/docs/.vitepress/dist/**/*.html and `vitepress preview` serves that same directory.
export default defineConfig({
  testDir: './tests/docs',
  fullyParallel: true,
  forbidOnly: isCI,
  failOnFlakyTests: isCI,
  retries: isCI ? 2 : 0,
  ...(isCI ? { workers: 2 } : {}),
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['html', { open: 'never' }]],
  // Own folders, so a docs run never empties the e2e project's test-results/ and the page
  // screenshots (test-results/docs/<route>.png) survive the run's own cleanup of its outputDir
  outputDir: './test-results/docs-runs',
  timeout: isCI ? 60_000 : 30_000,
  expect: { timeout: isCI ? 30_000 : 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --filter docs exec vitepress preview --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !isCI,
  },
});
