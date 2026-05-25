import { test, expect } from '@playwright/test'

test('a partially-overlapped DOM widget is clipped (not blacked out)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '7 · Bring your own UI' }).click()
  await page.waitForTimeout(1200)
  await expect(page.locator('.cm-editor')).toBeVisible() // Prompt's CodeMirror

  const c = (await page.locator('canvas').boundingBox())!
  const p = await page.evaluate(() => {
    const ed = (window as any).__xenoEditor, vp = ed.viewport
    const find = (r: string) => { for (const n of ed.graph.nodes()) if ((n.widgets ?? []).some((w: any) => w.renderer === r)) return n; return null }
    const sig = find('sparkline'), prom = find('code')
    return {
      sig: { x: vp.x + (sig.position.x + 60) * vp.zoom, y: vp.y + (sig.position.y + 12) * vp.zoom },
      target: { x: vp.x + (prom.position.x + 120) * vp.zoom, y: vp.y + (prom.position.y + 120) * vp.zoom },
    }
  })
  // Drag Signal so it partially overlaps the lower part of Prompt.
  await page.mouse.move(c.x + p.sig.x, c.y + p.sig.y)
  await page.mouse.down()
  await page.mouse.move(c.x + p.target.x, c.y + p.target.y, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)

  // Prompt's CodeMirror stays visible but its host is clipped where Signal covers it (no black gap).
  await expect(page.locator('.cm-editor')).toBeVisible()
  const clip = await page.evaluate(() => {
    const host = document.querySelector('.w-code')?.parentElement as HTMLElement | null
    return host ? getComputedStyle(host).clipPath : 'none'
  })
  expect(clip).toContain('path(') // a hole is punched where the front node covers it
})
