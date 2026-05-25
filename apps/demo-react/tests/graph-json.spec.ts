import { test, expect } from '@playwright/test'

test('editing the graph JSON and applying rebuilds the canvas (graph-level 2-way)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '3 · Graph ⇄ JSON' }).click()
  await page.waitForTimeout(800)

  const before = await page.evaluate(() => (window as any).__xenoEditor.toJSON().nodes.length as number)
  expect(before).toBeGreaterThan(0)

  // Replace the JSON with a tiny 1-node graph and Apply.
  const tiny = JSON.stringify({
    version: 'xenolith.v1',
    nodes: [{ id: 'solo', type: 'Note', position: { x: 0, y: 0 }, state: {}, pins: [] }],
    edges: [],
  })
  await page.locator('.graph-json').fill(tiny)
  await page.getByRole('button', { name: 'Apply JSON →' }).click()
  await page.waitForTimeout(400)

  const after = await page.evaluate(() => (window as any).__xenoEditor.toJSON().nodes.length as number)
  expect(after).toBe(1)
})
