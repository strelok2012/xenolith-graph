import { test, expect } from '@playwright/test'
const IDS = ['mount','load','binding','canvas-widget','hero','events','graph-json','theming','viewport']
for (const id of IDS) {
  test(`thumb ${id}`, async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 640 })
    await page.goto(`http://localhost:4321/xenolith-graph/examples/${id}/`)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 12000 })
    await page.waitForTimeout(1800)
    const preview = page.locator('.dfr-preview')
    await preview.screenshot({ path: `../site/public/examples/thumbs/${id}.png` })
  })
}
