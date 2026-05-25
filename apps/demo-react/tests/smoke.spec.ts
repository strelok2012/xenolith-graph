import { test, expect } from '@playwright/test'

test('editor mounts and fits its host (not the window)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.evaluate(async () => { await document.fonts.ready })
  await page.waitForTimeout(600)

  // Canvas must fit the editor-wrap, not overflow to the window.
  const fits = await page.evaluate(() => {
    const cv = document.querySelector('canvas')!.getBoundingClientRect()
    const wrap = document.querySelector('.editor-wrap')!.getBoundingClientRect()
    return Math.abs(cv.width - wrap.width) < 4 && Math.abs(cv.height - wrap.height) < 4
  })
  expect(fits).toBe(true)
})

test('theme switches at runtime via the prop', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '4 · Theming' }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Liquid Glass' }).click()
  await page.waitForTimeout(500)
  await expect(page.getByRole('button', { name: 'Liquid Glass' })).toHaveClass(/on/)
})
