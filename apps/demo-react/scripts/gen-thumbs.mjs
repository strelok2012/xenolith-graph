// Regenerate Examples-gallery thumbnails using `editor.exportImage()` — renders the WHOLE graph
// off-screen (independent of viewport/panels) to a clean JPEG. Requires the site dev server:
//   pnpm --filter @xenolith/site dev    (http://localhost:4321/xenolith-graph)
// then, from apps/demo-react:
//   pnpm thumbs                          (or: BASE_URL=… node scripts/gen-thumbs.mjs)
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
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
  await page.goto(`${BASE}/examples/${id}/`, { waitUntil: 'networkidle' })
  await page.locator('canvas').first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(1200)
  if (SHOOT_LG.has(id)) {
    const lg = page.getByRole('button', { name: 'Liquid Glass' })
    if (await lg.count()) { await lg.first().click(); await page.waitForTimeout(700) }
  }
  // editor.exportImage renders the WHOLE graph at high res, padded — independent of viewport
  // pan/zoom and DOM panel overlays. Returns a JPEG blob; we serialize to base64 and write the
  // raw bytes (no DOM rendering pipeline involved).
  const base64 = await page.evaluate(async () => {
    const editor = /** @type {any} */ (globalThis).__xenoEditor
    if (!editor) throw new Error('no __xenoEditor on globalThis — demo did not mount?')
    const blob = await editor.exportImage({ format: 'jpeg', scale: 2, padding: 80, quality: 0.88 })
    return await new Promise((resolve) => {
      const r = new FileReader()
      r.onload = () => resolve(/** @type {string} */ (r.result).split(',')[1])
      r.readAsDataURL(blob)
    })
  })
  await writeFile(`${OUT}/${id}.jpg`, Buffer.from(base64, 'base64'))
  console.log('✓', id)
}

await browser.close()
console.log(`\n${ids.length} thumbnails → ${OUT}`)
