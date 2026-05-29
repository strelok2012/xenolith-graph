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

  test('Ctrl/Cmd+A selects every top-level node (not hidden macro members)', async ({ page }) => {
    const before = await counts(page)
    expect(before.selected).toBe(0)
    await page.keyboard.press('ControlOrMeta+a')
    const r = await page.evaluate(() => {
      const e = (window as unknown as Record<string, any>).__xenoEditor
      const hidden = new Set<string>()
      for (const n of e.graph.nodes()) {
        if (n.type === 'Macro' && n.state.collapsed) for (const m of (n.state.members ?? [])) hidden.add(String(m))
      }
      return {
        selected: e.selection.size,
        topLevel: [...e.graph.nodes()].filter((n: any) => !hidden.has(String(n.id))).length,
        selectedHidden: e.selection.ids().filter((id: any) => hidden.has(String(id))).length,
        hiddenCount: hidden.size,
      }
    })
    expect(r.hiddenCount).toBeGreaterThan(0)      // demo has collapsed macros with members
    expect(r.selected).toBe(r.topLevel)           // selects all top-level nodes
    expect(r.selected).toBeLessThan(before.nodes) // …but not the hidden members
    expect(r.selectedHidden).toBe(0)
  })
})
