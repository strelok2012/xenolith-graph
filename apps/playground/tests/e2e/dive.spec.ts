import { test, expect } from '@playwright/test'

// Dive-in editing: double-click (or diveInto) a $templateInstance to edit its shared definition on
// the same canvas, with a breadcrumb to pop back out. Edits land in the definition (per-level bus),
// the root document is untouched until you dive out. Drives via __xenoEditor.

type Ed = {
  loadJSON: (g: unknown) => void
  toJSON: () => { templates?: Record<string, { nodes: { id: string; type: string; position: { x: number; y: number } }[] }> }
  createTemplateFromSelection: (ids: string[], title?: string) => string | null
  diveInto: (instanceId: string) => boolean
  diveOut: (toDepth?: number) => void
  diveDepth: number
  moveNode: (id: string, pos: { x: number; y: number }) => boolean
  undo: () => boolean
  graph: {
    getNode: (id: string) => { type: string; position: { x: number; y: number }; pins: unknown[]; state: Record<string, unknown> } | undefined
    nodes: () => Iterable<{ id: string; type: string }>
  }
}

const E = '__xenoEditor'

async function readyWithTemplate(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>)['__xenoEditor'] !== undefined)
  return page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
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
    return e.createTemplateFromSelection(['b', 'c'], 'Mid')!
  }, E)
}

test('diveInto swaps the displayed graph to the definition; diveOut restores the root', async ({ page }) => {
  const instId = await readyWithTemplate(page)

  const dived = await page.evaluate(([key, id]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const ok = e.diveInto(id)
    const types = [...e.graph.nodes()].map((n) => n.type).sort()
    return {
      ok, depth: e.diveDepth, types,
      hasMembers: e.graph.getNode('b') !== undefined && e.graph.getNode('c') !== undefined,
      rootGone: e.graph.getNode('a') === undefined && e.graph.getNode(id) === undefined,
    }
  }, [E, instId] as const)
  expect(dived.ok).toBe(true)
  expect(dived.depth).toBe(1)
  expect(dived.hasMembers).toBe(true) // members are inside the definition
  expect(dived.rootGone).toBe(true)   // root nodes are not displayed while dived
  expect(dived.types).toContain('$templateInput')
  expect(dived.types).toContain('$templateOutput')

  const out = await page.evaluate(([key, id]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    e.diveOut()
    return {
      depth: e.diveDepth,
      rootBack: e.graph.getNode('a') !== undefined && e.graph.getNode(id) !== undefined && e.graph.getNode('d') !== undefined,
      membersHidden: e.graph.getNode('b') === undefined && e.graph.getNode('c') === undefined,
    }
  }, [E, instId] as const)
  expect(out.depth).toBe(0)
  expect(out.rootBack).toBe(true)
  expect(out.membersHidden).toBe(true)
})

test('edits while dived land in the definition, not the root; survive dive-out', async ({ page }) => {
  const instId = await readyWithTemplate(page)
  const result = await page.evaluate(([key, id]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    e.diveInto(id)
    e.moveNode('b', { x: 999, y: 777 })
    e.diveOut()
    const json = e.toJSON()
    const defId = e.graph.getNode(id)!.state['definitionId'] as string
    const bInDef = json.templates![defId]!.nodes.find((n) => n.id === 'b')!
    return {
      bInRoot: e.graph.getNode('b') !== undefined,
      bx: bInDef.position.x, by: bInDef.position.y,
    }
  }, [E, instId] as const)
  expect(result.bInRoot).toBe(false)      // b stays in the definition
  expect(result.bx).toBe(999)             // the edit was captured into the definition
  expect(result.by).toBe(777)
})

test('undo while dived reverts the definition edit only', async ({ page }) => {
  const instId = await readyWithTemplate(page)
  const r = await page.evaluate(([key, id]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    e.diveInto(id)
    const before = e.graph.getNode('b')!.position.x
    e.moveNode('b', { x: 999, y: 0 })
    const moved = e.graph.getNode('b')!.position.x
    e.undo()
    const afterUndo = e.graph.getNode('b')!.position.x
    return { before, moved, afterUndo, depth: e.diveDepth }
  }, [E, instId] as const)
  expect(r.moved).toBe(999)
  expect(r.afterUndo).toBe(r.before) // undo reverted within the definition
  expect(r.depth).toBe(1)            // still dived
})

test('recursion guard: diveInto refuses a non-instance node', async ({ page }) => {
  await readyWithTemplate(page)
  const ok = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    return e.diveInto('a') // 'a' is a plain Box, not a $templateInstance
  }, E)
  expect(ok).toBe(false)
})

test('a breadcrumb appears while dived and is gone at the root', async ({ page }) => {
  const instId = await readyWithTemplate(page)
  await page.evaluate(([key, id]) => (window as unknown as Record<string, Ed>)[key]!.diveInto(id), [E, instId] as const)
  await expect(page.locator('[data-xeno-breadcrumb]')).toBeVisible()
  await page.evaluate((key) => (window as unknown as Record<string, Ed>)[key]!.diveOut(), E)
  await expect(page.locator('[data-xeno-breadcrumb]')).toHaveCount(0)
})
