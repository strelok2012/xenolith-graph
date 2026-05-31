import { describe, it, expect } from 'vitest'
import { Runtime, type RtGraph } from '../vm/interpreter.js'
import { BUILTIN_PRIMITIVES } from '../vm/primitives.js'
import { COLLECTION_PRIMITIVES } from '../vm/collection.js'
import { spawnEquivalenceGraph } from './spawn-graph.js'

// Native Spawn (for comparison) — same shape as the one shipped in primitives.ts. Inlined here so
// the test is self-contained and doesn't depend on registration order.
import { asArray, asNumber, type VmValue } from '../vm/value.js'
import type { NodeDef } from '../vm/interpreter.js'
const NativeSpawn: NodeDef = {
  type: 'NativeSpawn',
  run: (io) => {
    const specs = asArray(io.input(0)) as Array<{ type: string; rate: number }>
    const accKey = `__nspawn:${io.node.id}`
    const acc = (io.getVar(accKey) as Record<string, number> | undefined) ?? {}
    const out: VmValue[] = []
    for (const s of specs) {
      let a = (acc[s.type] ?? 0) + asNumber(s.rate)
      while (a >= 1) { out.push(s.type); a -= 1 }
      acc[s.type] = a
    }
    io.setVar(accKey, acc as unknown as VmValue)
    io.setOutput(0, out)
    io.flow(0)
  },
}

function runGraphSpawn(specs: Array<{ type: string; rate: number }>, ticks: number): VmValue[][] {
  const rt = new Runtime([...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES])
  const g = spawnEquivalenceGraph(specs)
  const seen: VmValue[][] = []
  for (let i = 0; i < ticks; i++) {
    rt.tick(g)
    seen.push([...((rt.getVar('units') as VmValue[]) ?? [])])
  }
  return seen
}

function runNativeSpawn(specs: Array<{ type: string; rate: number }>, ticks: number): VmValue[][] {
  const rt = new Runtime([...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES, NativeSpawn])
  const g: RtGraph = {
    nodes: [
      { id: 'tick', type: 'Tick',  pins: [{ id: 'out', kind: 'exec', direction: 'out' }] },
      { id: 'cS',   type: 'Const', pins: [{ id: 'out', kind: 'data', direction: 'out' }], state: { value: specs } },
      { id: 'sp',   type: 'NativeSpawn', pins: [
        { id: 'in',  kind: 'exec', direction: 'in' },
        { id: 's',   kind: 'data', direction: 'in' },
        { id: 'u',   kind: 'data', direction: 'out' },
        { id: 'out', kind: 'exec', direction: 'out' },
      ]},
      { id: 'sv', type: 'SetVar', pins: [
        { id: 'in', kind: 'exec', direction: 'in' },
        { id: 'v',  kind: 'data', direction: 'in' },
        { id: 'out', kind: 'exec', direction: 'out' },
      ], state: { name: 'units' } },
    ],
    edges: [
      { from: { node: 'tick', pin: 'out' }, to: { node: 'sp', pin: 'in' } },
      { from: { node: 'cS',   pin: 'out' }, to: { node: 'sp', pin: 's' } },
      { from: { node: 'sp',   pin: 'out' }, to: { node: 'sv', pin: 'in' } },
      { from: { node: 'sp',   pin: 'u' },   to: { node: 'sv', pin: 'v' } },
    ],
  }
  const seen: VmValue[][] = []
  for (let i = 0; i < ticks; i++) {
    rt.tick(g)
    seen.push([...((rt.getVar('units') as VmValue[]) ?? [])])
  }
  return seen
}

describe('Spawn graph-template — equivalence with native Spawn (per-tick sequence)', () => {
  const cases: Array<{ name: string; specs: Array<{ type: string; rate: number }>; ticks: number }> = [
    { name: 'rate 1 emits one per tick',                       specs: [{ type: 'a', rate: 1 }],                                  ticks: 3 },
    { name: 'rate 0 never emits',                              specs: [{ type: 'a', rate: 0 }],                                  ticks: 5 },
    { name: 'rate 0.5 emits every other tick',                 specs: [{ type: 'a', rate: 0.5 }],                                ticks: 4 },
    { name: 'mixed rates: gift 0.4 + coin 0.6 + star 0.2',      specs: [{ type: 'gift', rate: 0.4 }, { type: 'coin', rate: 0.6 }, { type: 'star', rate: 0.2 }], ticks: 10 },
    { name: 'rate > 1: 2.3 emits 2 per tick then 3 every 3rd', specs: [{ type: 'a', rate: 2.3 }],                                ticks: 5 },
    { name: 'empty specs → no emissions',                      specs: [],                                                         ticks: 3 },
  ]

  for (const tc of cases) {
    it(tc.name, () => {
      const got    = runGraphSpawn(tc.specs, tc.ticks)
      const native = runNativeSpawn(tc.specs, tc.ticks)
      expect(got, `tick sequence mismatch for "${tc.name}"`).toEqual(native)
    })
  }
})
