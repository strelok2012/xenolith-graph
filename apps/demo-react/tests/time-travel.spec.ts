import { test, expect, type Page } from '@playwright/test'

interface TTHandle {
  historyLength: number
  statuses: Record<string, string>
}

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '10 · Time-travel' }).click()
  await page.waitForFunction(() => (window as unknown as { __xenoTimeTravel?: unknown }).__xenoTimeTravel !== undefined)
  // Auto-run completes during onReady; wait until history is populated.
  await page.waitForFunction(() => {
    type W = { __xenoTimeTravel?: { debugger: { history: ReadonlyArray<unknown> } } }
    return ((window as unknown as W).__xenoTimeTravel?.debugger.history.length ?? 0) > 0
  })
}

async function snap(page: Page): Promise<TTHandle> {
  return await page.evaluate(() => {
    type W = { __xenoTimeTravel: { debugger: { history: ReadonlyArray<unknown> }; nodeStatuses: Record<string, string> } }
    const tt = (window as unknown as W).__xenoTimeTravel
    return { historyLength: tt.debugger.history.length, statuses: { ...tt.nodeStatuses } }
  })
}

async function setScrub(page: Page, value: number): Promise<void> {
  await page.evaluate((v) => {
    const slider = document.querySelector('[data-testid="scrub"]') as HTMLInputElement | null
    if (!slider) throw new Error('scrub slider not found')
    const proto = Object.getPrototypeOf(slider) as { constructor: { prototype: { value: PropertyDescriptor } } } & object
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    nativeSetter.call(slider, String(v))
    slider.dispatchEvent(new Event('input', { bubbles: true }))
    slider.dispatchEvent(new Event('change', { bubbles: true }))
    void proto
  }, value)
  await page.waitForTimeout(100)
}

test('auto-run populates history with 6 steps', async ({ page }) => {
  await ready(page)
  const s = await snap(page)
  // Pipeline: Const(2), Const(3), Const(4), Add, Multiply, Display = 6 steps.
  expect(s.historyLength).toBe(6)
  // Initial scrub value is at the END (full graph done) — every visited node is 'ok' or 'running'.
  const okOrRunning = Object.values(s.statuses).filter((v) => v === 'ok' || v === 'running').length
  expect(okOrRunning).toBe(6)
})

test('scrubbing to step 3 highlights 3 nodes; step 3 is the running one', async ({ page }) => {
  await ready(page)
  await setScrub(page, 3)
  const s = await snap(page)
  const okCount = Object.values(s.statuses).filter((v) => v === 'ok').length
  const runningCount = Object.values(s.statuses).filter((v) => v === 'running').length
  expect(okCount + runningCount).toBe(3)
  // Exactly ONE node should be 'running' (the inspected step).
  expect(runningCount).toBe(1)
})

test('scrubbing back to 0 clears every status (no leftover ring)', async ({ page }) => {
  await ready(page)
  await setScrub(page, 0)
  const s = await snap(page)
  // No node should be ok/running anymore.
  for (const v of Object.values(s.statuses)) expect(['ok', 'running']).not.toContain(v)
})

test('Reset button returns scrub to 0', async ({ page }) => {
  await ready(page)
  await setScrub(page, 4)
  await page.getByRole('button', { name: /Reset/ }).click()
  await page.waitForTimeout(100)
  const s = await snap(page)
  const totalActive = Object.values(s.statuses).filter((v) => v === 'ok' || v === 'running').length
  expect(totalActive).toBe(0)
})

test('Play auto-advances; pause stops the advance (second snapshot equals first after pause)', async ({ page }) => {
  await ready(page)
  await setScrub(page, 0)
  await page.getByRole('button', { name: /Play/ }).click()
  await page.waitForTimeout(1400)
  // Click pause IMMEDIATELY, then sample TWICE with a gap. Two samples being equal is the
  // pause invariant — comparing pre-vs-post-pause is racy because the autoplay tick may
  // squeeze in between the snap() and the pause click.
  await page.getByRole('button', { name: /Pause/ }).click()
  await page.waitForTimeout(150)
  const a = await snap(page)
  await page.waitForTimeout(1200) // > 2 autoplay ticks if still playing
  const b = await snap(page)
  const countA = Object.values(a.statuses).filter((v) => v === 'ok' || v === 'running').length
  const countB = Object.values(b.statuses).filter((v) => v === 'ok' || v === 'running').length
  expect(countA).toBeGreaterThan(0)
  expect(countB).toBe(countA)
})
