import { test, expect } from '@playwright/test'

// Diagnostic: convert EXACTLY {Transform, Validate, Enrich} from the demo into a Template and inspect
// the resulting instance interface + the definition's inner nodes. These three are plain nodes; the
// only boundary crossings should be: in ← gather(macro)→transform; out → validate→resolve and
// enrich→{score,resolve}. So the instance should have 1 input + 2 outputs, and the definition should
// contain ONLY the three members + their boundary nodes — no Merge/Sub from the Gather/Pack macros.

type Ed = {
  selection: { replaceWith: (ids: string[]) => void }
  createTemplateFromSelection: (ids: string[], title?: string) => string | null
  definitions: ReadonlyMap<string, { title: string; nodes: { id: string; type: string }[]; edges: { id: string }[] }>
  graph: { getNode: (id: string) => { type: string; pins: { direction: string; label?: string }[]; state: Record<string, unknown> } | undefined }
}
const E = '__xenoEditor'

test('convert {Transform, Validate, Enrich} → clean 1-in/2-out template, members only', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>)['__xenoEditor'] !== undefined)

  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    e.selection.replaceWith(['transform', 'validate', 'enrich'])
    const id = e.createTemplateFromSelection(['transform', 'validate', 'enrich'], 'TVE')!
    const inst = e.graph.getNode(id)!
    const defId = inst.state['definitionId'] as string
    const def = e.definitions.get(defId)!
    return {
      inPins: inst.pins.filter((p) => p.direction === 'in').length,
      outPins: inst.pins.filter((p) => p.direction === 'out').length,
      inLabels: inst.pins.filter((p) => p.direction === 'in').map((p) => p.label),
      outLabels: inst.pins.filter((p) => p.direction === 'out').map((p) => p.label),
      memberTypes: def.nodes.filter((n) => n.type !== '$templateInput' && n.type !== '$templateOutput').map((n) => n.type).sort(),
      inputBoundaries: def.nodes.filter((n) => n.type === '$templateInput').length,
      outputBoundaries: def.nodes.filter((n) => n.type === '$templateOutput').length,
      allTypes: def.nodes.map((n) => n.type).sort(),
    }
  }, E)

  console.log('TEMPLATE CONVERT RESULT:', JSON.stringify(r, null, 2))

  // The definition must contain ONLY the three selected members (+ boundary nodes). No Merge/Sub/Step
  // from the Gather/Pack macros may leak in.
  expect(r.memberTypes).toEqual(['Enrich', 'Transform', 'Validate'])
  expect(r.inputBoundaries).toBe(1)   // only gather→transform crosses in
  expect(r.outputBoundaries).toBe(2)  // validate.out and enrich.out cross out
  expect(r.inPins).toBe(1)
  expect(r.outPins).toBe(2)
})

test('converting two nodes wired only to each other exposes their FREE pins as the interface', async ({ page }) => {
  // The Archive→Audit case: select two nodes connected to each other; the unconnected pins (Archive.In,
  // Audit.Out) must auto-become the template's In/Out so the instance is usable.
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>)['__xenoEditor'] !== undefined)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    // A clean two-node graph: A.out → B.in; A.in and B.out are free.
    e.loadJSON({
      version: 'xenolith.v1',
      nodes: ['A', 'B'].map((id, i) => ({
        id, type: 'Box', position: { x: i * 220, y: 0 },
        pins: [
          { id: `${id}:in`, kind: 'data', direction: 'in', type: 'float', multiple: false },
          { id: `${id}:out`, kind: 'data', direction: 'out', type: 'float', multiple: true },
        ],
      })),
      edges: [{ id: 'ab', from: { node: 'A', pin: 'A:out' }, to: { node: 'B', pin: 'B:in' } }],
    })
    const id = e.createTemplateFromSelection(['A', 'B'], 'Pair')!
    const inst = e.graph.getNode(id)!
    const defId = inst.state['definitionId'] as string
    const d = e.definitions.get(defId)!
    return {
      ins: inst.pins.filter((p) => p.direction === 'in').length,
      outs: inst.pins.filter((p) => p.direction === 'out').length,
      tplIns: d.nodes.filter((n) => n.type === '$templateInput').length,
      tplOuts: d.nodes.filter((n) => n.type === '$templateOutput').length,
    }
  }, E)
  expect(r).toMatchObject({ ins: 1, outs: 1, tplIns: 1, tplOuts: 1 })
})

test('convert ignores macro nodes + macro members in the selection (no Merge/Sub leak)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => (window as unknown as Record<string, unknown>)['__xenoEditor'] !== undefined)

  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, Ed>)[key]!
    // Deliberately overlap the Gather macro: its node ('gather'), a merge member ('gather_m1') and a
    // sub-macro member ('gather_sub') alongside the three plain nodes.
    e.selection.replaceWith(['transform', 'validate', 'enrich', 'gather', 'gather_m1', 'gather_sub'])
    const id = e.createTemplateFromSelection(['transform', 'validate', 'enrich', 'gather', 'gather_m1', 'gather_sub'], 'TVE')!
    const def = e.definitions.get(e.graph.getNode(id)!.state['definitionId'] as string)!
    return {
      memberTypes: def.nodes.filter((n) => n.type !== '$templateInput' && n.type !== '$templateOutput').map((n) => n.type).sort(),
      gatherStillExists: e.graph.getNode('gather') !== undefined,
      gatherM1StillExists: e.graph.getNode('gather_m1') !== undefined,
    }
  }, E)

  expect(r.memberTypes).toEqual(['Enrich', 'Transform', 'Validate']) // macro guts filtered out
  expect(r.gatherStillExists).toBe(true)   // the macro is left intact, not pulled into the template
  expect(r.gatherM1StillExists).toBe(true) // its member stays put
})
