import { test, expect } from '@playwright/test'

// Node right-click context menu: one node selected → Delete; many selected → Group / Convert to
// Template. Plus: the demo ships a ready $templateInstance ("Backup") wired off `archive` that you
// can dive into. Drives via __xenoEditor + real right-clicks.

type Ed = {
  selection: { replaceWith: (ids: string[]) => void; ids: () => string[] }
  definitions: ReadonlyMap<string, { title: string }>
  diveInto: (id: string) => boolean
  diveDepth: number
  viewport: { x: number; y: number; zoom: number }
  graph: {
    getNode: (id: string) => { type: string; position: { x: number; y: number }; size?: { x: number; y: number } } | undefined
    nodes: () => Iterable<{ id: string; type: string }>
  }
}

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>)['__xenoEditor'] !== undefined)
}

/** Screen-space centre of a node (canvas fills the viewport, so offset ≈ page coords). */
function nodeCenter(page: import('@playwright/test').Page, id: string) {
  return page.evaluate(([key, nid]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const n = e.graph.getNode(nid)!
    const vp = e.viewport
    const s = n.size ?? { x: 120, y: 40 }
    return { x: vp.x + (n.position.x + s.x / 2) * vp.zoom, y: vp.y + (n.position.y + s.y / 2) * vp.zoom }
  }, [E, id] as const)
}

test('right-click one node → only Delete', async ({ page }) => {
  await ready(page)
  const c = await nodeCenter(page, 'display')
  await page.mouse.click(c.x, c.y, { button: 'right' })
  const menu = page.locator('[data-xeno-edge-menu]')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('Delete')
  await expect(menu).not.toContainText('Group')
  await expect(menu).not.toContainText('Convert to Template')
})

test('right-click with many selected → Group / Convert to Template', async ({ page }) => {
  await ready(page)
  await page.evaluate((key) => (window as unknown as Record<string, Ed>)[key]!.selection.replaceWith(['display', 'audit']), E)
  const c = await nodeCenter(page, 'display')
  await page.mouse.click(c.x, c.y, { button: 'right' })
  const menu = page.locator('[data-xeno-edge-menu]')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('Group')
  await expect(menu).toContainText('Convert to Template')
  await expect(menu).not.toContainText('Delete')

  // Clicking "Convert to Template" turns the two selected nodes into a fresh template instance.
  const before = await page.evaluate((key) => (window as unknown as Record<string, Ed>)[key]!.definitions.size, E)
  await menu.getByText('Convert to Template').click()
  const after = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    return { defs: e.definitions.size, instances: [...e.graph.nodes()].filter((n) => n.type === '$templateInstance').length }
  }, E)
  expect(after.defs).toBe(before + 1)
  expect(after.instances).toBeGreaterThanOrEqual(2) // the pre-shipped Backup + the new one
})

test('the demo ships a ready Backup template instance you can dive into', async ({ page }) => {
  await ready(page)
  const info = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const backup = e.graph.getNode('backup')
    const ok = e.diveInto('backup')
    return {
      type: backup?.type,
      hasDef: e.definitions.has('backup_def'),
      title: e.definitions.get('backup_def')?.title,
      dived: ok, depth: e.diveDepth,
      innerTypes: [...e.graph.nodes()].map((n) => n.type).sort(),
    }
  }, E)
  expect(info.type).toBe('$templateInstance')
  expect(info.hasDef).toBe(true)
  expect(info.title).toBe('Backup')
  expect(info.dived).toBe(true)
  expect(info.depth).toBe(1)
  expect(info.innerTypes).toContain('$templateInput')
  expect(info.innerTypes).toContain('$templateOutput')
})
