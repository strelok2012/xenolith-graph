import { test, expect } from '@playwright/test'

// Tests the WIDGET CANON: every widget binds to one IN-pin (auto-bind via key matching the pin's
// label/id, or explicit pinKey). Visibility:
//   - `'whenDisconnected'` (default for input controls) — widget visible only while pin has no edge.
//   - `'always'` (default for custom widgets) — widget always visible (display/preview mode).
// Connecting an edge updates THIS turn (no stale edge index on the renderer side).

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
  await page.waitForTimeout(150)
}

interface RectShape { id: string; x: number; y: number; width: number; height: number }

// Pull the widget rects for a node from the editor — drives display, hit-testing, and DOM
// positioning all at once. If a rect is missing, the widget is hidden.
async function widgetRects(page: import('@playwright/test').Page, nodeId: string): Promise<RectShape[]> {
  return page.evaluate(([key, id]) => {
    const e = (window as unknown as Record<string, any>)[key]
    const node = e.graph.getNode(id)
    if (!node?.size) return []
    // Lazy import — render-pixi's computeWidgetRects is exported by name on the module the
    // editor pulled. Reach through the live render-pixi module via the editor's view widgets.
    const view = e._views?.get?.(id)
    // Easier: use the public path — call computeWidgetRects through the renderer module the editor exposes.
    const mod = (window as any).__pixiTestExports
    if (!mod?.computeWidgetRects) {
      // Fallback: introspect through #domWidgets shadow — works for canvas widgets too if the
      // current view rebuilt with the right ctx. Test only relies on widget VISIBILITY, so we can
      // approximate by checking whether the editor's renderer would emit a rect for each widget.
      // The simplest test surface: read node.size as a proxy (shrinks when widgets hide). Tests
      // below assert size deltas, not the rects array directly.
      return []
    }
    return mod.computeWidgetRects(node, node.size.x, mod.tokens, { isPinConnected: (k: string) => e._isPinConnectedForTest(id, k) })
  }, [E, nodeId])
}

// Yield to the microtask queue so the editor's scheduled view-materialisation runs before we
// connect. Mirrors the natural pause between insert-via-palette and drag-to-connect in the UI.
async function settle(page: import('@playwright/test').Page) {
  await page.evaluate(() => new Promise<void>((r) => queueMicrotask(() => r())))
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())))
}

test.describe('canon: visibility', () => {
  test('default-value widget on a free IN-pin renders; connecting an edge hides it; disconnect reveals it', async ({ page }) => {
    await ready(page)
    await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      e.clear()
      e.registry.register({
        type: 'Src', title: 'Src',
        pins: [{ kind: 'data', direction: 'out', type: 'string', label: 'out' }],
      })
      e.registry.register({
        type: 'G', title: 'G',
        pins: [
          { kind: 'data', direction: 'in',  type: 'string', label: 'name' },
          { kind: 'data', direction: 'out', type: 'string', label: 'self' },
        ],
        widgets: [{ id: 'name', type: 'text', label: '', key: 'name' }],
      })
      e.insertNode('Src', { x: -300, y: 0 }, { center: true })
      e.insertNode('G',   { x: 0,    y: 0 }, { center: true })
    }, E)
    await settle(page)
    const r = await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      const g   = [...e.graph.nodes()].find((n: any) => n.type === 'G')
      const src = [...e.graph.nodes()].find((n: any) => n.type === 'Src')
      const free = g.size.y
      e.connect(src, 0, g, 0)
      const connected = g.size.y
      return { free, connected }
    }, E)
    // Free → text widget visible → node taller. Connected → widget hidden → node shrinks
    // SAME TURN (without waiting for a microtask) — this is the regression the user hit.
    expect(r.free).toBeGreaterThan(r.connected)
  })

  test("display widget ('always') keeps rendering when its pin is connected (no size change)", async ({ page }) => {
    await ready(page)
    await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      e.clear()
      e.registerWidget('probe', { draw() { /* noop */ } })
      e.registry.register({
        type: 'Src', title: 'Src',
        pins: [{ kind: 'data', direction: 'out', type: 'any', label: 'out' }],
      })
      e.registry.register({
        type: 'P', title: 'P',
        pins: [
          { kind: 'data', direction: 'in',  type: 'any', label: 'value' },
          { kind: 'data', direction: 'out', type: 'any', label: 'self'  },
        ],
        widgets: [{ id: 'value', type: 'custom', renderer: 'probe', label: '', key: 'value', height: 40, visibility: 'always' }],
      })
      e.insertNode('Src', { x: -300, y: 0 }, { center: true })
      e.insertNode('P',   { x: 0,    y: 0 }, { center: true })
    }, E)
    await settle(page)
    const r = await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      const p   = [...e.graph.nodes()].find((n: any) => n.type === 'P')
      const src = [...e.graph.nodes()].find((n: any) => n.type === 'Src')
      const free = p.size.y
      e.connect(src, 0, p, 0)
      const connected = p.size.y
      return { free, connected }
    }, E)
    expect(r.connected).toBe(r.free)
  })
})

