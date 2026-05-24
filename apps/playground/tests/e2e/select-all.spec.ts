import { test, expect } from '@playwright/test'

function counts(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const ed = (window as unknown as {
      __xenoEditor: { graph: { nodeCount: number }; selection: { size: number } }
    }).__xenoEditor
    return { nodes: ed.graph.nodeCount, selected: ed.selection.size }
  })
}

test.describe('select all', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.waitForFunction(() => '__xenoEditor' in window)
  })

  test('Ctrl/Cmd+A selects every node', async ({ page }) => {
    const before = await counts(page)
    expect(before.selected).toBe(0)
    await page.keyboard.press('ControlOrMeta+a')
    const after = await counts(page)
    expect(after.selected).toBe(before.nodes)
  })
})
