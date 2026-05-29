import { test, expect } from '@playwright/test'

const PALETTE  = '[data-xeno-palette]'
const INPUT    = '[data-xeno-palette-input]'
const ROW      = '[data-xeno-palette-row]'

async function nodeCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const ed = (window as unknown as { __xenoEditor: { graph: { nodeCount: number } } }).__xenoEditor
    return ed.graph.nodeCount
  })
}

test.describe('insert palette', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.waitForFunction(() => '__xenoEditor' in window)
  })

  test('Tab opens the palette and Escape closes it', async ({ page }) => {
    await expect(page.locator(PALETTE)).toBeHidden()
    await page.keyboard.press('Tab')
    await expect(page.locator(PALETTE)).toBeVisible()
    await expect(page.locator(INPUT)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator(PALETTE)).toBeHidden()
  })

  test('typing filters results by fuzzy match', async ({ page }) => {
    await page.keyboard.press('Tab')
    await page.locator(INPUT).fill('transform')
    const rows = page.locator(ROW)
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('Transform')
  })

  test('rows show a description line', async ({ page }) => {
    await page.keyboard.press('Tab')
    await page.locator(INPUT).fill('transform')
    await expect(page.locator(ROW).first()).toContainText('Maps an object')
  })

  test('clicking outside closes the palette', async ({ page }) => {
    await page.keyboard.press('Tab')
    await expect(page.locator(PALETTE)).toBeVisible()
    await page.mouse.click(5, 5)
    await expect(page.locator(PALETTE)).toBeHidden()
  })

  test('Enter inserts the highlighted node and closes the palette', async ({ page }) => {
    const before = await nodeCount(page)
    await page.keyboard.press('Tab')
    await page.locator(INPUT).fill('transform')
    await page.keyboard.press('Enter')
    await expect(page.locator(PALETTE)).toBeHidden()
    expect(await nodeCount(page)).toBe(before + 1)
  })

  test('double-click on empty canvas opens the palette', async ({ page }) => {
    await expect(page.locator(PALETTE)).toBeHidden()
    // Double-click a corner of the canvas that is empty (top-left, away from the demo graph).
    await page.locator('canvas').dblclick({ position: { x: 30, y: 400 } })
    await expect(page.locator(PALETTE)).toBeVisible()
  })

  test('clicking a row inserts the node and closes the palette', async ({ page }) => {
    const before = await nodeCount(page)
    await page.keyboard.press('Tab')
    await page.locator(INPUT).fill('transform')
    await page.locator(ROW).first().click()
    await expect(page.locator(PALETTE)).toBeHidden()
    expect(await nodeCount(page)).toBe(before + 1)
  })

  test('inserted node is undoable', async ({ page }) => {
    const before = await nodeCount(page)
    await page.keyboard.press('Tab')
    await page.locator(INPUT).fill('source')
    await page.keyboard.press('Enter')
    expect(await nodeCount(page)).toBe(before + 1)
    await page.keyboard.press('ControlOrMeta+z')
    expect(await nodeCount(page)).toBe(before)
  })
})
