// `Allocate` — the one domain verb that encapsulates the hard combinatorics: route each arriving
// unit to the highest-priority subscriber of its type, subtracting that type's cost; units with no
// subscriber become leftovers (→ warehouse). Ships native first (the escape hatch); later the same
// pin interface can be a template built from ForEach/Filter/TopBy primitives.
//
// IN: (priorities[], subs[][], arrivals[], costs{type:cost}). OUT: (priorities[], awards[], leftovers[]).
// Ties broken by lowest index (strict `>`), matching the native fairqueue step().
//
// IMPURE (exec), not pure: a multi-output worker must evaluate ONCE and latch its outputs, so every
// consumer reads the SAME result. (As a pure node it would re-run per pulled output; if a consumer
// committed a variable this node depends on between pulls, later outputs would be computed from the
// already-mutated state — the classic Blueprint reason such nodes are impure.)

import type { NodeDef } from '../vm/interpreter.js'
import { asArray, asNumber, type VmValue } from '../vm/value.js'

// Pin order is the contract (index-addressed): IN 0=priorities[], 1=subs[][], 2=arrivals[],
// 3=costs{type:cost}; OUT 0=priorities[], 1=awards[], 2=leftovers[]; exec-out 0=out.
export const Allocate: NodeDef = {
  type: 'Allocate',
  run: (io) => {
    const p = asArray(io.input(0)).map(asNumber)
    const subs = asArray(io.input(1)).map((s) => asArray(s).map(String))
    const arrivals = asArray(io.input(2)).map(String)
    const costs = (io.input(3) as Record<string, number> | undefined) ?? {}

    const awards: VmValue[] = []
    const leftovers: VmValue[] = []
    for (const type of arrivals) {
      let best = -1
      let bestP = -Infinity
      for (let i = 0; i < p.length; i++) {
        if (subs[i]!.includes(type) && p[i]! > bestP) {
          bestP = p[i]!
          best = i
        }
      }
      if (best < 0) {
        leftovers.push(type)
        continue
      }
      p[best]! -= asNumber(costs[type])
      awards.push({ type, to: best })
    }
    io.setOutput(0, p)
    io.setOutput(1, awards)
    io.setOutput(2, leftovers)
    io.flow(0)
  },
}
