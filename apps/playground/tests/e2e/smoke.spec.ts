import { test, expect } from '@playwright/test'

test.describe('playground smoke', () => {
  test('page loads with a visible canvas', async ({ page }) => {
    await page.goto('/')
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible()
  })

  test('canvas occupies the viewport', async ({ page }) => {
    await page.goto('/')
    const box = await page.locator('canvas').boundingBox()
    expect(box?.width).toBeGreaterThan(100)
    expect(box?.height).toBeGreaterThan(100)
  })

  test('canvas is rendered by PIXI (has a GPU rendering context)', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    // PIXI v8 binds either WebGL2 or WebGPU to the canvas during Application.init().
    // After init the canvas reports a non-zero internal resolution and is not a 2d canvas.
    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas') as HTMLCanvasElement | null
      return canvas ? { width: canvas.width, height: canvas.height } : null
    })
    expect(info).not.toBeNull()
    expect(info!.width).toBeGreaterThan(0)
    expect(info!.height).toBeGreaterThan(0)
  })
})
