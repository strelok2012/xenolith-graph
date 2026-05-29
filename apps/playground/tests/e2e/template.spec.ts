import { test, expect } from '@playwright/test'

// Live-template (reusable subgraph): converting a selection moves the members into a shared
// definition and leaves a single $templateInstance wired in their place. The instance's pins mirror
// the definition's boundary. Round-trips through toJSON/loadJSON. Drives via __xenoEditor.

type Ed = {
  loadJSON: (g: unknown) => void
  toJSON: () => unknown
  createTemplateFromSelection: (ids: string[], title?: string) => string | null
  definitions: ReadonlyMap<string, { id: string; title: string; nodes: { id: string; type: string }[]; edges: { id: string }[] }>
  graph: {
    nodeCount: number
    getNode: (id: string) => { type: string; pins: unknown[]; state: Record<string, unknown> } | undefined
    nodes: () => Iterable<{ id: string; type: string }>
    edges: () => Iterable<{ from: { node: string }; to: { node: string } }>
  }
}

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as { __xenoEditor?: unknown }).__xenoEditor !== undefined)
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
  page.evaluate(() => [...(window as unknown as { __xenoEditor: Ed }).__xenoEditor.graph.edges()].map((e) => `${e.from.node}->${e.to.node}`).sort())

test('converting a selection extracts a definition and leaves one wired instance', async ({ page }) => {
  await ready(page)
  const instId = await page.evaluate(() =>
    (window as unknown as { __xenoEditor: Ed }).__xenoEditor.createTemplateFromSelection(['b', 'c'], 'Mid'))
  expect(instId).toBeTruthy()

  const inst = await page.evaluate((id) => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    const n = e.graph.getNode(id)!
    return {
      type: n.type,
      pinCount: n.pins.length,
      bMember: e.graph.getNode('b') !== undefined,
      cMember: e.graph.getNode('c') !== undefined,
      defCount: e.definitions.size,
    }
  }, instId)
  expect(inst.type).toBe('$templateInstance')
  expect(inst.pinCount).toBe(2) // one in (a→b boundary), one out (c→d boundary)
  expect(inst.bMember).toBe(false) // members moved into the definition
  expect(inst.cMember).toBe(false)
  expect(inst.defCount).toBe(1)

  // a→instance, instance→d; b→c is gone from the OUTER graph (it lives in the definition).
  const pairs = await edgePairs(page)
  expect(pairs).toContain(`a->${instId}`)
  expect(pairs).toContain(`${instId}->d`)
  expect(pairs).not.toContain('a->b')
  expect(pairs).not.toContain('c->d')
  expect(pairs).not.toContain('b->c')

  // The definition holds the members + auto-derived boundary nodes.
  const def = await page.evaluate((id) => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    const defId = e.graph.getNode(id)!.state['definitionId'] as string
    const d = e.definitions.get(defId)!
    return {
      members: d.nodes.filter((n) => n.type === 'Box').map((n) => n.id).sort(),
      ins: d.nodes.filter((n) => n.type === '$templateInput').length,
      outs: d.nodes.filter((n) => n.type === '$templateOutput').length,
      hasInternalBC: d.edges.some((ee) => ee.id === 'bc'),
    }
  }, instId)
  expect(def.members).toEqual(['b', 'c'])
  expect(def.ins).toBe(1)
  expect(def.outs).toBe(1)
  expect(def.hasInternalBC).toBe(true)
})

test('a template instance + definition round-trip through toJSON/loadJSON', async ({ page }) => {
  await ready(page)
  const before = await page.evaluate(() => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    const id = e.createTemplateFromSelection(['b', 'c'], 'Mid')!
    return { id, json: e.toJSON(), pairs: [...e.graph.edges()].map((x) => `${x.from.node}->${x.to.node}`).sort() }
  })
  const after = await page.evaluate((data) => {
    const e = (window as unknown as { __xenoEditor: Ed }).__xenoEditor
    e.loadJSON(data.json)
    const n = e.graph.getNode(data.id)!
    const defId = n.state['definitionId'] as string
    const d = e.definitions.get(defId)!
    return {
      type: n.type,
      pins: n.pins.length,
      defCount: e.definitions.size,
      members: d.nodes.filter((m) => m.type === 'Box').map((m) => m.id).sort(),
      pairs: [...e.graph.edges()].map((x) => `${x.from.node}->${x.to.node}`).sort(),
    }
  }, before)
  expect(after.type).toBe('$templateInstance')
  expect(after.pins).toBe(2)
  expect(after.defCount).toBe(1)
  expect(after.members).toEqual(['b', 'c'])
  expect(after.pairs).toEqual(before.pairs) // outer rewiring preserved exactly
})
