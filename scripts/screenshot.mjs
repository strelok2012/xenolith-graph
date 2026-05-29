import { chromium } from '../node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs'
import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

const URL = process.env.URL ?? 'http://localhost:5174/'
const OUT_DIR = process.env.OUT ?? 'docs/screenshots'

async function shotForTheme(page, themeLabel, outPath) {
  await page.evaluate((label) => {
    const e = window.__xenoEditor
    if (!e) throw new Error('editor not ready')
    // Click the theme switcher button — it owns the setTheme call + LG backdrop wiring.
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
    if (btn) btn.click()
    e.fitView({ padding: 80, maxZoom: 1 })
  }, themeLabel)
  await page.waitForTimeout(900)
  await mkdir(dirname(outPath), { recursive: true })
  await page.screenshot({ path: outPath, fullPage: false })
  console.log(`saved ${outPath}`)
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 2 })
const page = await ctx.newPage()
await page.goto(URL, { waitUntil: 'load' })
await page.waitForSelector('canvas')
await page.waitForFunction(() => '__xenoEditor' in window)
await page.waitForTimeout(600)

await shotForTheme(page, 'Xen',          `${OUT_DIR}/xen.png`)
await shotForTheme(page, 'Liquid Glass', `${OUT_DIR}/liquid-glass.png`)

await browser.close()
