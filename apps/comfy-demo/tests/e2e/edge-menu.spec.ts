import { test, expect, type Page } from '@playwright/test'

// src --(object)--> dst, laid out so the edge midpoint sits near screen (500, 351).
const GRAPH = {
  version: 'xenolith.v1',
  nodes: [
    { id: 'src', type: 'Src', position: { x: 0, y: 0 },
      pins: [{ id: 'src:o', kind: 'data', direction: 'out', type: 'object', multiple: true }] },
    { id: 'dst', type: 'Dst', position: { x: 300, y: 0 },
      pins: [{ id: 'dst:i', kind: 'data', direction: 'in', type: 'object', multiple: false }] },
  ],
  edges: [{ id: 'e1', from: { node: 'src', pin: 'src:o' }, to: { node: 'dst', pin: 'dst:i' } }],
  viewport: { x: 275, y: 310, zoom: 1 },
}

async function load(page: Page) {
  await page.evaluate((g) => (window as unknown as { __xenoEditor: { loadJSON(x: unknown): void } }).__xenoEditor.loadJSON(g), GRAPH)
}
function counts(page: Page) {
  return page.evaluate(() => {
    const ed = (window as unknown as { __xenoEditor: { graph: { nodeCount: number; edgeCount: number; nodes(): IterableIterator<{ type: string }> } } }).__xenoEditor
    let reroutes = 0
    for (const n of ed.graph.nodes()) if (n.type === '$reroute') reroutes++
    return { nodes: ed.graph.nodeCount, edges: ed.graph.edgeCount, reroutes }
  })
}

test.describe('edge context menu', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.waitForFunction(() => '__xenoEditor' in window)
    await load(page)
  })

  test('right-clicking an edge opens the Add Reroute / Add Node menu', async ({ page }) => {
    await page.mouse.click(500, 351, { button: 'right' })
    const menu = page.locator('[data-xeno-edge-menu]')
    await expect(menu).toBeVisible()
    await expect(menu).toContainText('Add Reroute')
    await expect(menu).toContainText('Add Node')
  })

  test('Add Reroute splits the edge with an inline dot reroute', async ({ page }) => {
    await page.mouse.click(500, 351, { button: 'right' })
    await page.locator('[data-xeno-edge-menu]').getByText('Add Reroute').click()
    const c = await counts(page)
    expect(c.reroutes).toBe(1)
    expect(c.nodes).toBe(3)   // src, dst, reroute
    expect(c.edges).toBe(2)   // src→reroute, reroute→dst
  })

  test('Add Node opens the palette filtered to spliceable nodes (Reroute node is built in)', async ({ page }) => {
    await page.mouse.click(500, 351, { button: 'right' })
    await page.locator('[data-xeno-edge-menu]').getByText('Add Node').click()
    await expect(page.locator('[data-xeno-palette]')).toBeVisible()
    await page.locator('[data-xeno-palette-input]').fill('reroute')
    await expect(page.locator('[data-xeno-palette-row]').first()).toContainText('Reroute')
  })

  test('Delete removes only the clicked edge between two real nodes', async ({ page }) => {
    await page.mouse.click(500, 351, { button: 'right' })
    await page.locator('[data-xeno-edge-menu]').getByText('Delete').click()
    const c = await counts(page)
    expect(c.nodes).toBe(2)  // src and dst untouched
    expect(c.edges).toBe(0)  // only the edge removed
  })

  test('right-click off the midpoint dot does NOT open the menu', async ({ page }) => {
    // far from the midpoint (which is ~ screen 500,351) but still over the canvas
    await page.mouse.click(150, 600, { button: 'right' })
    await expect(page.locator('[data-xeno-edge-menu]')).toHaveCount(0)
  })

  test('deleting one feed edge of a reroute removes the dangling reroute (no standalone dots)', async ({ page }) => {
    // splice a reroute into the wire → src → R → dst, then delete the upstream edge.
    await page.mouse.click(500, 351, { button: 'right' })
    await page.locator('[data-xeno-edge-menu]').getByText('Add Reroute').click()
    await expect.poll(async () => (await counts(page)).reroutes).toBe(1)
    // screen position of the upstream (src→R) edge midpoint dot.
    const up = await page.evaluate(() => {
      const ed = (window as unknown as { __xenoEditor: any }).__xenoEditor
      const json = ed.toJSON()
      const vp = json.viewport ?? { x: 0, y: 0, zoom: 1 }
      const src = json.nodes.find((n: any) => n.id === 'src')
      const r = json.nodes.find((n: any) => n.type === '$reroute')
      const ax = src.position.x + (src.size?.x ?? 150)
      const ay = src.position.y + 41.5
      const bx = r.position.x
      const by = r.position.y + (r.size?.y ?? 22) / 2
      const mid = { x: (ax + bx) / 2, y: (ay + by) / 2 }
      return { x: mid.x * vp.zoom + vp.x, y: mid.y * vp.zoom + vp.y }
    })
    await page.mouse.click(Math.round(up.x), Math.round(up.y), { button: 'right' })
    const menu = page.locator('[data-xeno-edge-menu]')
    await expect(menu).toBeVisible()
    await menu.getByText('Delete').click()
    const c = await counts(page)
    expect(c.reroutes).toBe(0) // R lost its input → dangling → removed
    expect(c.edges).toBe(0)    // its remaining edge goes with it
  })

  test('Add Node inserts the node centred on the edge midpoint, not by its corner', async ({ page }) => {
    await page.mouse.click(500, 351, { button: 'right' })
    await page.locator('[data-xeno-edge-menu]').getByText('Add Node').click()
    await page.locator('[data-xeno-palette-input]').fill('reroute')
    await expect(page.locator('[data-xeno-palette-row]').first()).toContainText('Reroute')
    await page.locator('[data-xeno-palette-input]').press('Enter')
    await expect.poll(async () => (await counts(page)).nodes).toBe(3)
    // the new node's centre should sit at the old edge midpoint world ≈ (225, 41.5)
    const off = await page.evaluate(() => {
      const ed = (window as unknown as { __xenoEditor: any }).__xenoEditor
      const n = [...ed.graph.nodes()].find((x: any) => x.type === 'Reroute')
      const cx = n.position.x + (n.size?.x ?? 0) / 2
      const cy = n.position.y + (n.size?.y ?? 0) / 2
      return { cx, cy }
    })
    expect(off.cx).toBeGreaterThan(215)
    expect(off.cx).toBeLessThan(235)
    expect(off.cy).toBeGreaterThan(31)
    expect(off.cy).toBeLessThan(52)
  })
})
