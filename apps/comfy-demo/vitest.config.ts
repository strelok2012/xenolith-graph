import { defineConfig } from 'vitest/config'

// Unit tests live under src/ (the pure importer). Playwright e2e specs under tests/e2e/ are run
// by `pnpm test:e2e`, not vitest — exclude them so vitest doesn't try to execute @playwright/test.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
