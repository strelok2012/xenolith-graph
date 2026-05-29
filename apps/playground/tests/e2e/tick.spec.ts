import { test, expect } from '@playwright/test'

// Tick/scheduler hook (P2.7): editor.onTick(cb) fires once per step() and every frame between
// startLoop()/stopLoop(). A host evaluator drives its logic off this clock; the editor isn't a runtime.

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('step() fires subscribers once with the given delta', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const deltas: number[] = []
    const off = e.onTick((dt: number) => deltas.push(dt))
    e.step(16)
    e.step()        // default 1000/60
    off()
    e.step(99)      // unsubscribed → ignored
    return deltas
  }, E)
  expect(r.length).toBe(2)
  expect(r[0]).toBe(16)
  expect(r[1]).toBeCloseTo(1000 / 60, 5)
})

test('startLoop ticks every frame; stopLoop halts it', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate(async (key) => {
    const e = (window as unknown as Record<string, any>)[key]
    let count = 0
    let lastDt = 0
    e.onTick((dt: number) => { count++; lastDt = dt })
    e.startLoop()
    await new Promise((res) => setTimeout(res, 150))
    const whileLooping = count
    e.stopLoop()
    await new Promise((res) => setTimeout(res, 150))
    const afterStop = count
    return { whileLooping, gainedAfterStop: afterStop - whileLooping, looping: e.looping, lastDt }
  }, E)
  expect(r.whileLooping).toBeGreaterThan(1) // multiple frames ticked in ~150ms
  expect(r.gainedAfterStop).toBe(0)         // stopLoop froze the loop
  expect(r.looping).toBe(false)
  expect(r.lastDt).toBeGreaterThan(0)       // real frame delta
})
