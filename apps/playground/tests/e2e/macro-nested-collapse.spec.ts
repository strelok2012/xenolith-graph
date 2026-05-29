import { test, expect } from '@playwright/test'

// Nested macro click-outside: with Pack expanded AND its nested Sub expanded, clicking in Pack's
// empty body (outside the Sub frame) collapses Sub but leaves Pack open. The demo Pack macro
// ('pack') contains a nested 'pack_sub' macro (Refine/Emit).

const E = '__xenoEditor'

test('clicking the parent group body collapses the nested sub-group', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  // Expand Pack, then the nested Sub. expandMacro flips state synchronously; wait for the frame +
  // member views to materialise (sync microtask + render) before clicking.
  await page.evaluate((key) => (window as unknown as Record<string, any>)[key].expandMacro('pack'), E)
  await page.waitForTimeout(450)
  await page.evaluate((key) => (window as unknown as Record<string, any>)[key].expandMacro('pack_sub'), E)
  await page.waitForTimeout(450)

  const both = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    return { pack: !e.graph.getNode('pack').state.collapsed, sub: !e.graph.getNode('pack_sub').state.collapsed }
  }, E)
  expect(both).toEqual({ pack: true, sub: true }) // both open

  // Frame Pack large + compute a click point in its TOP-LEFT padding band: empty body (left of the
  // inlets, below the header) and well ABOVE the bottom-positioned Sub. Mirrors #macroFrameRect.
  const pt = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const headerH = e.tokens.geometry.comment.headerHeight
    const members: string[] = e.graph.getNode('pack').state.members
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    for (const m of members) {
      const n = e.graph.getNode(m); const s = n.size ?? { x: 150, y: 70 }
      minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + s.x); maxY = Math.max(maxY, n.position.y + s.y)
    }
    const rect = { x: minX - 18, y: minY - 18 - headerH, w: (maxX - minX) + 36, h: (maxY - minY) + 36 + headerH }
    const zoom = Math.min((1280 * 0.7) / rect.w, (720 * 0.7) / rect.h, 1.6)
    e.setViewport({ x: 640 - (rect.x + rect.w / 2) * zoom, y: 360 - (rect.y + rect.h / 2) * zoom, zoom })
    const world = { x: rect.x + 9, y: rect.y + headerH + 20 } // left padding band, just below the header
    return e.worldToScreen(world)
  }, E)
  await page.waitForTimeout(200)

  const box = (await page.locator('canvas').boundingBox())!
  // Click the Pack body; retry to absorb any transient timing (a click on the empty parent body is
  // idempotent once Sub is collapsed, so retrying is safe).
  await expect(async () => {
    await page.mouse.click(box.x + pt.x, box.y + pt.y)
    const subCollapsed = await page.evaluate((key) => (window as unknown as Record<string, any>)[key].graph.getNode('pack_sub').state.collapsed === true, E)
    expect(subCollapsed).toBe(true)
  }).toPass({ timeout: 6000 })

  const packOpen = await page.evaluate((key) => !(window as unknown as Record<string, any>)[key].graph.getNode('pack').state.collapsed, E)
  expect(packOpen).toBe(true) // pack stays open
})
