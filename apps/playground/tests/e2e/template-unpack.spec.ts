import { test, expect } from '@playwright/test'

// Unpack (inverse of Convert to Template) inlines an instance's definition back into the graph; the
// definition + other instances stay intact. Ungroup (inverse of Group) dissolves a macro, leaving its
// members. Both via the node context menu / public API.

type Ed = {
  loadJSON: (g: unknown) => void
  selection: { replaceWith: (ids: string[]) => void }
  createTemplateFromSelection: (ids: string[], title?: string) => string | null
  createMacroFromSelection: (ids: string[], title?: string) => string | null
  unpackTemplateInstance: (id: string) => boolean
  ungroupMacro: (id: string) => boolean
  definitions: ReadonlyMap<string, { title: string }>
  viewport: { x: number; y: number; zoom: number }
  graph: {
    nodeCount: number
    getNode: (id: string) => { type: string; position: { x: number; y: number }; size?: { x: number; y: number }; pins: unknown[]; state: Record<string, unknown> } | undefined
    nodes: () => Iterable<{ id: string; type: string }>
    edges: () => Iterable<{ from: { node: string }; to: { node: string } }>
  }
}
const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
  await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const node = (id: string, x: number) => ({
      id, type: 'Box', position: { x, y: 0 },
      pins: [
        { id: `${id}:in`, kind: 'data', direction: 'in', type: 'float', multiple: false, label: 'In' },
        { id: `${id}:out`, kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'Out' },
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
  }, E)
}

const pairs = (page: import('@playwright/test').Page) =>
  page.evaluate((key) => [...(window as unknown as Record<string, Ed>)[key]!.graph.edges()].map((e) => `${e.from.node}->${e.to.node}`).sort(), E)

test('Unpack inlines the definition back into the graph and rewires the boundary edges', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const instId = e.createTemplateFromSelection(['b', 'c'], 'Mid')!
    const defId = e.graph.getNode(instId)!.state['definitionId'] as string
    const ok = e.unpackTemplateInstance(instId)
    return {
      ok,
      instGone: e.graph.getNode(instId) === undefined,
      defStillExists: e.definitions.has(defId), // unpack keeps the definition
      boxCount: [...e.graph.nodes()].filter((n) => n.type === 'Box').length,
      noBoundary: [...e.graph.nodes()].every((n) => n.type !== '$templateInput' && n.type !== '$templateOutput'),
    }
  }, E)
  expect(r.ok).toBe(true)
  expect(r.instGone).toBe(true)
  expect(r.defStillExists).toBe(true)
  // a, d (originals) + 2 inlined copies of b,c = 4 Box nodes.
  expect(r.boxCount).toBe(4)
  expect(r.noBoundary).toBe(true)
  // Wire restored end to end: a → (inlined b) → (inlined c) → d.
  const ps = await pairs(page)
  expect(ps.some((p) => p.startsWith('a->'))).toBe(true)
  expect(ps.some((p) => p.endsWith('->d'))).toBe(true)
})

test('Unpack of one instance leaves a second instance of the same template intact', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const inst1 = e.createTemplateFromSelection(['b', 'c'], 'Mid')!
    const defId = e.graph.getNode(inst1)!.state['definitionId'] as string
    // Spawn a second instance of the same definition, then unpack the first.
    // (insertNode by defId — palette path — keeps it referencing the shared definition.)
    const inst2 = (e as unknown as { insertNode: (t: string, w: { x: number; y: number }) => { id: string } | null }).insertNode(defId, { x: 0, y: 300 })!
    e.unpackTemplateInstance(inst1)
    return {
      inst1Gone: e.graph.getNode(inst1) === undefined,
      inst2Alive: e.graph.getNode(inst2.id)?.type === '$templateInstance',
      defStillExists: e.definitions.has(defId),
    }
  }, E)
  expect(r.inst1Gone).toBe(true)
  expect(r.inst2Alive).toBe(true)   // the other instance is untouched
  expect(r.defStillExists).toBe(true)
})

test('node menu offers Unpack for an instance and Ungroup for a macro (not vice-versa)', async ({ page }) => {
  await ready(page)
  const center = (id: string) => page.evaluate(([key, nid]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const n = e.graph.getNode(nid)!; const vp = e.viewport; const s = n.size ?? { x: 120, y: 40 }
    return { x: vp.x + (n.position.x + s.x / 2) * vp.zoom, y: vp.y + (n.position.y + 18) * vp.zoom }
  }, [E, id] as const)
  const menu = page.locator('[data-xeno-edge-menu]')

  // A template instance → menu has Unpack (not Ungroup).
  const inst = await page.evaluate((key) => (window as unknown as Record<string, Ed>)[key]!.createTemplateFromSelection(['b', 'c'], 'Mid')!, E)
  let c = await center(inst)
  await page.mouse.click(c.x, c.y, { button: 'right' })
  await expect(menu).toContainText('Unpack')
  await expect(menu).not.toContainText('Ungroup')
  await page.keyboard.press('Escape')

  // A macro group → menu has Ungroup (not Unpack).
  const macroId = await page.evaluate((key) => (window as unknown as Record<string, Ed>)[key]!.createMacroFromSelection(['a', 'd'], 'Grp')!, E)
  c = await center(macroId)
  await page.mouse.click(c.x, c.y, { button: 'right' })
  await expect(menu).toContainText('Ungroup')
  await expect(menu).not.toContainText('Unpack')
})

test('Ungroup a macro wired to another collapsed macro (demo Gather→Pack) does not throw', async ({ page }) => {
  // Regression: Gather's output proxy edge was re-pointed when Pack collapsed, so Gather's stored
  // proxyMap edgeId went stale — ungroup blew up with "DisconnectEdge: edge not found".
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const ok = e.ungroupMacro('gather') // demo's Gather macro, connected to the collapsed Pack macro
    return { ok, gatherGone: e.graph.getNode('gather') === undefined, packAlive: e.graph.getNode('pack') !== undefined }
  }, E)
  expect(r.ok).toBe(true)
  expect(r.gatherGone).toBe(true)
  expect(r.packAlive).toBe(true) // the neighbouring macro is untouched
})

test('Ungroup dissolves a macro and leaves its members wired in the graph', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const macroId = e.createMacroFromSelection(['b', 'c'], 'Grp')!
    const ok = e.ungroupMacro(macroId)
    return {
      ok,
      macroGone: e.graph.getNode(macroId) === undefined,
      bAlive: e.graph.getNode('b') !== undefined,
      cAlive: e.graph.getNode('c') !== undefined,
    }
  }, E)
  expect(r.ok).toBe(true)
  expect(r.macroGone).toBe(true)
  expect(r.bAlive).toBe(true)
  expect(r.cAlive).toBe(true)
  // Original wiring restored: a→b→c→d (no macro in the chain).
  const ps = await pairs(page)
  expect(ps).toContain('a->b')
  expect(ps).toContain('b->c')
  expect(ps).toContain('c->d')
})