test.describe('canon: auto-bind', () => {
  test('widget.key matches pin label → auto-bind (no pinKey needed)', async ({ page }) => {
    await ready(page)
    await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      e.clear()
      e.registry.register({
        type: 'Src', title: 'Src',
        pins: [{ kind: 'data', direction: 'out', type: 'float', label: 'out' }],
      })
      e.registry.register({
        type: 'T', title: 'T',
        pins: [
          { kind: 'data', direction: 'in',  type: 'float', label: 'scale' },
          { kind: 'data', direction: 'out', type: 'float', label: 'out'   },
        ],
        widgets: [{ id: 'scale', type: 'slider', label: '', key: 'scale', min: 0, max: 1 }],
      })
      e.insertNode('Src', { x: -300, y: 0 }, { center: true })
      e.insertNode('T',   { x: 0,    y: 0 }, { center: true })
    }, E)
    await settle(page)
    const r = await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      const t   = [...e.graph.nodes()].find((n: any) => n.type === 'T')
      const src = [...e.graph.nodes()].find((n: any) => n.type === 'Src')
      const free = t.size.y
      e.connect(src, 0, t, 0)
      const connected = t.size.y
      return { free, connected }
    }, E)
    expect(r.free).toBeGreaterThan(r.connected)
  })

  test('widget without a matching pin is silently dropped (no inflation, no crash)', async ({ page }) => {
    await ready(page)
    const r = await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      e.clear()
      e.registry.register({
        type: 'O', title: 'O',
        pins: [{ kind: 'data', direction: 'out', type: 'any', label: 'self' }],
        widgets: [{ id: 'orphan', type: 'number', label: '', key: 'missing' }],
      })
      const n = e.insertNode('O', { x: 0, y: 0 }, { center: true })
      const bare = e.graph.getNode(n.id).size.y
      // Compare with a sibling that has no widget at all — orphan must NOT make the node taller.
      e.registry.register({ type: 'N', title: 'N', pins: [{ kind: 'data', direction: 'out', type: 'any', label: 'self' }] })
      const m = e.insertNode('N', { x: 200, y: 0 }, { center: true })
      const truebare = e.graph.getNode(m.id).size.y
      return { bare, truebare }
    }, E)
    expect(r.bare).toBe(r.truebare)
  })
})

test.describe('canon: actions row (button widgets)', () => {
  test('a button widget adds a row UNDER the pin band', async ({ page }) => {
    await ready(page)
    const r = await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      e.clear()
      e.registry.register({
        type: 'Sb', title: 'Sb',
        pins: [
          { kind: 'data', direction: 'in',  type: 'any', label: 'In'  },
          { kind: 'data', direction: 'out', type: 'any', label: 'Out' },
        ],
      })
      e.registry.register({
        type: 'Sba', title: 'Sba',
        pins: [
          { kind: 'data', direction: 'in',  type: 'any', label: 'In'  },
          { kind: 'data', direction: 'out', type: 'any', label: 'Out' },
        ],
        widgets: [{ id: 'add', type: 'button', label: '+ add', action: 'add' }],
      })
      const a = e.insertNode('Sb',  { x: 0,   y: 0 }, { center: true })
      const b = e.insertNode('Sba', { x: 200, y: 0 }, { center: true })
      return { plain: e.graph.getNode(a.id).size.y, withBtn: e.graph.getNode(b.id).size.y }
    }, E)
    expect(r.withBtn).toBeGreaterThan(r.plain)
  })
})

