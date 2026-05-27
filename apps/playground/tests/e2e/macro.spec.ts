import { test, expect } from '@playwright/test'

// Macro (inline collapse, pin-proxy rewire): grouping nodes rewires boundary edges onto the macro's
// proxy pins; expanding restores the originals. Drives the editor through __xenoEditor.

type Ed = {
  loadJSON: (g: unknown) => void
  toJSON: () => unknown
  createMacroFromSelection: (ids: string[]) => string | null
  expandMacro: (id: string) => void
  collapseMacro: (id: string) => void
  graph: {
    nodeCount: number
    getNode: (id: string) => { type: string; pins: unknown[]; state: Record<string, unknown> } | undefined
    edges: () => Iterable<{ from: { node: string }; to: { node: string } }>
  }
}

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as { __xenoEditor?: unknown }).__xenoEditor !== undefined)
  // Replace with a tiny deterministic graph: a → b → c → d, group {b, c}.
  await page.evaluate(() => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    const node = (id: string, x: number) => ({
      id, type: 'Box', position: { x, y: 0 },
      pins: [
        { id: `${id}:in`, kind: 'data', direction: 'in', type: 'float', multiple: false },
        { id: `${id}:out`, kind: 'data', direction: 'out', type: 'float', multiple: true },
      ],
    })
    e.loadJSON({
      version: 'xenolith.v1',
      nodes: ['a', 'b', 'c', 'd'].map((id, i) => node(id, i * 200)),
      edges: [
        { id: 'ab', from: { node: 'a', pin: 'a:out' }, to: { node: 'b', pin: 'b:in' } },
        { id: 'bc', from: { node: 'b', pin: 'b:out' }, to: { node: 'c', pin: 'c:in' } },
        { id: 'cd', from: { node: 'c', pin: 'c:out' }, to: { node: 'd', pin: 'd:in' } },
      ],
    })
  })
}

const edgePairs = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    return [...e.graph.edges()].map((ed) => `${ed.from.node}->${ed.to.node}`).sort()
  })

test('grouping rewires boundary edges onto the macro and hides nothing in the graph model', async ({ page }) => {
  await ready(page)
  const macroId = await page.evaluate(() => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    return e.createMacroFromSelection(['b', 'c'])
  })
  expect(macroId).toBeTruthy()

  const macro = await page.evaluate((id) => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    const m = e.graph.getNode(id)!
    return { type: m.type, pinCount: m.pins.length, collapsed: m.state['collapsed'] }
  }, macroId)
  expect(macro.type).toBe('Macro')
  expect(macro.collapsed).toBe(true)
  expect(macro.pinCount).toBe(2) // one in (a→b), one out (c→d)

  // a→b becomes a→macro; c→d becomes macro→d; b→c stays internal.
  const pairs = await edgePairs(page)
  expect(pairs).toContain(`a->${macroId}`)
  expect(pairs).toContain(`${macroId}->d`)
  expect(pairs).toContain('b->c')
  expect(pairs).not.toContain('a->b')
  expect(pairs).not.toContain('c->d')
})

test('a collapsed macro round-trips through toJSON/loadJSON', async ({ page }) => {
  await ready(page)
  const before = await page.evaluate(() => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    const id = e.createMacroFromSelection(['b', 'c'])!
    const json = e.toJSON()
    return { id, json, pairs: [...e.graph.edges()].map((ed) => `${ed.from.node}->${ed.to.node}`).sort() }
  })
  const after = await page.evaluate((data) => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    e.loadJSON(data.json)
    const m = e.graph.getNode(data.id)!
    return {
      type: m.type,
      collapsed: m.state['collapsed'],
      members: (m.state['members'] as string[]).slice().sort(),
      pins: m.pins.length,
      pairs: [...e.graph.edges()].map((ed) => `${ed.from.node}->${ed.to.node}`).sort(),
    }
  }, before)
  expect(after.type).toBe('Macro')
  expect(after.collapsed).toBe(true)
  expect(after.members).toEqual(['b', 'c'])
  expect(after.pins).toBe(2)
  expect(after.pairs).toEqual(before.pairs) // boundary rewiring preserved exactly
})

