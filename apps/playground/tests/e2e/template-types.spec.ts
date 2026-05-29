import { test, expect } from '@playwright/test'

// Boundary type inference (variant 1 — definition owns the type, inner-driven). A manually-added
// $templateInput starts as `any`; wiring it to a typed member pin makes the boundary adopt that type
// live, and the instance pin picks it up on dive-out. The outer side is only validated, never sets it.

type Ed = {
  insertNode: (type: string, world: { x: number; y: number }) => { id: string } | null
  diveInto: (id: string) => boolean
  diveOut: (toDepth?: number) => void
  connect: (fromNode: unknown, fromPin: number, toNode: unknown, toPin: number) => unknown
  graph: {
    getNode: (id: string) => { id: string; type: string; pins: { id: string; direction: string; type: string }[]; state: Record<string, unknown> } | undefined
  }
}
const E = '__xenoEditor'

test('a manually-added Input adopts the type of the member pin it is wired to', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
  const setup = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const beforeObj = e.graph.getNode('backup')!.pins.filter((p) => p.direction === 'in' && p.type === 'object').length // Payload → 1
    e.diveInto('backup')
    const op = e.insertNode('Transform', { x: 240, y: 520 })! // has an `object` input
    const inp = e.insertNode('$templateInput', { x: -60, y: 520 })! // fresh wildcard out pin
    const boundaryBefore = e.graph.getNode(inp.id)!.pins[0]!.type // 'any'
    e.connect(e.graph.getNode(inp.id)!, 0, e.graph.getNode(op.id)!, 0) // $templateInput.out → Transform.in
    return { beforeObj, boundaryBefore, inpId: inp.id }
  }, E)
  expect(setup.boundaryBefore).toBe('any')

  // The per-edit type sync is a microtask — let it run, then the boundary should be coloured object.
  await page.waitForTimeout(60)
  const r = await page.evaluate(([key, inpId]) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    const boundaryAfter = e.graph.getNode(inpId)!.pins[0]!.type
    e.diveOut()
    return { boundaryAfter, afterObj: e.graph.getNode('backup')!.pins.filter((p) => p.direction === 'in' && p.type === 'object').length }
  }, [E, setup.inpId] as const)
  expect(r.boundaryAfter).toBe('object')          // boundary adopted the member's type, live
  expect(r.afterObj).toBe(setup.beforeObj + 1)    // the new instance input is typed object (not any)
})