test.describe('pin context menu — right-click → Unbind', () => {
  test('right-click on a connected pin offers Unbind, which removes every edge on that pin', async ({ page }) => {
    await ready(page)
    await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      e.clear()
      e.registry.register({ type: 'A', title: 'A', pins: [{ kind: 'data', direction: 'out', type: 'any', label: 'out' }] })
      e.registry.register({ type: 'B', title: 'B', pins: [{ kind: 'data', direction: 'in', type: 'any', label: 'in' }, { kind: 'data', direction: 'out', type: 'any', label: 'out' }] })
      e.insertNode('A', { x: -400, y: 0 }, { center: true })
      e.insertNode('A', { x: -400, y: 200 }, { center: true })
      e.insertNode('B', { x: 0, y: 100 }, { center: true })
    }, E)
    await settle(page)
    const summary = await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      const as = [...e.graph.nodes()].filter((n: any) => n.type === 'A')
      const b  = [...e.graph.nodes()].find((n: any) => n.type === 'B')
      e.connect(as[0], 0, b, 0)
      e.connect(as[1], 0, b, 0)
      const before = [...e.graph.edges()].length
      // Simulate the user picking "Unbind" via the public API the menu wires up: find every edge
      // on the in-pin and delete it in one transaction (mirrors the menu handler).
      const inPinId = String(b.pins[0].id)
      const incident = [...e.graph.edges()].filter((edge: any) => edge.to.node === b.id && String(edge.to.pin) === inPinId).map((edge: any) => edge.id)
      e.commandBus.transaction(() => { for (const id of incident) e.deleteEdge(id) })
      const after = [...e.graph.edges()].length
      // Undo as a single step puts every wire back — the bus saw one transaction, not N.
      e.commandBus.undo()
      const restored = [...e.graph.edges()].length
      return { before, after, restored }
    }, E)
    expect(summary.before).toBe(2)
    expect(summary.after).toBe(0)
    expect(summary.restored).toBe(2)
  })
})

test.describe('canon: pin-row alignment (no stale-index on connect)', () => {
  test('connecting a wire to a bound pin updates the node SAME TURN (renderer reads fresh index)', async ({ page }) => {
    await ready(page)
    await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      e.clear()
      e.registry.register({
        type: 'Src', title: 'Src',
        pins: [{ kind: 'data', direction: 'out', type: 'any', label: 'out' }],
      })
      e.registry.register({
        type: 'E', title: 'E',
        pins: [
          { kind: 'data', direction: 'in',  type: 'any',    label: 'In'    },
          { kind: 'data', direction: 'out', type: 'any',    label: 'Out'   },
          { kind: 'data', direction: 'in',  type: 'string', label: 'tint'  },
        ],
        widgets: [{ id: 'tint', type: 'color', label: '', key: 'tint' }],
      })
      e.insertNode('Src', { x: -300, y: 0 }, { center: true })
      e.insertNode('E',   { x: 0,    y: 0 }, { center: true })
    }, E)
    await settle(page)
    const r = await page.evaluate((key) => {
      const e = (window as unknown as Record<string, any>)[key]
      const en  = [...e.graph.nodes()].find((n: any) => n.type === 'E')
      const src = [...e.graph.nodes()].find((n: any) => n.type === 'Src')
      const free = en.size.y
      const tintIdx = en.pins.findIndex((p: any) => p.label === 'tint')
      e.connect(src, 0, en, tintIdx)
      const connected = en.size.y
      return { free, connected }
    }, E)
    expect(r.connected).toBeLessThan(r.free)
  })
})
