// Regenerate the Examples-gallery thumbnails. Requires the SITE dev server running:
//   pnpm --filter @xenolith/site dev            (defaults to http://localhost:4321/xenolith-graph)
// then, from apps/demo-react:
//   pnpm thumbs                                 (or: BASE_URL=… node scripts/gen-thumbs.mjs)
// It scrapes the example ids off the gallery index, fits each graph, and shoots the preview at 2×
// into apps/site/public/examples/thumbs/<id>.png.
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '..', '..', 'site', 'public', 'examples', 'thumbs')
const BASE = (process.env.BASE_URL ?? 'http://localhost:4321/xenolith-graph').replace(/\/$/, '')

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 640 }, deviceScaleFactor: 2 })

await page.goto(`${BASE}/examples/`, { waitUntil: 'networkidle' })
const ids = await page.$$eval('a[href*="/examples/"]', (as) =>
  [...new Set(
    as.map((a) => a.getAttribute('href'))
      .filter((h) => h && /\/examples\/[^/]+\/?$/.test(h))
      .map((h) => h.replace(/\/$/, '').split('/').pop()),
  )].filter((id) => id && id !== 'examples'),
)
if (ids.length === 0) throw new Error('no example ids found — is the site dev server running?')

// Examples whose thumbnail looks best in the Liquid Glass theme.
const SHOOT_LG = new Set(['theming'])

for (const id of ids) {
  await page.goto(`${BASE}/examples/${id}/`, { waitUntil: 'networkidle' })
  await page.locator('canvas').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1200)
  if (SHOOT_LG.has(id)) {
    const lg = page.getByRole('button', { name: 'Liquid Glass' })
    if (await lg.count()) { await lg.first().click(); await page.waitForTimeout(700) }
  }
  // Clean framing — click the built-in "Fit view" control (each demo also fits itself on load), then
  // zoom out two notches for generous thumbnail margins. Falls back gracefully if a demo has no controls.
  const fit = page.getByRole('button', { name: 'Fit view' })
  if (await fit.count()) await fit.first().click()
  const zoomOut = page.getByRole('button', { name: 'Zoom out' })
  if (await zoomOut.count()) { await zoomOut.first().click(); await zoomOut.first().click() }
  await page.waitForTimeout(500)
  // Remove ONLY Astro's dev toolbar (it sits fixed at the bottom and creeps into the shot). Our own
  // in-editor controls/panels stay — they're part of the demo.
  await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove())
  await page.waitForTimeout(100)
  await page.locator('.dfr-preview').screenshot({ path: `${OUT}/${id}.png` })
  console.log('✓', id)
}

await browser.close()
console.log(`\n${ids.length} thumbnails → ${OUT}`)
