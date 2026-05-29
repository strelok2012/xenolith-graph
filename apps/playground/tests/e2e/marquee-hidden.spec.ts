import { test, expect } from '@playwright/test'

// Regression: marquee selection must NOT pick up hidden members of collapsed macros. They're real
// graph nodes with positions but no visible view, so sweeping a rect over a collapsed macro was
// silently selecting its guts — then Group/Convert dragged those in (the bogus A/B/Out pins bug).

const E = '__xenoEditor'

test('marquee does not select hidden members of collapsed macros', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  const info = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.fitView({ padding: 80, maxZoom: 1 })
    const hidden: string[] = []
    let maxX = -1e9, maxY = -1e9
    for (const n of e.graph.nodes()) {
      if (n.type === 'Macro' && n.state.collapsed) {
        hidden.push(...((n.state.members as string[]) ?? []))
        const s = e.worldToScreen(n.position)
        maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y)
      }
    }
    return { hidden, endX: maxX + 240, endY: maxY + 280 }
  }, E)
  expect(info.hidden.length).toBeGreaterThan(0) // demo has collapsed Gather/Pack macros with members

  const box = (await page.locator('canvas').boundingBox())!
  // Marquee from an empty top-left margin (fitView leaves 80px padding) across the macro region.
  await page.mouse.move(box.x + 6, box.y + 6)
  await page.mouse.down()
  await page.mouse.move(box.x + Math.min(info.endX, box.width * 0.7), box.y + Math.min(info.endY, box.height - 8), { steps: 10 })
  await page.mouse.up()

  const sel: string[] = await page.evaluate((key) => (window as unknown as Record<string, any>)[key].selection.ids(), E)
  expect(sel.length).toBeGreaterThan(0) // the marquee did sweep nodes
  const hiddenSet = new Set(info.hidden)
  expect(sel.filter((id) => hiddenSet.has(id))).toEqual([]) // but none are hidden macro members
})
