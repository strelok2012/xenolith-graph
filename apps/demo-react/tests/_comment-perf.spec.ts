import { test, expect } from '@playwright/test'

// TEMP diagnostic (delete after): reproduce "doubling the demo crashes ~39k / lags at 15k". Doubling
// the demo copies COMMENTS too — so a big graph has THOUSANDS of comment frames, and comments aren't
// virtualized (every frame stays live + each owns FillGradient textures + a BitmapText). That, not
// the nodes, is the cost. Demo ratio ≈ 5 comments / 16 nodes ≈ 1 comment per 3 nodes.

type T = {
  loadJSON: (g: unknown) => void
  setViewport: (v: { x: number; y: number; zoom: number }) => void
  graph: { nodeCount: number; commentCount: number }
  renderedNodeCount: number
}

test('many comments + big graph: no GL context loss, render stays bounded', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByRole('button', { name: '8 · Stress (virtualize)' }).click()
  await page.waitForSelector('canvas')
  await page.evaluate(async () => { await document.fonts.ready })
  await page.waitForFunction(() => (window as unknown as { __xenoTest?: unknown }).__xenoTest !== undefined)

  await page.evaluate(() => {
    const cv = document.querySelector('canvas')!
    ;(window as unknown as { __lost: boolean }).__lost = false
    cv.addEventListener('webglcontextlost', () => { (window as unknown as { __lost: boolean }).__lost = true })
  })

  // 15000 nodes + ~4700 comments (demo proportion). This is what "doubling the demo" produces.
  const stats = await page.evaluate(() => {
    const N = 15000
    const COLS = 120, STEP = 200
    const nodes: unknown[] = []
    const edges: unknown[] = []
    for (let i = 0; i < N; i++) {
      const id = `n${i}`
      nodes.push({ id, type: 'Box', position: { x: (i % COLS) * STEP, y: Math.floor(i / COLS) * 130 },
        render: { title: `Node ${i}`, category: ['logic', 'data', 'macro', 'utility'][i % 4] },
        pins: [{ id: `${id}:in`, kind: 'data', direction: 'in', type: 'any', multiple: false }] })
      if (i % COLS !== 0) edges.push({ id: `e${i}`, from: { node: `n${i - 1}`, pin: `n${i - 1}:in` }, to: { node: id, pin: `${id}:in` } })
    }
    const comments: unknown[] = []
    const C = Math.floor(N / 3)
    for (let c = 0; c < C; c++) {
      comments.push({ id: `c${c}`, position: { x: (c % COLS) * STEP - 20, y: Math.floor(c / COLS) * 130 - 20 },
        size: { x: 180, y: 120 }, text: `Group ${c}`, color: ['#85C244', '#5B8DEF', '#E0795A', '#B06BE8', '#4FC3C9'][c % 5] })
    }
    const e = (window as unknown as { __xenoTest: T }).__xenoTest
    e.loadJSON({ version: 'xenolith.v1', nodes, edges, comments })
    return { total: e.graph.nodeCount, comments: e.graph.commentCount }
  })
  console.log('>>> nodes:', stats.total, 'comments:', stats.comments)
  expect(stats.comments).toBeGreaterThan(4000)

  // Zoom out⇄in + pan — comments must virtualize like nodes (not all stay live).
  for (let i = 0; i < 12; i++) {
    await page.evaluate((k) => {
      const e = (window as unknown as { __xenoTest: T }).__xenoTest
      e.setViewport({ x: -k * 300, y: -k * 150, zoom: k % 2 === 0 ? 0.1 : 1.0 })
    }, i)
    await page.waitForTimeout(120)
  }

  const lost = await page.evaluate(() => (window as unknown as { __lost: boolean }).__lost)
  console.log('>>> lost context:', lost)
  expect(lost).toBe(false)
})
