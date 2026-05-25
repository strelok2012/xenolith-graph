import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://localhost:5180' },
  webServer: {
    command: 'pnpm dev --port 5180 --strictPort',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
