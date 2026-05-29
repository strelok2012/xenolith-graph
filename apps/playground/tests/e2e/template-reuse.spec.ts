import { test, expect } from '@playwright/test'

// Phase 5 — template reuse + interface curation: (1) a created/loaded template shows up in the insert
// palette and inserts as a fresh instance; (2) renameTemplate propagates; (3) adding/renaming an
// Input boundary inside a dived template flows out to the instance pins on dive-out; (4) recursion
// guard refuses instancing the definition you're inside; (5) labels survive the dive-out resync.

type Ed = {
  loadJSON: (g: unknown) => void
  selection: { replaceWith: (ids: string[]) => void }
  createTemplateFromSelection: (ids: string[], title?: string) => string | null
  insertNode: (type: string, world: { x: number; y: number }, opts?: { center?: boolean }) => { id: string } | null
  renameTemplate: (defId: string, title: string) => void
  diveInto: (id: string) => boolean
  diveOut: (toDepth?: number) => void
  diveDepth: number
  connect: (fromNode: unknown, fromPin: number, toNode: unknown, toPin: number) => unknown
  viewport: { x: number; y: number; zoom: number }
  definitions: ReadonlyMap<string, { title: string; nodes: { id: string; type: string; pins: { id: string }[] }[] }>
  graph: {
    getNode: (id: string) => { id: string; type: string; position: { x: number; y: number }; size?: { x: number; y: number }; pins: { id: string; direction: string; label?: string }[]; state: Record<string, unknown> } | undefined
    nodes: () => Iterable<{ id: string; type: string }>
  }
}
const E = '__xenoEditor'
const PALETTE = '[data-xeno-palette]'
const INPUT = '[data-xeno-palette-input]'
const ROW = '[data-xeno-palette-row]'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('the demo Backup template shows up in the insert palette', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('Tab')
  await page.locator(INPUT).fill('Backup')
  await expect(page.locator(ROW).first()).toContainText('Backup')
  await expect(page.locator(PALETTE)).toBeVisible()
})

test('inserting a template from the palette spawns a fresh instance', async ({ page }) => {
  await ready(page)
  const before = await page.evaluate((key) => [...(window as unknown as Record<string, Ed>)[key]!.graph.nodes()].filter((n) => n.type === '$templateInstance').length, E)
  await page.keyboard.press('Tab')
  await page.locator(INPUT).fill('Backup')
  await page.locator(ROW).first().click()
  await expect(page.locator(PALETTE)).toBeHidden()
  const after = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const insts = [...e.graph.nodes()].filter((n) => n.type === '$templateInstance')
    return { count: insts.length, allShareDef: insts.every((n) => e.graph.getNode(n.id)!.state['definitionId'] === 'backup_def') }
  }, E)
  expect(after.count).toBe(before + 1)
  expect(after.allShareDef).toBe(true) // both instances reference the one shared definition
})

test('renameTemplate updates every instance title + the palette entry', async ({ page }) => {
  await ready(page)
  await page.evaluate((key) => (window as unknown as Record<string, Ed>)[key]!.renameTemplate('backup_def', 'Snapshot'), E)
  const title = await page.evaluate((key) => (window as unknown as Record<string, Ed>)[key]!.definitions.get('backup_def')!.title, E)
  expect(title).toBe('Snapshot')
  await page.keyboard.press('Tab')
  await page.locator(INPUT).fill('Snapshot')
  await expect(page.locator(ROW).first()).toContainText('Snapshot')
})

test('adding + renaming an Input inside a dived template flows out to a new instance pin', async ({ page }) => {
  await ready(page)
  const out = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const before = e.graph.getNode('backup')!.pins.filter((p) => p.direction === 'in').length
    e.diveInto('backup')
    // Add an Input boundary node, wire its out pin (index 0) → Compress.in (index 0), label it.
    const inp = e.insertNode('$templateInput', { x: -40, y: 360 })!
    const inpNode = e.graph.getNode(inp.id)!
    const stepNode = e.graph.getNode('bk_compress')!
    e.connect(inpNode, 0, stepNode, 0)
    ;(inpNode.pins[0] as { label?: string }).label = 'Extra' // rename → interface pin label
    e.diveOut()
    const inst = e.graph.getNode('backup')!
    return {
      before,
      inCount: inst.pins.filter((p) => p.direction === 'in').length,
      labels: inst.pins.filter((p) => p.direction === 'in').map((p) => p.label),
    }
  }, E)
  expect(out.inCount).toBe(out.before + 1) // the instance gained an input
  expect(out.labels).toContain('Extra')    // with the boundary node's label
})

