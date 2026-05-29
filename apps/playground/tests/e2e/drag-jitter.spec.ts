import { test, expect } from '@playwright/test'

// Regression: dragging a node must not jitter/teleport when a graph sync fires mid-drag (e.g. a
// per-tick widget write while edges animate). The fix: #ensureView leaves a live-dragged node at its
// cursor position instead of yanking it back to the not-yet-committed node.position.

const E = '__xenoEditor'

test('a mid-drag sync does not snap the dragged node back to its committed position', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  const info = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const dragged = [...e.graph.nodes()].find((n: any) => n.type !== 'Macro' && n.type !== '$templateInstance' && !e.graph.getNode(n.id).state.collapsed)
    const other = [...e.graph.nodes()].find((n: any) => n.id !== dragged.id && (n.widgets ?? []).some((w: any) => w.key !== undefined))
    const w = other.widgets.find((wd: any) => wd.key !== undefined)
    // animate an edge so the ticker repaints every frame (the "during animation" condition)
    const edge = [...e.graph.edges()][0]
    if (edge) e.setEdgeAnimated(edge.id, true)
    // frame the dragged node centre-screen at 1:1 so screen deltas map to world deltas
    e.setViewport({ x: 420 - dragged.position.x, y: 300 - dragged.position.y, zoom: 1 })
    return {
      draggedId: dragged.id, otherId: other.id, widgetId: w.id,
      grab: e.worldToScreen({ x: dragged.position.x + 40, y: dragged.position.y + 8 }),
      committed: { ...dragged.position },
    }
  }, E)

  const box = (await page.locator('canvas').boundingBox())!
  // Grab the node header and drag it +120,+80 (still holding).
  await page.mouse.move(box.x + info.grab.x, box.y + info.grab.y)
  await page.mouse.down()
  await page.mouse.move(box.x + info.grab.x + 120, box.y + info.grab.y + 80, { steps: 6 })

  // Mid-drag: a non-ephemeral widget write on ANOTHER node → command → #scheduleSync microtask.
  const mid = await page.evaluate(async ({ key, otherId, widgetId, draggedId }) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.setWidgetValue(otherId, widgetId, 1) // undoable → triggers a graph sync
    await Promise.resolve(); await Promise.resolve() // let the sync microtask run
    return { live: e.renderedNodePosition(draggedId), committed: { ...e.graph.getNode(draggedId).position } }
  }, { key: E, otherId: info.otherId, widgetId: info.widgetId, draggedId: info.draggedId })

  await page.mouse.up()

  // The view followed the cursor (~+120/+80 world @ zoom 1); the sync did NOT snap it to committed.
  expect(Math.abs(mid.live.x - mid.committed.x)).toBeGreaterThan(60)
  expect(Math.abs(mid.live.y - mid.committed.y)).toBeGreaterThan(40)
  // committed position is unchanged mid-drag (drag commits on drop)
  expect(mid.committed).toEqual(info.committed)
})
