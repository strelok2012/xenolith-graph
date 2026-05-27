import { test, expect } from '@playwright/test'

// Viewport virtualization (#59): a 1000-node graph at a working zoom must keep only a small,
// viewport-bounded number of live PIXI views — that's what stops the GPU-memory crash. Panning must
// stay responsive and not blow the count up.

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '8 · Stress (virtualize)' }).click()
  await page.waitForSelector('canvas')
  await page.evaluate(async () => { await document.fonts.ready })
  await page.waitForFunction(() => (window as unknown as { __xenoTest?: unknown }).__xenoTest !== undefined)
  await page.waitForTimeout(400)
}

const counts = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __xenoTest: { graph: { nodeCount: number }; renderedNodeCount: number } }).__xenoTest
    return { total: e.graph.nodeCount, rendered: e.renderedNodeCount }
  })

test('renders the whole graph as data but only a viewport-bounded slice as live views', async ({ page }) => {
  await ready(page)
  const { total, rendered } = await counts(page)
  expect(total).toBe(1000)
  // A 1000×640 viewport over a 220×130 grid sees a few dozen nodes; with overscan, well under 200.
  expect(rendered).toBeGreaterThan(0)
  expect(rendered).toBeLessThan(200)
})

test('panning keeps the live-view count bounded (no churn blow-up)', async ({ page }) => {
  await ready(page)
  const before = (await counts(page)).rendered

  // Pan across the graph in several steps.
  for (let i = 0; i < 5; i++) {
    await page.evaluate((n) => {
      const e = (window as unknown as { __xenoTest: { setViewport: (v: { x: number; y: number; zoom: number }) => void } }).__xenoTest
      e.setViewport({ x: -n * 600, y: -n * 400, zoom: 1 })
    }, i)
    await page.waitForTimeout(120)
  }
  const after = (await counts(page)).rendered
  // Still bounded after panning a long way — virtualization is releasing off-screen views.
  expect(after).toBeLessThan(200)
})

test('zooming in/out repeatedly does not leak the GL context (gradient cache)', async ({ page }) => {
  test.setTimeout(90_000) // each full-graph zoom-out rebuilds ~1000 LOD views — intentionally heavy
  await ready(page)
  // Each node used to allocate ~4 FillGradient textures that Graphics.destroy() never freed; under
  // virtualization's create/destroy churn, zooming in/out leaked them until the context was lost.
  const lost = await page.evaluate(() => {
    const cv = document.querySelector('canvas')!
    let flag = false
    cv.addEventListener('webglcontextlost', () => { flag = true })
    ;(window as unknown as { __lost: () => boolean }).__lost = () => flag
    return flag
  })
  expect(lost).toBe(false)

  for (let i = 0; i < 12; i++) {
    await page.evaluate((k) => {
      const e = (window as unknown as { __xenoTest: { setViewport: (v: { x: number; y: number; zoom: number }) => void } }).__xenoTest
      e.setViewport({ x: 0, y: 0, zoom: k % 2 === 0 ? 0.12 : 1.0 }) // full-graph zoom-out ⇄ working zoom
    }, i)
    await page.waitForTimeout(150)
  }
  const stillAlive = await page.evaluate(() => !(window as unknown as { __lost: () => boolean }).__lost())
  expect(stillAlive).toBe(true)
  // Back at working zoom the live-view count must settle low again — no runaway accumulation.
  await page.evaluate(() => (window as unknown as { __xenoTest: { setViewport: (v: { x: number; y: number; zoom: number }) => void } }).__xenoTest.setViewport({ x: 0, y: 0, zoom: 1 }))
  await page.waitForTimeout(200)
  expect((await counts(page)).rendered).toBeLessThan(200)
})
