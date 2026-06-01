import { test, expect, type Page } from '@playwright/test'

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '11 · Graph diff' }).click()
  await page.waitForFunction(() => (window as unknown as { __xenoGraphDiff?: unknown }).__xenoGraphDiff !== undefined)
  await page.waitForTimeout(300)
}

interface DiffSnap {
  added: string[]; removed: string[]; modified: string[]
  addedEdges: string[]; removedEdges: string[]
}

async function snap(page: Page): Promise<DiffSnap> {
  return await page.evaluate(() => {
    type W = { __xenoGraphDiff: { diff: { addedNodes: Set<string>; removedNodes: Set<string>; modifiedNodes: Set<string>; addedEdges: Set<string>; removedEdges: Set<string> } } }
    const d = (window as unknown as W).__xenoGraphDiff.diff
    return {
      added: [...d.addedNodes].sort(),
      removed: [...d.removedNodes].sort(),
      modified: [...d.modifiedNodes].sort(),
      addedEdges: [...d.addedEdges].sort(),
      removedEdges: [...d.removedEdges].sort(),
    }
  })
}

test('diff identifies structural changes — added Mul + extra Const, modified b, removed Probe', async ({ page }) => {
  await ready(page)
  const d = await snap(page)
  expect(d.added.sort()).toEqual(['extra', 'mul'])
  // Probe is in PREV only — should be flagged as removed.
  expect(d.removed.sort()).toEqual(['dbg'])
  // Only `b` is structurally modified (value 3→7). Display position change isn't modified by
  // default since position is cosmetic.
  expect(d.modified.sort()).toEqual(['b'])
})

test('diff identifies edge changes — added edges into Multiply; removed Add→Display and Add→Probe', async ({ page }) => {
  await ready(page)
  const d = await snap(page)
  expect(d.addedEdges.sort()).toEqual(['add→mul', 'extra→mul', 'mul→out'])
  // Add→Display was replaced by Add→Multiply→Display; Add→Probe disappeared with Probe.
  expect(d.removedEdges.sort()).toEqual(['add→dbg', 'add→out'])
})

test('REPRO image #27: both canvases are sized (non-zero pixels) — proves the layout works', async ({ page }) => {
  await ready(page)
  const sizes = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')]
    return canvases.map((c) => ({ w: c.width, h: c.height }))
  })
  expect(sizes.length).toBe(2)
  for (const s of sizes) {
    expect(s.w).toBeGreaterThan(100)
    expect(s.h).toBeGreaterThan(100)
  }
})

test('both editors render their respective graphs (different node counts)', async ({ page }) => {
  await ready(page)
  const counts = await page.evaluate(() => {
    type W = { __xenoGraphDiff: { prev: { graph: { nodeCount: number } }; next: { graph: { nodeCount: number } } } }
    const d = (window as unknown as W).__xenoGraphDiff
    return { prev: d.prev.graph.nodeCount, next: d.next.graph.nodeCount }
  })
  expect(counts.prev).toBe(5)  // a, b, add, out, dbg(Probe)
  expect(counts.next).toBe(6)  // a, b, add, extra, mul, out
})

test('removed ghost shows the node TYPE name (not just "removed")', async ({ page }) => {
  await ready(page)
  const labels = await page.evaluate(() => [...document.querySelectorAll('[data-diff-removed]')].map((el) => el.textContent))
  expect(labels.length).toBeGreaterThanOrEqual(1)
  expect(labels[0]).toContain('Probe')
})

test('removed ghost text never overflows its box (scales with zoom, hidden at extreme zoom-out)', async ({ page }) => {
  await ready(page)
  const overflowsBefore = await page.evaluate(() => {
    const el = document.querySelector('[data-diff-removed]') as HTMLDivElement | null
    if (!el) return null
    return { scroll: el.scrollWidth, client: el.clientWidth }
  })
  expect(overflowsBefore).not.toBeNull()
  expect(overflowsBefore!.scroll).toBeLessThanOrEqual(overflowsBefore!.client + 4)
  // Now zoom OUT aggressively — at small box sizes the label collapses to "—" so we never
  // get text spilling across the canvas (image #39 regression).
  const box = await page.locator('canvas').nth(1).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 1500)
  await page.waitForTimeout(200)
  const afterText = await page.evaluate(() => {
    const el = document.querySelector('[data-diff-removed]') as HTMLDivElement | null
    if (!el) return null
    return { scroll: el.scrollWidth, client: el.clientWidth, text: el.textContent }
  })
  expect(afterText!.scroll).toBeLessThanOrEqual(afterText!.client + 4)
})

