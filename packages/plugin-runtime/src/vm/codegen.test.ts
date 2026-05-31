// Real JS codegen — same equivalence bar as the baked-context compiler.

import { describe, it, expect } from 'vitest'
import { Runtime, type RtGraph } from './interpreter.js'
import { BUILTIN_PRIMITIVES } from './primitives.js'
import { COLLECTION_PRIMITIVES } from './collection.js'
import { codegen } from './codegen.js'
import { spawnEquivalenceGraph } from '../model/spawn-graph.js'
import { allocateEquivalenceGraph } from '../model/allocate-graph.js'

const DEFS = [...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES]

function runBoth(g: RtGraph, ticks: number, varNames: string[]): { interp: unknown[]; codegen: unknown[] } {
  const rt = new Runtime(DEFS)
  const co = codegen(g, DEFS)
  const interp: unknown[] = []
  const cg: unknown[] = []
  for (let i = 0; i < ticks; i++) {
    rt.tick(g); co.tick()
    interp.push(Object.fromEntries(varNames.map((n) => [n, rt.getVar(n)])))
    cg.push(Object.fromEntries(varNames.map((n) => [n, co.getVar(n)])))
  }
  return { interp, codegen: cg }
}

describe('codegen vs interpreter — VM-var equivalence', () => {
  describe('Spawn', () => {
    const cases = [
      { name: 'rate 1',     specs: [{ type: 'a', rate: 1 }],   ticks: 3 },
      { name: 'rate 0.5',   specs: [{ type: 'a', rate: 0.5 }], ticks: 4 },
      { name: 'mixed',      specs: [{ type: 'gift', rate: 0.4 }, { type: 'coin', rate: 0.6 }, { type: 'star', rate: 0.2 }], ticks: 10 },
      { name: 'rate > 1',   specs: [{ type: 'a', rate: 2.3 }], ticks: 5 },
      { name: 'empty',      specs: [], ticks: 3 },
    ]
    for (const tc of cases) {
      it(tc.name, () => {
        const g = spawnEquivalenceGraph(tc.specs)
        const { interp, codegen: cg } = runBoth(g, tc.ticks, ['units', 'spawn:units', 'spawn:acc'])
        expect(cg).toEqual(interp)
      })
    }
  })

  describe('Allocate', () => {
    const cases = [
      { name: '3 agents, 1 arrival',      p: [0.2, 0.9, 0.5], s: [['gift'], ['gift'], ['gift']], a: ['gift'], c: { gift: 2 } },
      { name: 'no subscribers',           p: [0.2, 0.9, 0.5], s: [[], [], []],                   a: ['gift'], c: { gift: 2 } },
      { name: 'multi arrivals chain',     p: [0.2, 0.9, 0.5], s: [['gift', 'coin'], ['gift'], ['coin']], a: ['gift', 'coin'], c: { gift: 2, coin: 1.5 } },
      { name: 'ties — first wins',        p: [0.5, 0.5, 0.5], s: [['gift'], ['gift'], ['gift']], a: ['gift'], c: { gift: 2 } },
      { name: 'leftover',                 p: [0.5, 0.5],      s: [['gift'], []],                 a: ['gift', 'gift'], c: { gift: 2 } },
    ]
    for (const tc of cases) {
      it(tc.name, () => {
        const g = allocateEquivalenceGraph(tc.p, tc.s, tc.a, tc.c)
        const { interp, codegen: cg } = runBoth(g, 1, ['priorities', 'awards', 'leftovers'])
        expect(cg).toEqual(interp)
      })
    }
  })
})
