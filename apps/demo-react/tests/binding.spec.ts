import { test, expect } from '@playwright/test'

test('editing a custom widget value in the form commits to the editor (2-way)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '3 · Two-way binding' }).click()
  await page.waitForTimeout(700)

  // Select a node whose widget is a custom canvas widget (xy-pad → an {x,y} value).
  const found = await page.evaluate(() => {
    const ed = (window as any).__xenoEditor
    for (const n of ed?.graph.nodes() ?? []) {
      const w = (n.widgets ?? []).find((x: any) => x.type === 'custom' && x.renderer === 'xypad')
      if (w) { ed.selection.select(n.id, 'replace'); (window as any).__t = { node: n.id, w: w.id }; return true }
    }
    return false
  })
  expect(found).toBe(true)
  await page.waitForTimeout(200)

  // Type a new value into the JSON field and blur to commit.
  const field = page.locator('.json-edit')
  await field.fill('{"x":0.2,"y":0.8}')
  await field.blur()
  await page.waitForTimeout(200)

  const value = await page.evaluate(() => {
    const t = (window as any).__t
    return (window as any).__xenoEditor.getWidgetValue(t.node, t.w)
  })
  expect(value).toEqual({ x: 0.2, y: 0.8 })
})
