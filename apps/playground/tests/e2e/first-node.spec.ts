import { test, expect } from '@playwright/test'

test.describe('demo graph — visual', () => {
  test('renders the Liquid Glass demo fixture @visual', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await page.goto('/')
    await page.waitForSelector('canvas')
    // Wait one rAF after init so the first frame is on the back buffer.
    await page.evaluate(
      () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
    )

    await expect(page.locator('canvas')).toHaveScreenshot('first-node.png', {
      maxDiffPixels: 200,
    })
  })
})
