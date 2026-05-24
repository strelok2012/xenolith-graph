import { test, expect } from '@playwright/test'

function stats(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const ed = (window as unknown as {
      __xenoEditor: { graph: { nodeCount: number; edgeCount: number } }
    }).__xenoEditor
    return { nodes: ed.graph.nodeCount, edges: ed.graph.edgeCount }
  })
}

test.describe('comfy demo', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.waitForFunction(() => '__xenoEditor' in window)
  })

  test('boots and imports the medium workflow (110 nodes)', async ({ page }) => {
    await page.waitForFunction(() => {
      const ed = (window as unknown as { __xenoEditor?: { graph: { nodeCount: number } } }).__xenoEditor
      return (ed?.graph.nodeCount ?? 0) > 100
    }, undefined, { timeout: 15_000 })
    const s = await stats(page)
    expect(s.nodes).toBe(110)
    expect(s.edges).toBeGreaterThan(90)
  })

  test('switching to XXL re-imports a larger graph', async ({ page }) => {
    await page.getByRole('button', { name: 'XXL · 298' }).click()
    await page.waitForFunction(() => {
      const ed = (window as unknown as { __xenoEditor?: { graph: { nodeCount: number } } }).__xenoEditor
      return ed?.graph.nodeCount === 298
    }, undefined, { timeout: 15_000 })
    expect((await stats(page)).edges).toBeGreaterThan(400)
  })

  test('the palette is populated from the imported workflow schemas', async ({ page }) => {
    await page.keyboard.press('Tab')
    await expect(page.locator('[data-xeno-palette]')).toBeVisible()
    await page.locator('[data-xeno-palette-input]').fill('Searge')
    await expect(page.locator('[data-xeno-palette-row]').first()).toContainText('Searge')
  })
})
