import { test, expect } from '@playwright/test'

// General header-glyph API (plugin-facing): editor.icons registry (built-in Feather + custom),
// NodeSchema.glyph auto-applied on insert, editor.setNodeGlyph runtime override, left/right side,
// and plugin access via ctx.icons.

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('schema.glyph auto-applies on insert; setNodeGlyph overrides + clears', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.icons.register('rocket', '<path d="M12 2 20 20 12 16 4 20Z"/>')
    e.registry.register({ type: 'Rocketeer', title: 'Rocketeer', glyph: { icon: 'rocket', side: 'right' }, pins: [{ kind: 'data', direction: 'out', type: 'float' }] })
    const inserted = e.insertNode('Rocketeer', { x: 0, y: 0 })
    const onInsert = e.graph.getNode(inserted.id).glyph

    const plain = [...e.graph.nodes()].find((n: any) => !n.glyph && n.type !== '$templateInstance' && n.type !== 'Macro')
    e.setNodeGlyph(plain.id, { icon: 'cpu', side: 'left' })
    const afterSet = e.graph.getNode(plain.id).glyph
    e.setNodeGlyph(plain.id, null)
    const afterClear = e.graph.getNode(plain.id).glyph

    return {
      onInsert, afterSet, afterClear,
      builtins: ['layers', 'box', 'cpu', 'database', 'branch'].every((n) => e.icons.has(n)),
      hasRocket: e.icons.has('rocket'),
    }
  }, E)
  expect(r.onInsert).toEqual({ icon: 'rocket', side: 'right' })
  expect(r.afterSet).toEqual({ icon: 'cpu', side: 'left' })
  expect(r.afterClear).toBeUndefined()
  expect(r.builtins).toBe(true)
  expect(r.hasRocket).toBe(true)
  expect(errors).toEqual([])
})

test('a plugin registers an icon via ctx.icons', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    let hasIcons = false
    e.use({
      name: 'iconz',
      install(ctx: any) {
        hasIcons = typeof ctx.icons?.register === 'function'
        ctx.icons.register('star', '<path d="M12 2 15 9 22 9 16 14 18 22 12 17 6 22 8 14 2 9 9 9Z"/>')
      },
    })
    return { hasIcons, registered: e.icons.has('star') }
  }, E)
  expect(r.hasIcons).toBe(true)
  expect(r.registered).toBe(true)
})

test('a right-side glyph renders without errors (screenshot)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await ready(page)
  await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    // put a right-side cpu glyph on the demo Backup instance, frame it large
    e.setNodeGlyph('backup', { icon: 'cpu', side: 'right' })
    const n = e.graph.getNode('backup')
    const z = 4.5
    e.setViewport({ x: 120 - n.position.x * z, y: 120 - n.position.y * z, zoom: z })
  }, E)
  await page.waitForTimeout(250)
  await page.locator('canvas').screenshot({ path: 'test-results/node-glyph-right.png' })
  expect(errors).toEqual([])
})
