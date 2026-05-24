import { test, expect, type Page } from '@playwright/test'

// A(object out) → R(reroute, pins 'any') → B(in). After load, R must adopt the 'object' type on
// both pins so its colour and outgoing wire match the incoming wire.
const GRAPH = {
  version: 'xenolith.v1',
  nodes: [
    { id: 'A', type: 'Src', position: { x: 0, y: 0 },
      pins: [{ id: 'A:o', kind: 'data', direction: 'out', type: 'object', multiple: true }] },
    { id: 'R', type: 'Reroute', position: { x: 200, y: 0 },
      pins: [
        { id: 'R:i', kind: 'data', direction: 'in',  type: 'any', multiple: false },
        { id: 'R:o', kind: 'data', direction: 'out', type: 'any', multiple: true },
      ] },
    { id: 'B', type: 'Dst', position: { x: 400, y: 0 },
      pins: [{ id: 'B:i', kind: 'data', direction: 'in', type: 'object', multiple: false }] },
  ],
  edges: [
    { id: 'e1', from: { node: 'A', pin: 'A:o' }, to: { node: 'R', pin: 'R:i' } },
    { id: 'e2', from: { node: 'R', pin: 'R:o' }, to: { node: 'B', pin: 'B:i' } },
  ],
}

async function load(page: Page) {
  await page.evaluate((g) => (window as unknown as { __xenoEditor: { loadJSON(x: unknown): void } }).__xenoEditor.loadJSON(g), GRAPH)
}

test.describe('reroute type propagation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.waitForFunction(() => '__xenoEditor' in window)
    await load(page)
  })

  test('a reroute adopts the incoming wire type on both pins', async ({ page }) => {
    const types = await page.evaluate(() => {
      const ed = (window as unknown as { __xenoEditor: { graph: { getNode(id: unknown): { pins: { direction: string; type: string }[] } | undefined } } }).__xenoEditor
      const r = ed.graph.getNode('R')!
      return r.pins.map((p) => `${p.direction}:${p.type}`)
    })
    expect(types).toContain('in:object')
    expect(types).toContain('out:object')
  })
})
