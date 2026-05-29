import { test, expect } from '@playwright/test'

// editor.setNodePins (P0.3): replace a node's pins at runtime (variadic pins). The node view refits;
// edges to removed pins are pruned and restored on undo.

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('setNodePins adds a pin and the node keeps rendering', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const node = [...e.graph.nodes()][0]
    const before = e.graph.getNode(node.id).pins.length
    const pins = [
      ...e.graph.getNode(node.id).pins.map((p: any) => ({ ...p })),
      { id: 'extra_' + Math.random().toString(36).slice(2), kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'Extra' },
    ]
    e.setNodePins(node.id, pins)
    const after = e.graph.getNode(node.id)
    return { before, after: after.pins.length, lastLabel: after.pins[after.pins.length - 1].label }
  }, E)
  expect(r.after).toBe(r.before + 1)
  expect(r.lastLabel).toBe('Extra')
})

test('setNodePins prunes edges to removed pins; undo restores them', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const edge = [...e.graph.edges()][0]
    const targetNode = e.graph.getNode(edge.to.node)
    const remaining = targetNode.pins.filter((p: any) => p.id !== edge.to.pin).map((p: any) => ({ ...p }))
    e.setNodePins(targetNode.id, remaining) // drop the pin this edge targets
    const goneAfterDrop = !e.graph.hasEdge(edge.id)
    e.undo()
    const backAfterUndo = e.graph.hasEdge(edge.id)
    return { goneAfterDrop, backAfterUndo }
  }, E)
  expect(r.goneAfterDrop).toBe(true)
  expect(r.backAfterUndo).toBe(true)
})
