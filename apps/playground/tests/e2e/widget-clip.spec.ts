import { test, expect } from '@playwright/test'

// A custom canvas widget must not paint past its node. The renderer clips the author's draw to the
// widget rect (canvas bitmap + explicit c2d.clip), so even a widget that fills 4× its width stays
// inside the node. Verified at the pixel level via exportImage (real extracted pixels).

const E = '__xenoEditor'

test('a custom canvas widget that overdraws is clipped to the node', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  // Lone node carrying a canvas widget that fills a red rect 4× the widget width.
  await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.clear()
    e.registerWidget('overflow', {
      draw(ctx: CanvasRenderingContext2D, c: any) {
        ctx.fillStyle = '#ff0000'
        ctx.fillRect(0, 0, c.width * 4, c.height) // way past the widget rect
      },
    })
    e.registry.register({
      type: 'Over', title: 'Over',
      // Pin label matches the widget's `key` so the canon's auto-bind catches it (widget binds to
      // this IN-pin; without a matching pin the widget is silently dropped under the canon).
      pins: [{ kind: 'data', direction: 'in', type: 'float', label: 'ov' }],
      widgets: [{ id: 'ov', type: 'custom', renderer: 'overflow', label: 'ov', key: 'ov', height: 40 }],
    })
    e.insertNode('Over', { x: 0, y: 0 })
  }, E)
  await page.waitForTimeout(350)

  const r = await page.evaluate(async (key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const PAD = 40
    const blob: Blob = await e.exportImage({ format: 'png', padding: PAD, scale: 1 })
    const bmp = await createImageBitmap(blob)
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height
    const ctx = cv.getContext('2d')!; ctx.drawImage(bmp, 0, 0)
    const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height)
    const isRed = (i: number) => data[i]! > 180 && data[i + 1]! < 80 && data[i + 2]! < 80 && data[i + 3]! > 100
    // Right padding band = the rightmost PAD px, which is BEYOND the node body (graph bbox sits at
    // [PAD, width-PAD]). Any red there = the widget bled past the node.
    const rightBandStart = width - PAD + 4
    let redInNode = 0, redRightBand = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!isRed((y * width + x) * 4)) continue
        if (x >= rightBandStart) redRightBand++
        else if (x > PAD + 10) redInNode++
      }
    }
    return { redInNode, redRightBand }
  }, E)

  expect(r.redInNode).toBeGreaterThan(50) // the widget really did paint red inside the node
  expect(r.redRightBand).toBe(0)          // …and none of it leaked into the padding past the node
})
