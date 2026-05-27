import { describe, it, expect } from 'vitest'
import { MACRO_TYPE, isMacro, createMacro, boundaryEdges, macroMembers, macroProxyPins } from './macro.js'
import type { Edge, Node } from './graph.js'
import type { NodeId, EdgeId, PinId } from './ids.js'

const edge = (id: string, fromN: string, toN: string): Edge => ({
  id: id as EdgeId,
  from: { node: fromN as NodeId, pin: `${fromN}.out` as unknown as PinId },
  to:   { node: toN as NodeId,   pin: `${toN}.in` as unknown as PinId },
})

describe('Macro node type', () => {
  it('isMacro recognises the reserved type only', () => {
    expect(isMacro({ type: MACRO_TYPE })).toBe(true)
    expect(isMacro({ type: 'KSampler' })).toBe(false)
  })

  it('createMacro mints a Macro node carrying its members + collapsed flag', () => {
    const m = createMacro({ x: 10, y: 20 }, ['a', 'b'] as NodeId[])
    expect(m.type).toBe(MACRO_TYPE)
    expect(m.position).toEqual({ x: 10, y: 20 })
    expect(macroMembers(m)).toEqual(['a', 'b'])
    expect(m.state['collapsed']).toBe(true)
    expect(m.pins).toEqual([])
  })

  it('macroMembers returns [] for a non-macro or memberless node', () => {
    const n: Node = { id: 'n' as NodeId, type: 'Op', position: { x: 0, y: 0 }, pins: [], state: {} }
    expect(macroMembers(n)).toEqual([])
  })
})

describe('boundaryEdges', () => {
  const members = new Set<NodeId>(['b', 'c'] as NodeId[])

  it('classifies an edge entering the group as an input', () => {
    const { inputs, outputs, internal } = boundaryEdges(members, [edge('e', 'a', 'b')])
    expect(inputs).toHaveLength(1)
    expect(outputs).toHaveLength(0)
    expect(internal).toHaveLength(0)
    expect(inputs[0]!.id).toBe('e')
  })

  it('classifies an edge leaving the group as an output', () => {
    const { inputs, outputs } = boundaryEdges(members, [edge('e', 'c', 'd')])
    expect(outputs).toHaveLength(1)
    expect(inputs).toHaveLength(0)
    expect(outputs[0]!.id).toBe('e')
  })

  it('classifies an edge fully inside the group as internal', () => {
    const { internal, inputs, outputs } = boundaryEdges(members, [edge('e', 'b', 'c')])
    expect(internal).toHaveLength(1)
    expect(inputs).toHaveLength(0)
    expect(outputs).toHaveLength(0)
  })

  it('ignores an edge fully outside the group', () => {
    const { inputs, outputs, internal } = boundaryEdges(members, [edge('e', 'a', 'd')])
    expect(inputs).toHaveLength(0)
    expect(outputs).toHaveLength(0)
    expect(internal).toHaveLength(0)
  })

  it('proxy pins group boundary edges by the member pin they cross at', () => {
    const edges = [
      edge('in1', 'a', 'b'),   // a.out → b.in
      edge('in2', 'x', 'b'),   // x.out → b.in  (same member pin → ONE input proxy, two edges)
      edge('out1', 'c', 'd'),  // c.out → d.in
      edge('out2', 'c', 'e'),  // c.out → e.in  (same member out pin → ONE output proxy, two edges)
      edge('int', 'b', 'c'),
    ]
    const proxies = macroProxyPins(boundaryEdges(members, edges))
    const ins = proxies.filter((p) => p.direction === 'in')
    const outs = proxies.filter((p) => p.direction === 'out')
    expect(ins).toHaveLength(1)
    expect(ins[0]!.memberNode).toBe('b')
    expect(ins[0]!.edges.sort()).toEqual(['in1', 'in2'])
    expect(outs).toHaveLength(1)
    expect(outs[0]!.memberNode).toBe('c')
    expect(outs[0]!.edges.sort()).toEqual(['out1', 'out2'])
  })

  it('partitions a mixed edge set deterministically', () => {
    const edges = [
      edge('in1', 'a', 'b'),
      edge('in2', 'x', 'c'),
      edge('out1', 'b', 'd'),
      edge('int1', 'b', 'c'),
      edge('ext1', 'a', 'd'),
    ]
    const { inputs, outputs, internal } = boundaryEdges(members, edges)
    expect(inputs.map((e) => e.id)).toEqual(['in1', 'in2'])
    expect(outputs.map((e) => e.id)).toEqual(['out1'])
    expect(internal.map((e) => e.id)).toEqual(['int1'])
  })
})
