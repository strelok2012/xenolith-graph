import { describe, it, expect } from 'vitest'
import { planMacroCollapse, planMacroExpand } from './macro.js'
import type { Edge } from './graph.js'
import type { NodeId, EdgeId, PinId } from './ids.js'

const edge = (id: string, fromN: string, fromP: string, toN: string, toP: string): Edge => ({
  id: id as EdgeId,
  from: { node: fromN as NodeId, pin: fromP as unknown as PinId },
  to:   { node: toN as NodeId,   pin: toP as unknown as PinId },
})

// Deterministic id minters for assertions.
function minters() {
  let p = 0, e = 0
  return { pin: () => `P${p++}` as unknown as PinId, edge: () => `E${e++}` as unknown as EdgeId }
}
const pinInfo = () => ({ type: 'float' })

describe('planMacroCollapse', () => {
  const macroId = 'M' as NodeId
  const members = ['b', 'c'] as NodeId[]
  // a.out → b.in (input boundary); c.out → d.in (output boundary); b.out → c.in (internal)
  const edges = [
    edge('e_ab', 'a', 'a.out', 'b', 'b.in'),
    edge('e_cd', 'c', 'c.out', 'd', 'd.in'),
    edge('e_bc', 'b', 'b.out', 'c', 'c.in'),
  ]

  it('mints a proxy pin per boundary crossing and rewires boundary edges onto the macro', () => {
    const plan = planMacroCollapse(macroId, members, edges, pinInfo, minters())
    // One in-pin (for b.in) + one out-pin (for c.out).
    expect(plan.pins).toHaveLength(2)
    expect(plan.pins.map((p) => p.direction).sort()).toEqual(['in', 'out'])
    // Both boundary edges are removed, internal one is untouched.
    expect(plan.disconnect.sort()).toEqual(['e_ab', 'e_cd'])
    // Two new edges connect the externals to the macro's proxy pins.
    expect(plan.connect).toHaveLength(2)
    const inEdge = plan.connect.find((e) => e.to.node === macroId)!
    expect(inEdge.from).toEqual({ node: 'a', pin: 'a.out' })
    const outEdge = plan.connect.find((e) => e.from.node === macroId)!
    expect(outEdge.to).toEqual({ node: 'd', pin: 'd.in' })
  })

  it('records a proxy map sufficient to restore the originals on expand', () => {
    const plan = planMacroCollapse(macroId, members, edges, pinInfo, minters())
    expect(plan.proxyMap).toHaveLength(2)
    const inRec = plan.proxyMap.find((r) => r.direction === 'in')!
    expect(inRec).toMatchObject({ externalNode: 'a', externalPin: 'a.out', memberNode: 'b', memberPin: 'b.in' })
    expect(inRec.macroPin).toBe(plan.pins.find((p) => p.direction === 'in')!.id)
    const outRec = plan.proxyMap.find((r) => r.direction === 'out')!
    expect(outRec).toMatchObject({ externalNode: 'd', externalPin: 'd.in', memberNode: 'c', memberPin: 'c.out' })
  })
})

describe('planMacroExpand', () => {
  it('restores the original member↔external edges and drops the macro proxy edges', () => {
    const macroId = 'M' as NodeId
    const members = ['b', 'c'] as NodeId[]
    const edges = [
      edge('e_ab', 'a', 'a.out', 'b', 'b.in'),
      edge('e_cd', 'c', 'c.out', 'd', 'd.in'),
    ]
    const collapse = planMacroCollapse(macroId, members, edges, pinInfo, minters())
    const expand = planMacroExpand(collapse.proxyMap, minters())
    // Drops both macro proxy edges...
    expect(expand.disconnect.sort()).toEqual([...collapse.connect.map((e) => e.id)].sort())
    // ...and reconnects external↔member exactly as before (ids fresh, endpoints restored).
    expect(expand.connect).toHaveLength(2)
    const inEdge = expand.connect.find((e) => e.to.node === 'b')!
    expect(inEdge.from).toEqual({ node: 'a', pin: 'a.out' })
    expect(inEdge.to).toEqual({ node: 'b', pin: 'b.in' })
    const outEdge = expand.connect.find((e) => e.from.node === 'c')!
    expect(outEdge.from).toEqual({ node: 'c', pin: 'c.out' })
    expect(outEdge.to).toEqual({ node: 'd', pin: 'd.in' })
  })
})
