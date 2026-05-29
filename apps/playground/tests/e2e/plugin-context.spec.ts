import { test, expect } from '@playwright/test'

// Rounded-out PluginContext for @xenolith/plugin-runtime: tick clock, setNodePins,
// expandTemplateInstance, graphSnapshot (+expandMacros flatten), setEdgeAnimated, and the
// non-undoable ephemeral setWidgetValue — all reachable via the plugin context (not the live editor).

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('PluginContext exposes the runtime surface and it works through ctx', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const seen: Record<string, unknown> = {}
    e.use({
      name: 'rt-probe',
      install(ctx: any) {
        for (const m of ['onTick', 'startLoop', 'stopLoop', 'step', 'setWidgetValue', 'setNodePins', 'setEdgeAnimated', 'expandTemplateInstance', 'graphSnapshot']) {
          seen[m] = typeof ctx[m] === 'function'
        }
        // tick clock through ctx
        let dt = -1
        const off = ctx.onTick((d: number) => { dt = d })
        ctx.step(16)
        off()
        seen.tickFired = dt === 16
        // snapshot through ctx
        const snap = ctx.graphSnapshot()
        seen.snapshotShape = Array.isArray(snap.nodes) && Array.isArray(snap.edges) && typeof snap.nodes[0].id === 'string'
        // expandTemplateInstance through ctx
        seen.expandWorks = ctx.expandTemplateInstance('backup') !== null
      },
    })
    return seen
  }, E)
  for (const m of ['onTick', 'startLoop', 'stopLoop', 'step', 'setWidgetValue', 'setNodePins', 'setEdgeAnimated', 'expandTemplateInstance', 'graphSnapshot']) {
    expect(r[m], m).toBe(true)
  }
  expect(r.tickFired).toBe(true)
  expect(r.snapshotShape).toBe(true)
  expect(r.expandWorks).toBe(true)
})

test('ephemeral setWidgetValue does not grow the undo stack; a plain write does', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const node = [...e.graph.nodes()].find((n: any) => (n.widgets ?? []).some((w: any) => w.key !== undefined))
    const w = node.widgets.find((wd: any) => wd.key !== undefined)
    const before = e.canUndo()
    for (let i = 0; i < 5; i++) e.setWidgetValue(node.id, w.id, 1, { ephemeral: true })
    const afterEphemeral = e.canUndo()
    e.setWidgetValue(node.id, w.id, 1) // plain → undoable
    const afterPlain = e.canUndo()
    return { before, afterEphemeral, afterPlain }
  }, E)
  expect(r.before).toBe(false)
  expect(r.afterEphemeral).toBe(false) // 5 ephemeral writes added nothing to undo
  expect(r.afterPlain).toBe(true)      // a plain write is undoable
})

test('graphSnapshot({expandMacros}) flattens collapsed macros; setEdgeAnimated round-trips', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const plain = e.graphSnapshot()
    const flat = e.graphSnapshot({ expandMacros: true })
    // toggle animation on the first edge, check it serializes
    const edge = [...e.graph.edges()][0]
    e.setEdgeAnimated(edge.id, true)
    const json = e.toJSON()
    const serialized = json.edges.find((x: any) => x.id === edge.id)
    return {
      plainHasMacro: plain.nodes.some((n: any) => n.type === 'Macro'),
      flatHasMacro: flat.nodes.some((n: any) => n.type === 'Macro'),
      flatHasMembers: flat.nodes.length > 0,
      animated: serialized?.opts?.animated === true,
    }
  }, E)
  expect(r.plainHasMacro).toBe(true)  // demo has collapsed Gather/Pack
  expect(r.flatHasMacro).toBe(false)  // flattened away
  expect(r.flatHasMembers).toBe(true)
  expect(r.animated).toBe(true)
})
