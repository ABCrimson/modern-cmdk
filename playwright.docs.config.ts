import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const port = 4173;
// The docs are served under the GitHub Pages project base (apps/docs/.vitepress/config.ts: base)
const baseURL = `http://localhost:${port}/modern-cmdk/`;

// Render pass over every built docs page. Run `pnpm docs:build` first: the spec enumerates
// apps/docs/.vitepress/dist/**/*.html and scripts/serve-dist.mjs serves that same directory (not `vitepress preview`: its
// file server has no stream error handler, so one failed read killed it and failed every later test).
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
    command: `node scripts/serve-dist.mjs --port ${port}`,
    url: baseURL,
    timeout: 120_000,
    // Never reuse a server already on the port: with several worktrees on this host, a stale serve-dist from another
    // checkout answered on 4173 and the suite judged that checkout's build (2026-11-08). Playwright now stops with the
    // port in use, which names the real problem.
    reuseExistingServer: false,
  },
});
