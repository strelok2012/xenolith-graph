// Compiler equivalence vs the interpreter. The compiler is a drop-in replacement for `Runtime`
// on the public surface — same entry types, same vars, same cross-tick latching. Every scenario
// the interpreter passes must produce identical VM-var snapshots after N ticks under the compiler.

import { describe, it, expect } from 'vitest'
import { Runtime, type RtGraph } from './interpreter.js'
import { BUILTIN_PRIMITIVES } from './primitives.js'
import { COLLECTION_PRIMITIVES } from './collection.js'
import { compile } from './compiler.js'
import { spawnEquivalenceGraph } from '../model/spawn-graph.js'
import { allocateEquivalenceGraph } from '../model/allocate-graph.js'

const DEFS = [...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES]

function snapshotVars(get: (n: string) => unknown, names: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const n of names) out[n] = get(n)
  return out
}

function runBoth(g: RtGraph, ticks: number, varNames: string[]): { interp: unknown[]; compiled: unknown[] } {
  const rt = new Runtime(DEFS)
  const co = compile(g, DEFS)
  const interp: unknown[] = []
  const compiled: unknown[] = []
  for (let i = 0; i < ticks; i++) {
    rt.tick(g)
    co.tick()
    interp.push(snapshotVars((n) => rt.getVar(n), varNames))
    compiled.push(snapshotVars((n) => co.getVar(n), varNames))
  }
  return { interp, compiled }
}

describe('compiler vs interpreter — VM-var equivalence', () => {
  describe('Spawn graph (per-type fractional accumulator)', () => {
    const cases: Array<{ name: string; specs: Array<{ type: string; rate: number }>; ticks: number }> = [
      { name: 'rate 1 emits one per tick',                       specs: [{ type: 'a', rate: 1 }],   ticks: 3 },
      { name: 'rate 0.5 emits every other tick',                 specs: [{ type: 'a', rate: 0.5 }], ticks: 4 },
      { name: 'mixed rates gift/coin/star',                      specs: [{ type: 'gift', rate: 0.4 }, { type: 'coin', rate: 0.6 }, { type: 'star', rate: 0.2 }], ticks: 10 },
      { name: 'rate > 1: 2.3 emits 2 then 3 every 3rd',          specs: [{ type: 'a', rate: 2.3 }], ticks: 5 },
      { name: 'empty specs → no emissions',                      specs: [],                          ticks: 3 },
    ]
    for (const tc of cases) {
      it(tc.name, () => {
        const g = spawnEquivalenceGraph(tc.specs)
        const { interp, compiled } = runBoth(g, tc.ticks, ['units', 'spawn:units', 'spawn:acc'])
        expect(compiled).toEqual(interp)
      })
    }
  })

  describe('Allocate graph (priority + subscribe + arrivals)', () => {
    const cases: Array<{ name: string; p: number[]; s: string[][]; a: string[]; c: Record<string, number> }> = [
      { name: '3 agents, 1 arrival → top wins',         p: [0.2, 0.9, 0.5], s: [['gift'], ['gift'], ['gift']], a: ['gift'], c: { gift: 2 } },
      { name: 'no subscribers → leftover',              p: [0.2, 0.9, 0.5], s: [[], [], []],                   a: ['gift'], c: { gift: 2 } },
      { name: 'multi arrivals chain',                   p: [0.2, 0.9, 0.5], s: [['gift', 'coin'], ['gift'], ['coin']], a: ['gift', 'coin'], c: { gift: 2, coin: 1.5 } },
      { name: 'priority ties — first index wins',       p: [0.5, 0.5, 0.5], s: [['gift'], ['gift'], ['gift']], a: ['gift'], c: { gift: 2 } },
      { name: 'arrivals > subscribers → leftover',      p: [0.5, 0.5],      s: [['gift'], []],                 a: ['gift', 'gift'], c: { gift: 2 } },
    ]
    for (const tc of cases) {
      it(tc.name, () => {
        const g = allocateEquivalenceGraph(tc.p, tc.s, tc.a, tc.c)
        const { interp, compiled } = runBoth(g, 1, ['priorities', 'awards', 'leftovers'])
        expect(compiled).toEqual(interp)
      })
    }
  })

  it('Tick entry: re-tick does not re-fire pure-only graphs (no Tick → nothing happens)', () => {
    const g: RtGraph = { nodes: [{ id: 'c', type: 'Const', pins: [{ id: 'out', kind: 'data', direction: 'out' }], state: { value: 42 } }], edges: [] }
    const co = compile(g, DEFS)
    co.tick()
    expect(co.getVar('anything')).toBeUndefined()
  })

  it('Init entry: compile + tick("Init") seeds vars exactly like the interpreter', () => {
    const g: RtGraph = {
      nodes: [
        { id: 'init', type: 'Init',  pins: [{ id: 'out', kind: 'exec', direction: 'out' }] },
        { id: 'c',    type: 'Const', pins: [{ id: 'out', kind: 'data', direction: 'out' }], state: { value: 7 } },
        { id: 'sv',   type: 'SetVar', pins: [
          { id: 'in', kind: 'exec', direction: 'in' },
          { id: 'v',  kind: 'data', direction: 'in' },
          { id: 'out', kind: 'exec', direction: 'out' },
        ], state: { name: 'seed' } },
      ],
      edges: [
        { from: { node: 'init', pin: 'out' }, to: { node: 'sv', pin: 'in' } },
        { from: { node: 'c',    pin: 'out' }, to: { node: 'sv', pin: 'v' } },
      ],
    }
    const rt = new Runtime(DEFS); rt.tick(g, 'Init')
    const co = compile(g, DEFS); co.tick('Init')
    expect(co.getVar('seed')).toBe(rt.getVar('seed'))
    expect(co.getVar('seed')).toBe(7)
  })
})