test('demo loads Gather/Pack as materialised collapsed macros (declarative format)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as { __xenoEditor?: unknown }).__xenoEditor !== undefined)
  await page.waitForTimeout(400)
  const macros = await page.evaluate(() => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    return [...e.graph.nodes()].filter((n) => n.type === 'Macro').map((m) => ({
      collapsed: m.state['collapsed'],
      pins: (m.pins as { label?: string }[]).map((p) => p.label),
    }))
  })
  // Gather + Pack + their nested Sub macros.
  expect(macros.length).toBeGreaterThanOrEqual(4)
  expect(macros.every((m) => m.collapsed === true)).toBe(true)
  // Gather macro exposes A/B/C + Out (proxy pins materialised from boundary edges, labels preserved).
  const gather = macros.find((m) => m.pins.includes('A'))!
  expect(gather.pins).toEqual(expect.arrayContaining(['A', 'B', 'C', 'Out']))
})

test('macro-in-macro: nesting collapses correctly', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as { __xenoEditor?: unknown }).__xenoEditor !== undefined)
  const result = await page.evaluate(() => {
    const e = (window as unknown as { __xenoEditor: Ed & { collapseMacro: (id: string) => void } }).__xenoEditor
    const node = (id: string, x: number) => ({
      id, type: 'Box', position: { x, y: 0 },
      pins: [{ id: `${id}:in`, kind: 'data', direction: 'in', type: 'float', multiple: false },
             { id: `${id}:out`, kind: 'data', direction: 'out', type: 'float', multiple: true }],
    })
    e.loadJSON({
      version: 'xenolith.v1',
      nodes: ['a', 'b', 'c', 'd', 'z'].map((id, i) => node(id, i * 200)),
      edges: [
        { id: 'ab', from: { node: 'a', pin: 'a:out' }, to: { node: 'b', pin: 'b:in' } },
        { id: 'bc', from: { node: 'b', pin: 'b:out' }, to: { node: 'c', pin: 'c:in' } },
        { id: 'cd', from: { node: 'c', pin: 'c:out' }, to: { node: 'd', pin: 'd:in' } },
        { id: 'dz', from: { node: 'd', pin: 'd:out' }, to: { node: 'z', pin: 'z:in' } },
      ],
    })
    const inner = e.createMacroFromSelection(['c', 'd'])!   // boundary: b→inner, inner→z
    const outer = e.createMacroFromSelection(['b', inner])! // nests the inner macro
    const om = e.graph.getNode(outer)!
    return {
      innerType: e.graph.getNode(inner)!.type,
      outerType: om.type,
      outerCollapsed: om.state['collapsed'],
      pairs: [...e.graph.edges()].map((ed) => `${ed.from.node}->${ed.to.node}`),
      outerId: outer, innerId: inner,
    }
  })
  expect(result.innerType).toBe('Macro')
  expect(result.outerType).toBe('Macro')
  expect(result.outerCollapsed).toBe(true)
  // a → outer (the only external feed) and outer → z (the only external output) after nesting.
  expect(result.pairs).toContain(`a->${result.outerId}`)
  expect(result.pairs).toContain(`${result.outerId}->z`)
})

test('expanding restores the original member edges', async ({ page }) => {
  await ready(page)
  const macroId = await page.evaluate(() => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    return e.createMacroFromSelection(['b', 'c'])!
  })
  await page.evaluate((id) => (window as unknown as { __xenoEditor: Ed }).__xenoEditor.expandMacro(id), macroId)

  const pairs = await edgePairs(page)
  expect(pairs).toContain('a->b')
  expect(pairs).toContain('c->d')
  expect(pairs).toContain('b->c')
  expect(pairs).not.toContain(`a->${macroId}`)
  expect(pairs).not.toContain(`${macroId}->d`)
})
