// Run with: pnpm --filter @xenolith/playground capture
//
// Boots a headless Chromium against `pnpm dev` (must already be running on :5173 or 5174),
// captures the full canvas in both themes, and writes the PNGs to docs/screenshots/.
//
// Used to refresh the README hero images. Cheap and idempotent — re-run after any theme tweak.

import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '..', '..', '..', 'docs', 'screenshots')
await mkdir(outDir, { recursive: true })

const DEV_URL = process.env.PLAYGROUND_URL ?? 'http://localhost:5173/'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  deviceScaleFactor: 2,
})
const page = await ctx.newPage()
await page.goto(DEV_URL, { waitUntil: 'networkidle' })
// Give PIXI a couple of frames to settle (font load + first ticker pass).
await page.waitForTimeout(500)

async function shoot(themeLabel, fileName) {
  // Click the matching theme button. Playground's switcher prints labels verbatim.
  const button = page.locator(`button:has-text("${themeLabel}")`)
  await button.click()
  // Allow setTheme to re-render every node + the backdrop RT to update on the next frame.
  await page.waitForTimeout(400)
  const target = resolve(outDir, fileName)
  await page.screenshot({ path: target, fullPage: false })
  // eslint-disable-next-line no-console
  console.log('wrote', target)
}

await shoot('Liquid Glass', 'liquid-glass.png')
await shoot('Xen',          'xen.png')

await browser.close()
