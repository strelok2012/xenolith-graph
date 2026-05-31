import { test, expect } from '@playwright/test'

// Regression: docs/bug-bake-glow-null-and-template-dive.md. The bake-glow null crash inside
// PIXI v8 FilterSystem fired the first time a fresh-sized node entered the render — most
// reliably reproduced by diving into a $templateInstance whose definition surfaces dozens of
// unseen-size nodes at once. The thrown TypeError aborted the frame BEFORE edges drew, so the
// dive view showed loose nodes with no wires. Two invariants:
//   1. Diving must not produce a single uncaught error in the page console.
//   2. The dive view must contain the full edge set of the template definition (≥9 for Allocate)
//      AND every edge endpoint must resolve to a node in the dive graph (i.e. they actually
//      reach somewhere — not orphaned).

const url = '/?engine=merged'

test('diving into the Allocate $templateInstance renders all edges and throws no console errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e)}`))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`) })

  await page.goto(url)
  await page.waitForSelector('canvas')
  await page.evaluate(async () => { await document.fonts.ready })
  // Let the merged scene mount + plugin sync + first frames paint.
  await page.waitForTimeout(800)

  const result = await page.evaluate(() => {
    const e = (window as unknown as { __fqEditor: { diveInto: (id: string) => boolean; graph: { nodes: () => Iterable<{ id: string; type: string; state?: Record<string, unknown> }>; edges: () => Iterable<{ from: { node: string }; to: { node: string } }>; getNode: (id: string) => unknown } } }).__fqEditor
    const instances = [...e.graph.nodes()].filter((n) => n.type === '$templateInstance')
    if (instances.length === 0) return { error: 'no $templateInstance node in the merged scene' }
    const inst = instances[0]!
    const ok = e.diveInto(inst.id)
    if (!ok) return { error: `diveInto returned false for ${inst.id}` }
    const nodesAfter = [...e.graph.nodes()]
    const edgesAfter = [...e.graph.edges()]
    // Validate every edge endpoint lands on an actual node in this graph (not a stale id).
    const ids = new Set(nodesAfter.map((n) => String(n.id)))
    const dangling = edgesAfter.filter((edge) => !ids.has(String(edge.from.node)) || !ids.has(String(edge.to.node)))
    return { nodes: nodesAfter.length, edges: edgesAfter.length, dangling: dangling.length }
  })

  expect(result.error, result.error ?? '').toBeUndefined()
  // Allocate's primitive sub-graph has ~30 nodes + ~9 boundary nodes ≈ 39, and ≥9 edges.
  expect(result.nodes!).toBeGreaterThanOrEqual(10)
  expect(result.edges!).toBeGreaterThanOrEqual(9)                                  // doc's threshold
  expect(result.dangling!).toBe(0)                                                 // every edge reaches a real node
  // Let the next paint flush so any deferred bake (microtask) has a chance to fire its own potential error.
  await page.waitForTimeout(400)
  expect(errors, errors.join('\n') || 'no errors').toEqual([])
})
