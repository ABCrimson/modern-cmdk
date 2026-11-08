import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const baseURL = 'http://localhost:5173';

export default defineConfig({
  // Puts commit info and the commit diff in the report of every run (off by default locally)
  captureGitInfo: { commit: true, diff: true },
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  // A test that passes only on retry is a red on CI, not a silent pass
  failOnFlakyTests: isCI,
  retries: isCI ? 2 : 0,
  ...(isCI ? { workers: 2 } : {}),
  // The html reporter writes playwright-report/ so the CI failure artifact is never empty
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['html', { open: 'never' }]],
  timeout: isCI ? 60_000 : 15_000,
  expect: {
    timeout: isCI ? 30_000 : 5_000,
  },
  use: {
    baseURL,
    // Motion-free by default; a test about motion sets test.use({ reducedMotion: 'no-preference' })
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    actionTimeout: isCI ? 30_000 : 10_000,
  },
  // Chromium is the gate, in CI and locally. Firefox and WebKit are opt-in (E2E_ENGINES=all) until the
  // 1.8.0 cross-engine release: on 2026-11-04 Firefox 159.0 timed out ten "Virtualization — Large Item
  // Set" tests at the 15 s test timeout and WebKit 27.2 failed virtualization.spec.ts:93 and :323 on
  // every repeat (ledger TEB-81). A run that is red by default is not a gate.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.E2E_ENGINES === 'all'
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
  webServer: {
    // The dev server, not `vite preview`: basic.spec.ts asserts the devtools registry, which only
    // the dev build of the playground exposes.
    command: 'pnpm --filter playground run dev',
    // Ready once the dev server answers with a 2xx/3xx/400-403 status
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: !isCI,
  },
});
