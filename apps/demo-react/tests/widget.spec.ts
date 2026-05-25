import { test, expect } from '@playwright/test'

test('widget:changed updates the inspector', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.evaluate(async () => { await document.fonts.ready })
  await page.getByRole('button', { name: '2 · Events → state' }).click()
  await page.waitForTimeout(700)

  // Drive a widget change programmatically through the live editor (slider/number).
  const changed = await page.evaluate(() => {
    const ed = (window as any).__xenoEditor
    if (!ed) return false
    for (const n of ed.graph.nodes()) {
      const w = (n.widgets ?? []).find((x: any) => x.type === 'slider' || x.type === 'number')
      if (w) { ed.setWidgetValue(n.id, w.id, 0.42); return true }
    }
    return false
  })
  expect(changed).toBe(true)
  await page.waitForTimeout(300)
  // The inspector's Widget values section + event log should reflect the change.
  await expect(page.locator('.panel')).toContainText('widget:changed')
})
