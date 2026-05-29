import { describe, it, expect } from 'vitest'
import { Runtime, type RtGraph } from '../vm/interpreter.js'
import { BUILTIN_PRIMITIVES } from '../vm/primitives.js'
import { Allocate } from './allocate.js'

const DEFS = [...BUILTIN_PRIMITIVES, Allocate]

// Tick → Allocate (impure, latches outputs) → Sequence committing each output to a variable.
const allocGraph: RtGraph = {
  nodes: [
    { id: 'tick', type: 'Tick', pins: [{ id: 'out', kind: 'exec', direction: 'out' }] },
    { id: 'p', type: 'GetVar', pins: [{ id: 'value', kind: 'data', direction: 'out' }], state: { name: 'p' } },
    { id: 's', type: 'GetVar', pins: [{ id: 'value', kind: 'data', direction: 'out' }], state: { name: 'subs' } },
    { id: 'a', type: 'GetVar', pins: [{ id: 'value', kind: 'data', direction: 'out' }], state: { name: 'arrivals' } },
    { id: 'c', type: 'GetVar', pins: [{ id: 'value', kind: 'data', direction: 'out' }], state: { name: 'costs' } },
    {
      id: 'alloc', type: 'Allocate',
      pins: [
        { id: 'in', kind: 'exec', direction: 'in' },
        { id: 'p', kind: 'data', direction: 'in' }, { id: 'subs', kind: 'data', direction: 'in' },
        { id: 'arrivals', kind: 'data', direction: 'in' }, { id: 'costs', kind: 'data', direction: 'in' },
        { id: 'priorities', kind: 'data', direction: 'out' }, { id: 'awards', kind: 'data', direction: 'out' },
        { id: 'leftovers', kind: 'data', direction: 'out' }, { id: 'out', kind: 'exec', direction: 'out' },
      ],
    },
    { id: 'seq', type: 'Sequence', pins: [{ id: 'in', kind: 'exec', direction: 'in' }, { id: 't0', kind: 'exec', direction: 'out' }, { id: 't1', kind: 'exec', direction: 'out' }, { id: 't2', kind: 'exec', direction: 'out' }] },
    { id: 'sp', type: 'SetVar', pins: [{ id: 'in', kind: 'exec', direction: 'in' }, { id: 'value', kind: 'data', direction: 'in' }, { id: 'out', kind: 'exec', direction: 'out' }], state: { name: 'rp' } },
    { id: 'sa', type: 'SetVar', pins: [{ id: 'in', kind: 'exec', direction: 'in' }, { id: 'value', kind: 'data', direction: 'in' }, { id: 'out', kind: 'exec', direction: 'out' }], state: { name: 'ra' } },
    { id: 'sl', type: 'SetVar', pins: [{ id: 'in', kind: 'exec', direction: 'in' }, { id: 'value', kind: 'data', direction: 'in' }, { id: 'out', kind: 'exec', direction: 'out' }], state: { name: 'rl' } },
  ],
  edges: [
    { from: { node: 'tick', pin: 'out' }, to: { node: 'alloc', pin: 'in' } },
    { from: { node: 'p', pin: 'value' }, to: { node: 'alloc', pin: 'p' } },
    { from: { node: 's', pin: 'value' }, to: { node: 'alloc', pin: 'subs' } },
    { from: { node: 'a', pin: 'value' }, to: { node: 'alloc', pin: 'arrivals' } },
    { from: { node: 'c', pin: 'value' }, to: { node: 'alloc', pin: 'costs' } },
    { from: { node: 'alloc', pin: 'out' }, to: { node: 'seq', pin: 'in' } },
    { from: { node: 'seq', pin: 't0' }, to: { node: 'sp', pin: 'in' } },
    { from: { node: 'alloc', pin: 'priorities' }, to: { node: 'sp', pin: 'value' } },
    { from: { node: 'seq', pin: 't1' }, to: { node: 'sa', pin: 'in' } },
    { from: { node: 'alloc', pin: 'awards' }, to: { node: 'sa', pin: 'value' } },
    { from: { node: 'seq', pin: 't2' }, to: { node: 'sl', pin: 'in' } },
    { from: { node: 'alloc', pin: 'leftovers' }, to: { node: 'sl', pin: 'value' } },
  ],
}

const runAlloc = (p: number[], subs: string[][], arrivals: string[], costs: Record<string, number>) => {
  const rt = new Runtime(DEFS)
  rt.setVar('p', p); rt.setVar('subs', subs); rt.setVar('arrivals', arrivals); rt.setVar('costs', costs)
  rt.tick(allocGraph)
  return { priorities: rt.getVar('rp'), awards: rt.getVar('ra'), leftovers: rt.getVar('rl') }
}

describe('Allocate', () => {
  it('gives a unit to the highest-priority subscriber and subtracts its cost', () => {
    const r = runAlloc([10, 1], [['gift'], ['gift']], ['gift'], { gift: 4 })
    expect(r.priorities).toEqual([6, 1])
    expect(r.awards).toEqual([{ type: 'gift', to: 0 }])
    expect(r.leftovers).toEqual([])
  })

  it('only subscribers are eligible', () => {
    const r = runAlloc([100, 1], [[], ['gift']], ['gift'], { gift: 1 })
    expect(r.awards).toEqual([{ type: 'gift', to: 1 }])
    expect(r.priorities).toEqual([100, 0])
  })

  it('two units of a type spread to distinct recipients (cost lowers the first mid-step)', () => {
    const r = runAlloc([10, 9], [['g'], ['g']], ['g', 'g'], { g: 5 })
    expect((r.awards as { to: number }[]).map((a) => a.to)).toEqual([0, 1])
  })

  it('no subscriber → leftover, no award', () => {
    const r = runAlloc([5], [['known']], ['orphan'], { orphan: 1 })
    expect(r.awards).toEqual([])
    expect(r.leftovers).toEqual(['orphan'])
  })

  it('latches all three outputs from ONE evaluation (consumer order cannot corrupt it)', () => {
    // sp commits 'rp' first; sa/sl must still see the original allocation, not a re-derivation.
    const r = runAlloc([10, 1], [['g'], ['g']], ['g'], { g: 4 })
    expect(r.awards).toEqual([{ type: 'g', to: 0 }]) // top subscriber by ORIGINAL priority
  })
})
