import { test, expect } from '@playwright/test'

test('hero page mounts the four React-component widgets', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '7 · Bring your own UI' }).click()
  await page.waitForTimeout(1200)
  // React widgets are mounted into the editor's DOM overlay.
  await expect(page.locator('.w-async input')).toBeVisible()
  await expect(page.locator('.cm-editor')).toBeVisible()      // CodeMirror
  await expect(page.locator('.w-spark-svg')).toBeVisible()    // sparkline
})