test('node-menu Rename on an instance renames the template inline', async ({ page }) => {
  await ready(page)
  const c = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const n = e.graph.getNode('backup')!
    const vp = e.viewport
    const s = n.size ?? { x: 120, y: 40 }
    return { x: vp.x + (n.position.x + s.x / 2) * vp.zoom, y: vp.y + (n.position.y + 20) * vp.zoom }
  }, E)
  await page.mouse.click(c.x, c.y, { button: 'right' })
  const menu = page.locator('[data-xeno-edge-menu]')
  await expect(menu).toBeVisible()
  await menu.getByText('Rename').click()
  const field = page.locator('.xeno-widget-field')
  await expect(field).toBeVisible()
  await field.fill('Vault')
  await field.press('Enter')
  const title = await page.evaluate((key) => (window as unknown as Record<string, Ed>)[key]!.definitions.get('backup_def')!.title, E)
  expect(title).toBe('Vault')
})

test('instance node widens for a long pin label; a long title stays capped (ellipsised)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const widthOf = (id: string) => (e.graph.getNode(id) as unknown as { size?: { x: number } }).size?.x ?? 0
    const before = widthOf('backup')
    // Add an Input with a very long label inside the definition → instance must widen to fit it.
    e.diveInto('backup')
    const inp = e.insertNode('$templateInput', { x: -60, y: 360 })!
    const inpNode = e.graph.getNode(inp.id)!
    e.connect(inpNode, 0, e.graph.getNode('bk_compress')!, 0)
    ;(inpNode.pins[0] as { label?: string }).label = 'a_really_long_interface_pin_label_xxxxxxxxxxxxxxxx'
    e.diveOut()
    const wideForPin = widthOf('backup')
    // Now a very long TITLE must NOT widen it further — it ellipsises instead.
    e.renameTemplate('backup_def', 'An Extremely Long Template Title That Should Be Truncated Not Stretch The Node')
    const afterLongTitle = widthOf('backup')
    return { before, wideForPin, afterLongTitle }
  }, E)
  expect(r.wideForPin).toBeGreaterThan(r.before)        // grew to fit the long pin label
  expect(r.afterLongTitle).toBe(r.wideForPin)           // long title did not stretch it further
})

test('instance + boundary pins keep their labels through a dive in/out (resync preserves labels)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const labelsOf = (id: string) => (e.graph.getNode(id) as unknown as { pins: { label?: string }[] }).pins.map((p) => p.label)
    const before = labelsOf('backup')
    e.diveInto('backup')
    const inLbl = (e.graph.getNode('bk_payload') as unknown as { pins: { label?: string }[] }).pins[0]?.label
    const outLbl = (e.graph.getNode('bk_archive') as unknown as { pins: { label?: string }[] }).pins[0]?.label
    e.diveOut()
    return { before, after: labelsOf('backup'), boundaryIn: inLbl, boundaryOut: outLbl }
  }, E)
  expect(r.boundaryIn).toBe('Payload') // boundary node pins are labelled inside the template
  expect(r.boundaryOut).toBe('Archive')
  expect(r.before).toEqual(['Payload', 'Key', 'Archive', 'Size'])
  expect(r.after).toEqual(['Payload', 'Key', 'Archive', 'Size']) // labels survive the dive-out resync
})

test('recursion guard: cannot insert an instance of the definition you are inside', async ({ page }) => {
  await ready(page)
  const refused = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    e.diveInto('backup') // now inside backup_def
    const node = e.insertNode('backup_def', { x: 100, y: 100 })
    return node === null
  }, E)
  expect(refused).toBe(true)
})
