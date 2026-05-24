import { test, expect, type Page } from '@playwright/test'

/** A minimal src → reroute → dst graph, centred so the reroute disc sits at screen (500, 350). */
const GRAPH = {
  version: 'xenolith.v1',
  nodes: [
    { id: 'src', type: 'Src', position: { x: 0, y: 0 },
      pins: [{ id: 'src:o', kind: 'data', direction: 'out', type: 'object', multiple: true }] },
    { id: 'R', type: '$reroute', position: { x: 200, y: 0 },
      pins: [
        { id: 'R:i', kind: 'data', direction: 'in',  type: 'object', multiple: false },
        { id: 'R:o', kind: 'data', direction: 'out', type: 'object', multiple: true },
      ] },
    { id: 'dst', type: 'Dst', position: { x: 400, y: 0 },
      pins: [{ id: 'dst:i', kind: 'data', direction: 'in', type: 'object', multiple: false }] },
  ],
  edges: [
    { id: 'e1', from: { node: 'src', pin: 'src:o' }, to: { node: 'R', pin: 'R:i' } },
    { id: 'e2', from: { node: 'R', pin: 'R:o' }, to: { node: 'dst', pin: 'dst:i' } },
  ],
  // reroute disc centre is world (211, 11); place it at screen (500, 350)
  viewport: { x: 500 - 211, y: 350 - 11, zoom: 1 },
}

async function load(page: Page) {
  await page.evaluate((g) => (window as unknown as { __xenoEditor: { loadJSON(x: unknown): void } }).__xenoEditor.loadJSON(g), GRAPH)
}
function rerouteState(page: Page) {
  return page.evaluate(() => {
    const ed = (window as unknown as { __xenoEditor: { graph: { nodeCount: number; edgeCount: number; getNode(id: unknown): { position: { x: number; y: number } } | undefined } } }).__xenoEditor
    const r = ed.graph.getNode('R')
    return { nodes: ed.graph.nodeCount, edges: ed.graph.edgeCount, r: r?.position ?? null }
  })
}

test.describe('reroute interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.waitForFunction(() => '__xenoEditor' in window)
    await load(page)
  })

  test('the reroute knot can be dragged by its body', async ({ page }) => {
    const before = await rerouteState(page)
    await page.mouse.move(500, 350)
    await page.mouse.down()
    await page.mouse.move(500, 420, { steps: 8 })
    await page.mouse.move(500, 470, { steps: 8 })
    await page.mouse.up()
    const after = await rerouteState(page)
    expect(after.nodes).toBe(3) // nothing deleted, no stray edge
    expect(after.r!.y).toBeGreaterThan(before.r!.y + 50)
  })

  test('deleting a reroute heals the wire it relayed', async ({ page }) => {
    // select the knot by clicking its body, then Delete
    await page.mouse.click(500, 350)
    await page.keyboard.press('Delete')
    const after = await page.evaluate(() => {
      const ed = (window as unknown as { __xenoEditor: { graph: { nodeCount: number; edgeCount: number; getNode(id: unknown): unknown; edges(): IterableIterator<{ from: { node: string; pin: string }; to: { node: string; pin: string } }> } } }).__xenoEditor
      const edges = [...ed.graph.edges()]
      return {
        nodes: ed.graph.nodeCount,
        rerouteGone: ed.graph.getNode('R') === undefined,
        directLink: edges.some((e) => e.from.node === 'src' && e.to.node === 'dst'),
        edges: edges.length,
      }
    })
    expect(after.rerouteGone).toBe(true)
    expect(after.nodes).toBe(2)
    expect(after.directLink).toBe(true) // src now wired straight to dst
    expect(after.edges).toBe(1)
  })
})
