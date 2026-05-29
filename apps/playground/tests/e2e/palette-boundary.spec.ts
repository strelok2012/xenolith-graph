import { test, expect } from '@playwright/test'

// The template interface boundary nodes (Input/Output = $templateInput/$templateOutput) only make
// sense while editing a template definition. They must NOT appear in the root editor's palette, but
// must appear once dived into a template.

const E = '__xenoEditor'
const INPUT = '[data-xeno-palette-input]'
const ROW = '[data-xeno-palette-row]'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('Template Input/Output are hidden in the root palette', async ({ page }) => {
  await ready(page)
  await page.keyboard.press('Tab')
  await page.locator(INPUT).fill('Input')
  await expect(page.locator(ROW).filter({ hasText: 'Template interface input' })).toHaveCount(0)
  await page.locator(INPUT).fill('Output')
  await expect(page.locator(ROW).filter({ hasText: 'Template interface output' })).toHaveCount(0)
})

test('Template Input/Output appear once dived into a template', async ({ page }) => {
  await ready(page)
  await page.evaluate((key) => (window as unknown as Record<string, any>)[key].diveInto('backup'), E)
  await page.keyboard.press('Tab')
  await page.locator(INPUT).fill('Input')
  await expect(page.locator(ROW).filter({ hasText: 'Template interface input' }).first()).toBeVisible()
})
