import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Snapshots live alongside specs; missing baselines on first run auto-create — review the diff
  // image when a check fails (snapshots are committed so CI compares against tracked images).
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  use: { baseURL: 'http://localhost:5181' },
  webServer: {
    command: 'pnpm dev --port 5181 --strictPort',
    url: 'http://localhost:5181',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
