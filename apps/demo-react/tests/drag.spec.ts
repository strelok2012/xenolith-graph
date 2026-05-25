import { test, expect } from '@playwright/test'

test('DOM widget tracks the node live during a drag', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '7 · Bring your own UI' }).click()
  await page.waitForTimeout(1200)

  // Header position (canvas-local) of the async-select node ('Pick').
  const local = await page.evaluate(() => {
    const ed = (window as any).__xenoEditor
    const vp = ed.viewport
    for (const n of ed.graph.nodes()) {
      if ((n.widgets ?? []).some((w: any) => w.renderer === 'async-select')) {
        return { x: vp.x + (n.position.x + 50) * vp.zoom, y: vp.y + (n.position.y + 12) * vp.zoom }
      }
    }
    return null
  })
  expect(local).not.toBeNull()
  const canvas = (await page.locator('canvas').boundingBox())!
  const hdr = { x: canvas.x + local!.x, y: canvas.y + local!.y }

  const before = (await page.locator('.w-async').boundingBox())!
  await page.mouse.move(hdr!.x, hdr!.y)
  await page.mouse.down()
  await page.mouse.move(hdr!.x + 140, hdr!.y + 90, { steps: 8 })
  await page.waitForTimeout(100)
  const during = (await page.locator('.w-async').boundingBox())! // read BEFORE mouseup
  await page.mouse.up()

  // The widget must have moved with the node mid-drag (not snapped only on drop).
  expect(during.x - before.x).toBeGreaterThan(80)
  expect(during.y - before.y).toBeGreaterThan(50)
})
