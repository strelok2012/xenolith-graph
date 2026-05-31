// Snapshot the playground graph (PIXI canvas only, no DOM overlays) for use as the OG image
// backdrop. Requires the site dev server running (http://localhost:4321/xenolith-graph).
// Output: apps/site/src/assets/og-backdrop.jpg
import { chromium } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Walk up to the workspace root (looking for apps/), then into apps/site/src/assets — so the
// script works whether it sits in apps/site/scripts (canonical) or temporarily anywhere else
// (e.g. when copied into apps/demo-react/scripts for playwright access).
function workspaceRoot(from) {
  let dir = from
  for (let i = 0; i < 6; i++) {
    const probe = resolve(dir, 'apps', 'site', 'src', 'assets')
    try { if (statSync(probe).isDirectory()) return dir } catch { /* keep looking */ }
    dir = resolve(dir, '..')
  }
  throw new Error('could not locate workspace root from ' + from)
}
const OUT = resolve(workspaceRoot(here), 'apps', 'site', 'src', 'assets', 'og-backdrop.jpg')
const BASE = (process.env.BASE_URL ?? 'http://localhost:4321/xenolith-graph').replace(/\/$/, '')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 840 }, deviceScaleFactor: 2 })
await page.goto(`${BASE}/playground/`, { waitUntil: 'domcontentloaded' })
await page.locator('canvas').first().waitFor({ timeout: 30000, state: 'attached' })
await page.waitForTimeout(1500)
// Snap in the Xen theme — playground defaults to Liquid Glass, but the OG / landing branding
// is gold-on-charcoal Xen, so colours line up only when we render the backdrop in Xen.
const xenBtn = page.getByRole('button', { name: 'Xen' })
if (await xenBtn.count()) { await xenBtn.first().click(); await page.waitForTimeout(800) }
// Drop chrome — pure graph.
await page.evaluate(() => {
  document.querySelector('astro-dev-toolbar')?.remove()
  document.querySelectorAll('[data-xeno-overlay-root], [data-xeno-panel], .playground-toolbar, .playground-switcher, .playground-hint, [data-xeno-minimap]')
    .forEach((el) => { el.style.display = 'none' })
})
const base64 = await page.evaluate(async () => {
  const editor = globalThis.__xenoEditor
  if (!editor) throw new Error('no __xenoEditor — playground did not mount?')
  const blob = await editor.exportImage({ format: 'jpeg', scale: 2, padding: 80, quality: 0.92 })
  return await new Promise((resolve) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result.split(',')[1])
    r.readAsDataURL(blob)
  })
})
await writeFile(OUT, Buffer.from(base64, 'base64'))
console.log(`✓ og-backdrop.jpg → ${OUT}`)
await browser.close()
