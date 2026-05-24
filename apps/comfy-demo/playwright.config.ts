import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  // The comfy-demo e2e are a heavy dev aid (they load 100–1400-node real workflows) and are
  // deliberately NOT part of CI — CI covers the editor via the playground e2e + the unit suites.
  // Hard-skip everything when CI is set so they can never be wired in by accident.
  testIgnore: process.env.CI ? ['**/*'] : [],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // Per-test cap — well under the 30s default so failures surface fast, with enough headroom for
  // the heaviest workflow loads (298+ nodes) under parallel contention.
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? 'github' : 'line',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
