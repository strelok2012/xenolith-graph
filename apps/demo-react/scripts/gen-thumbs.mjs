// Regenerate Examples-gallery thumbnails by screenshotting the demo preview region — captures
// BOTH the PIXI canvas AND any HTML widgets layered over it (text inputs, selects, the sidebar).
// `editor.exportImage()` can't be used because it only paints the PIXI scene; DOM widgets would
// drop out of the shot.
//
// We do hide editor chrome (controls, minimap, breadcrumb, palette sidebar, custom toolbars) so
// thumbnails focus on the graph itself.
//
// Requires the site dev server: pnpm --filter @xenolith/site dev (http://localhost:4321/xenolith-graph)
// Then, from apps/demo-react: pnpm thumbs   (or: BASE_URL=… node scripts/gen-thumbs.mjs)
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

const SHOOT_LG = new Set(['theming'])

for (const id of ids) {
  await page.goto(`${BASE}/examples/${id}/`, { waitUntil: 'domcontentloaded' })
  try {
    await page.locator('canvas').first().waitFor({ timeout: 30000, state: 'attached' })
  } catch {
    console.warn('⚠ no canvas after 30s for', id, '— skipping')
    continue
  }
  await page.waitForTimeout(1500)
  if (SHOOT_LG.has(id)) {
    const lg = page.getByRole('button', { name: 'Liquid Glass' })
    if (await lg.count()) { await lg.first().click(); await page.waitForTimeout(700) }
  }
  // Fit + zoom out a couple of notches BEFORE hiding chrome (those buttons are part of the chrome
  // we're about to hide).
  const fit = page.getByRole('button', { name: 'Fit view' })
  if (await fit.count()) await fit.first().click()
  const zoomOut = page.getByRole('button', { name: 'Zoom out' })
  if (await zoomOut.count()) { await zoomOut.first().click(); await zoomOut.first().click() }
  await page.waitForTimeout(400)
  // Hide editor chrome — overlay panels (controls, minimap, breadcrumb, custom toolbars), palette
  // sidebar — and Astro's dev toolbar. DOM widgets that live INSIDE the editor's widget rects stay
  // (those aren't `data-xeno-panel`); they're part of the graph the user is looking at.
  await page.evaluate(() => {
    document.querySelector('astro-dev-toolbar')?.remove()
    const sel = '[data-xeno-overlay-root], [data-xeno-panel], [data-xeno-controls], [data-xeno-minimap], [data-xeno-breadcrumb], [data-xeno-sidebar], [data-xeno-palette-sidebar], [data-xeno-stats]'
    document.querySelectorAll(sel).forEach((el) => { el.style.display = 'none' })
  })
  await page.waitForTimeout(150)
  await page.locator('.dfr-preview').screenshot({ path: `${OUT}/${id}.jpg`, type: 'jpeg', quality: 88 })
  console.log('✓', id)
}

await browser.close()
console.log(`\n${ids.length} thumbnails → ${OUT}`)
