import { describe, it, expect } from 'vitest'
import { Runtime } from '../vm/interpreter.js'
import { BUILTIN_PRIMITIVES } from '../vm/primitives.js'
import { COLLECTION_PRIMITIVES } from '../vm/collection.js'
import { Allocate as NativeAllocate } from './allocate.js'
import { allocateEquivalenceGraph } from './allocate-graph.js'

// Run the graph-based Allocate and capture priorities + awards-count + leftovers.
function runGraphAllocate(p: number[], s: string[][], a: string[], c: Record<string, number>): {
  priorities: number[]
  awards: unknown[]
  leftovers: string[]
} {
  const rt = new Runtime([...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES, NativeAllocate])
  rt.tick(allocateEquivalenceGraph(p, s, a, c))
  return {
    priorities: rt.getVar('priorities') as number[],
    awards:     rt.getVar('awards')     as unknown[],
    leftovers:  rt.getVar('leftovers')  as string[],
  }
}

// Run native Allocate via a tiny driver graph that exposes the same vars for comparison.
function runNativeAllocate(p: number[], s: string[][], a: string[], c: Record<string, number>): {
  priorities: number[]
  awards: unknown[]
  leftovers: string[]
} {
  const rt = new Runtime([...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES, NativeAllocate])
  rt.tick({
    nodes: [
      { id: 'tick', type: 'Tick', pins: [{ id: 'out', kind: 'exec', direction: 'out' }] },
      { id: 'cP',   type: 'Const', pins: [{ id: 'out', kind: 'data', direction: 'out' }], state: { value: p } },
      { id: 'cS',   type: 'Const', pins: [{ id: 'out', kind: 'data', direction: 'out' }], state: { value: s } },
      { id: 'cA',   type: 'Const', pins: [{ id: 'out', kind: 'data', direction: 'out' }], state: { value: a } },
      { id: 'cC',   type: 'Const', pins: [{ id: 'out', kind: 'data', direction: 'out' }], state: { value: c } },
      { id: 'al',   type: 'Allocate', pins: [
        { id: 'in',  kind: 'exec', direction: 'in' },
        { id: 'p',   kind: 'data', direction: 'in' },
        { id: 's',   kind: 'data', direction: 'in' },
        { id: 'a',   kind: 'data', direction: 'in' },
        { id: 'c',   kind: 'data', direction: 'in' },
        { id: 'po',  kind: 'data', direction: 'out' },
        { id: 'aw',  kind: 'data', direction: 'out' },
        { id: 'lo',  kind: 'data', direction: 'out' },
        { id: 'out', kind: 'exec', direction: 'out' },
      ]},
      { id: 'sP',  type: 'SetVar', pins: [{ id: 'in', kind: 'exec', direction: 'in' }, { id: 'v', kind: 'data', direction: 'in' }, { id: 'out', kind: 'exec', direction: 'out' }], state: { name: 'priorities' } },
      { id: 'sAw', type: 'SetVar', pins: [{ id: 'in', kind: 'exec', direction: 'in' }, { id: 'v', kind: 'data', direction: 'in' }, { id: 'out', kind: 'exec', direction: 'out' }], state: { name: 'awards' } },
      { id: 'sLo', type: 'SetVar', pins: [{ id: 'in', kind: 'exec', direction: 'in' }, { id: 'v', kind: 'data', direction: 'in' }, { id: 'out', kind: 'exec', direction: 'out' }], state: { name: 'leftovers' } },
    ],
    edges: [
      { from: { node: 'tick', pin: 'out' }, to: { node: 'al', pin: 'in' } },
      { from: { node: 'cP',   pin: 'out' }, to: { node: 'al', pin: 'p' } },
      { from: { node: 'cS',   pin: 'out' }, to: { node: 'al', pin: 's' } },
      { from: { node: 'cA',   pin: 'out' }, to: { node: 'al', pin: 'a' } },
      { from: { node: 'cC',   pin: 'out' }, to: { node: 'al', pin: 'c' } },
      { from: { node: 'al',   pin: 'out' }, to: { node: 'sP', pin: 'in' } },
      { from: { node: 'al',   pin: 'po' },  to: { node: 'sP', pin: 'v' } },
      { from: { node: 'sP',   pin: 'out' }, to: { node: 'sAw', pin: 'in' } },
      { from: { node: 'al',   pin: 'aw' },  to: { node: 'sAw', pin: 'v' } },
      { from: { node: 'sAw',  pin: 'out' }, to: { node: 'sLo', pin: 'in' } },
      { from: { node: 'al',   pin: 'lo' },  to: { node: 'sLo', pin: 'v' } },
    ],
  })
  return {
    priorities: rt.getVar('priorities') as number[],
    awards:     rt.getVar('awards')     as unknown[],
    leftovers:  rt.getVar('leftovers')  as string[],
  }
}

describe('Allocate graph-template — equivalence with native Allocate', () => {
  // Priorities/leftovers are what the fairqueue sim CARES ABOUT (they feed back into the model and
  // the warehouse counter). The graph's `awards` are a stripped-down `[unit]` list rather than
  // native's `[{type, to}]` — equivalence is per-LENGTH (count of allocations matches).

  const cases: Array<{
    name: string
    p: number[]
    s: string[][]
    a: string[]
    c: Record<string, number>
  }> = [
    {
      name: 'no arrivals → no change',
      p: [1, 2, 3], s: [['gift'], ['coin'], ['star']], a: [], c: { gift: 1, coin: 1, star: 1 },
    },
    {
      name: 'no subscribers → all leftover',
      p: [1, 1], s: [[], []], a: ['gift', 'coin'], c: { gift: 2, coin: 1 },
    },
    {
      name: 'single arrival to single subscriber',
      p: [5], s: [['gift']], a: ['gift'], c: { gift: 2 },
    },
    {
      name: 'tie-break: lowest index wins (matches native strict `>`)',
      p: [3, 3, 3], s: [['gift'], ['gift'], ['gift']], a: ['gift'], c: { gift: 1 },
    },
    {
      name: 'multiple arrivals shift priorities each iteration',
      p: [5, 4, 3, 2], s: [['gift'], ['gift', 'coin'], ['coin'], ['coin']], a: ['gift', 'coin', 'gift', 'coin'], c: { gift: 2, coin: 1 },
    },
    {
      name: 'mixed leftovers + awards',
      p: [1, 2], s: [['gift'], ['gift']], a: ['gift', 'star', 'gift', 'unknown'], c: { gift: 1, star: 5 },
    },
    {
      name: 'fairqueue scenario (3 agents, 3 goodies)',
      p: [0.5, 0.4, 0.6],
      s: [['gift', 'coin'], ['coin'], ['gift', 'star']],
      a: ['coin', 'gift', 'star'],
      c: { gift: 2, coin: 1.5, star: 4 },
    },
  ]

  for (const tc of cases) {
    it(tc.name, () => {
      const got = runGraphAllocate(tc.p, tc.s, tc.a, tc.c)
      const native = runNativeAllocate(tc.p, tc.s, tc.a, tc.c)
      expect(got.priorities, `priorities mismatch for "${tc.name}"`).toEqual(native.priorities)
      expect(got.leftovers,  `leftovers mismatch for "${tc.name}"`).toEqual(native.leftovers)
      expect(got.awards.length, `awards count mismatch for "${tc.name}"`).toBe(native.awards.length)
    })
  }
})
