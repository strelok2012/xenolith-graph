import { test, expect } from '@playwright/test'

// Nesting to depth 3: convert {b,c} into a template, dive in, convert its inner {b,c} again, dive in,
// once more — each level must derive a clean 1-in/1-out interface, the breadcrumb must track the
// chain, ancestors must be hidden from the palette (no recursion), and the whole thing must
// round-trip through toJSON/loadJSON.

type Ed = {
  loadJSON: (g: unknown) => void
  toJSON: () => unknown
  selection: { replaceWith: (ids: string[]) => void }
  createTemplateFromSelection: (ids: string[], title?: string) => string | null
  diveInto: (id: string) => boolean
  diveOut: (toDepth?: number) => void
  diveDepth: number
  definitions: ReadonlyMap<string, { title: string; nodes: { id: string; type: string }[] }>
  graph: {
    getNode: (id: string) => { type: string; pins: { direction: string }[]; state: Record<string, unknown> } | undefined
    nodes: () => Iterable<{ id: string; type: string }>
  }
}
const E = '__xenoEditor'
const PALETTE_INPUT = '[data-xeno-palette-input]'
const ROW = '[data-xeno-palette-row]'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
  await page.evaluate((key) => {
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
  }, E)
}

/** Convert {b,c} at the current level into a template `title`, return its instance's pin directions. */
async function convertBC(page: import('@playwright/test').Page, title: string) {
  return page.evaluate(([key, t]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    e.selection.replaceWith(['b', 'c'])
    const id = e.createTemplateFromSelection(['b', 'c'], t)!
    const inst = e.graph.getNode(id)!
    return { id, ins: inst.pins.filter((p) => p.direction === 'in').length, outs: inst.pins.filter((p) => p.direction === 'out').length }
  }, [E, title] as const)
}

test('templates nest 3 levels deep, each with a clean 1-in/1-out interface', async ({ page }) => {
  await ready(page)

  // L1 at the root: boundary a→b (in) and c→d (out).
  const l1 = await convertBC(page, 'L1')
  expect(l1).toMatchObject({ ins: 1, outs: 1 })

  const enter = (id: string) => page.evaluate(([key, i]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    return { ok: e.diveInto(i), depth: e.diveDepth, types: [...e.graph.nodes()].map((n) => n.type).sort() }
  }, [E, id] as const)

  const d1 = await enter(l1.id)
  expect(d1.ok).toBe(true)
  expect(d1.depth).toBe(1)
  expect(d1.types).toEqual(['$templateInput', '$templateOutput', 'Box', 'Box']) // in → b → c → out

  // L2: convert the inner {b,c} — boundary is now the parent's $templateInput/$templateOutput.
  const l2 = await convertBC(page, 'L2')
  expect(l2).toMatchObject({ ins: 1, outs: 1 })
  const d2 = await enter(l2.id)
  expect(d2.depth).toBe(2)
  expect(d2.types).toEqual(['$templateInput', '$templateOutput', 'Box', 'Box'])

  // L3
  const l3 = await convertBC(page, 'L3')
  expect(l3).toMatchObject({ ins: 1, outs: 1 })
  const d3 = await enter(l3.id)
  expect(d3.depth).toBe(3)
  expect(d3.types).toEqual(['$templateInput', '$templateOutput', 'Box', 'Box'])

  // Breadcrumb shows the full chain.
  await expect(page.locator('[data-xeno-breadcrumb]')).toContainText('Root')
  await expect(page.locator('[data-xeno-breadcrumb]')).toContainText('L1')
  await expect(page.locator('[data-xeno-breadcrumb]')).toContainText('L3')

  // Pop all the way back to the root; the L1 instance interface is preserved end to end.
  const root = await page.evaluate(([key, id]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    e.diveOut(0)
    const inst = e.graph.getNode(id)!
    return {
      depth: e.diveDepth,
      ins: inst.pins.filter((p) => p.direction === 'in').length,
      outs: inst.pins.filter((p) => p.direction === 'out').length,
      defCount: e.definitions.size,
    }
  }, [E, l1.id] as const)
  expect(root.depth).toBe(0)
  expect(root).toMatchObject({ ins: 1, outs: 1 })
  expect(root.defCount).toBeGreaterThanOrEqual(3) // L1, L2, L3 (+ demo's Backup)
})

test('ancestor templates are hidden from the palette while dived (no recursion)', async ({ page }) => {
  await ready(page)
  const l1 = await convertBC(page, 'Alpha')
  await page.evaluate(([key, id]) => (window as unknown as Record<string, Ed>)[key]!.diveInto(id), [E, l1.id] as const)
  const l2 = await convertBC(page, 'Beta')
  await page.evaluate(([key, id]) => (window as unknown as Record<string, Ed>)[key]!.diveInto(id), [E, l2.id] as const)
  // Now dived: Root › Alpha › Beta. Neither Alpha nor Beta may appear in the palette (both would recurse).
  await page.keyboard.press('Tab')
  await page.locator(PALETTE_INPUT).fill('Alpha')
  await expect(page.locator(ROW)).toHaveCount(0)
  await page.locator(PALETTE_INPUT).fill('Beta')
  await expect(page.locator(ROW)).toHaveCount(0)
})

test('a 3-level nested template round-trips through toJSON/loadJSON', async ({ page }) => {
  await ready(page)
  const l1 = await convertBC(page, 'L1')
  await page.evaluate(([key, id]) => (window as unknown as Record<string, Ed>)[key]!.diveInto(id), [E, l1.id] as const)
  const l2 = await convertBC(page, 'L2')
  await page.evaluate(([key, id]) => (window as unknown as Record<string, Ed>)[key]!.diveInto(id), [E, l2.id] as const)
  await convertBC(page, 'L3')

  const after = await page.evaluate(([key, id]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const json = e.toJSON()
    e.loadJSON(json) // resets to root
    const inst = e.graph.getNode(id)!
    // Walk the chain by title to confirm all three definitions survived.
    const titles = [...e.definitions.values()].map((d) => d.title)
    return {
      depth: e.diveDepth,
      l1Pins: inst.pins.length,
      hasL1: titles.includes('L1'), hasL2: titles.includes('L2'), hasL3: titles.includes('L3'),
    }
  }, [E, l1.id] as const)
  expect(after.depth).toBe(0)        // load returns to root
  expect(after.l1Pins).toBe(2)       // L1 instance keeps its 1-in/1-out
  expect(after.hasL1 && after.hasL2 && after.hasL3).toBe(true)
})
