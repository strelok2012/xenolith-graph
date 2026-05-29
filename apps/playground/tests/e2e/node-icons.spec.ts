import { test, expect } from '@playwright/test'

// Header kind glyphs (template/group). Verifies the SVG icon path doesn't throw and screenshots the
// demo (which has a Backup template instance + Gather/Pack macros) for a visual check.

const E = '__xenoEditor'

test('template + group nodes render a header glyph without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  // Frame the Backup instance header large so the glyph alignment is clearly visible.
  await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const n = e.graph.getNode('backup')
    const z = 4.5
    if (n) e.setViewport({ x: 120 - n.position.x * z, y: 120 - n.position.y * z, zoom: z })
  }, E)
  await page.waitForTimeout(250)

  await page.locator('canvas').screenshot({ path: 'test-results/node-icons.png' })

  // Frame the Gather macro to check the "group" (box) glyph.
  await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const n = e.graph.getNode('gather')
    if (n) e.setViewport({ x: 220 - n.position.x, y: 160 - n.position.y, zoom: 1 })
  }, E)
  await page.waitForTimeout(200)
  await page.locator('canvas').screenshot({ path: 'test-results/node-icons-macro.png' })

  // Switch to Liquid Glass and re-frame Backup — the glyph must appear + centre there too.
  await page.getByRole('button', { name: 'Liquid Glass' }).click()
  await page.waitForTimeout(400)
  await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const n = e.graph.getNode('backup')
    const z = 2.5
    if (n) e.setViewport({ x: 280 - n.position.x * z, y: 140 - n.position.y * z, zoom: z })
  }, E)
  await page.waitForTimeout(400)
  await page.locator('canvas').screenshot({ path: 'test-results/node-icons-lg.png' })

  expect(errors).toEqual([])
})

test('the kind glyph also shows on the collapsed pill (both themes)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  // Frame Backup large, then click its header chevron (computed from tokens) to collapse it.
  const chevron = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const n = e.graph.getNode('backup')
    const z = 4.5
    e.setViewport({ x: 120 - n.position.x * z, y: 120 - n.position.y * z, zoom: z })
    const g = e.tokens.geometry
    const local = { x: n.position.x + g.node.headerPadding + 8 + g.header.chevronSize / 2 - 4, y: n.position.y + g.node.headerPadding + g.node.headerHeight / 2 - 0.5 }
    return e.worldToScreen(local)
  }, E)
  await page.waitForTimeout(150)
  await page.mouse.click(chevron.x, chevron.y)
  await page.waitForTimeout(400) // collapse animation
  await page.locator('canvas').screenshot({ path: 'test-results/node-icons-collapsed.png' })

  // Switch to Liquid Glass — collapsed state is preserved across setTheme.
  await page.getByRole('button', { name: 'Liquid Glass' }).click()
  await page.waitForTimeout(400)
  await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const n = e.graph.getNode('backup')
    const z = 4.5
    e.setViewport({ x: 120 - n.position.x * z, y: 120 - n.position.y * z, zoom: z })
  }, E)
  await page.waitForTimeout(400)
  await page.locator('canvas').screenshot({ path: 'test-results/node-icons-collapsed-lg.png' })

  expect(errors).toEqual([])
})
