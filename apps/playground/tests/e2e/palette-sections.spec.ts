import { test, expect } from '@playwright/test'

// Palette sections (P2.8): browsing (empty query) groups nodes under category section headers so a
// large primitive set is navigable; typing a query falls back to a flat, fuzzy-ranked list.

const PALETTE = '[data-xeno-palette]'
const INPUT = '[data-xeno-palette-input]'
const SECTION = '[data-xeno-palette-section]'
const ROW = '[data-xeno-palette-row]'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
})

test('browse mode (empty query) groups results into category sections', async ({ page }) => {
  await page.keyboard.press('Tab')
  await expect(page.locator(PALETTE)).toBeVisible()
  const sections = page.locator(SECTION)
  await expect(sections.first()).toBeVisible()
  expect(await sections.count()).toBeGreaterThan(1) // several categories in the demo registry
  expect(await page.locator(ROW).count()).toBeGreaterThan(1)
})

test('a search query shows a flat list with no section headers', async ({ page }) => {
  await page.keyboard.press('Tab')
  await page.locator(INPUT).fill('transform')
  await expect(page.locator(SECTION)).toHaveCount(0)
  await expect(page.locator(ROW)).toHaveCount(1)
})

test('clearing the query returns to grouped sections', async ({ page }) => {
  await page.keyboard.press('Tab')
  await page.locator(INPUT).fill('transform')
  await expect(page.locator(SECTION)).toHaveCount(0)
  await page.locator(INPUT).fill('')
  await expect(page.locator(SECTION).first()).toBeVisible()
})