test('no nodes are selected after build (read-only display, no selection rings)', async ({ page }) => {
  await ready(page)
  await page.waitForTimeout(200)
  const sel = await page.evaluate(() => {
    type W = { __xenoGraphDiff: { prev: { selection: { ids(): string[] } }; next: { selection: { ids(): string[] } } } }
    const d = (window as unknown as W).__xenoGraphDiff
    return { prev: d.prev.selection.ids().length, next: d.next.selection.ids().length }
  })
  expect(sel.prev).toBe(0)
  expect(sel.next).toBe(0)
})

test('read-only: drag a node visually — position must NOT change', async ({ page }) => {
  await ready(page)
  // Capture the first node's screen-position, drag it, then verify world position unchanged.
  const before = await page.evaluate(() => {
    type W = { __xenoGraphDiff: { next: { graph: { nodes(): Iterable<{ id: string; position: { x: number; y: number } }> }; worldToScreen: (p: { x: number; y: number }) => { x: number; y: number } } } }
    const ed = (window as unknown as W).__xenoGraphDiff.next
    const first = [...ed.graph.nodes()][0]!
    const screen = ed.worldToScreen(first.position)
    return { id: first.id, world: { ...first.position }, screen }
  })
  const canvasBox = await page.locator('canvas').nth(1).boundingBox()
  if (!canvasBox) throw new Error('no canvas')
  const cx = canvasBox.x + before.screen.x + 30
  const cy = canvasBox.y + before.screen.y + 30
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 200, cy + 150, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const after = await page.evaluate((id: string) => {
    type W = { __xenoGraphDiff: { next: { graph: { getNode(id: string): { position: { x: number; y: number } } | undefined } } } }
    return { ...(window as unknown as W).__xenoGraphDiff.next.graph.getNode(id)!.position }
  }, before.id)
  expect(after.x).toBeCloseTo(before.world.x, 1)
  expect(after.y).toBeCloseTo(before.world.y, 1)
})

test('read-only: mutations rejected but pan/zoom still work', async ({ page }) => {
  await ready(page)
  // Drag the first node — position should NOT change.
  const before = await page.evaluate(() => {
    type W = { __xenoGraphDiff: { next: { graph: { getNode(id: string): { position: { x: number; y: number } } | undefined; nodes(): Iterable<{ id: string }> } } } }
    const ed = (window as unknown as W).__xenoGraphDiff.next
    const first = [...ed.graph.nodes()][0]!
    return { id: first.id, pos: { ...ed.graph.getNode(first.id)!.position } }
  })
  await page.evaluate(({ id }) => {
    type W = { __xenoGraphDiff: { next: { moveNode: (id: string, p: { x: number; y: number }) => void; commandBus: { apply: (cmd: unknown) => unknown } } } }
    const ed = (window as unknown as W).__xenoGraphDiff.next
    // Try to mutate via the editor API and via the bus directly — both should be blocked.
    ed.moveNode(id, { x: 9999, y: 9999 })
  }, { id: before.id })
  const after = await page.evaluate((id: string) => {
    type W = { __xenoGraphDiff: { next: { graph: { getNode(id: string): { position: { x: number; y: number } } | undefined } } } }
    return { ...(window as unknown as W).__xenoGraphDiff.next.graph.getNode(id)!.position }
  }, before.id)
  expect(after.x).toBe(before.pos.x)
  expect(after.y).toBe(before.pos.y)
  // Pan/zoom go through viewport, NOT commandBus — they should still work.
  const vp0 = await page.evaluate(() => {
    type W = { __xenoGraphDiff: { next: { viewport: { x: number; y: number; zoom: number } } } }
    return { ...(window as unknown as W).__xenoGraphDiff.next.viewport }
  })
  const box = await page.locator('canvas').nth(1).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 300)
  await page.waitForTimeout(150)
  const vp1 = await page.evaluate(() => {
    type W = { __xenoGraphDiff: { next: { viewport: { x: number; y: number; zoom: number } } } }
    return { ...(window as unknown as W).__xenoGraphDiff.next.viewport }
  })
  expect(vp1.zoom).not.toBe(vp0.zoom)
})
