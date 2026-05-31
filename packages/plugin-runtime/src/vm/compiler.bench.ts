// Interpreter vs compiler perf — what's the prototype win? Run via:
//   pnpm --filter @xenolith/plugin-runtime vitest bench --run compiler
// Each scenario runs N ticks under both engines and prints relative throughput.

import { bench, describe } from 'vitest'
import { Runtime } from './interpreter.js'
import { BUILTIN_PRIMITIVES } from './primitives.js'
import { COLLECTION_PRIMITIVES } from './collection.js'
import { compile } from './compiler.js'
import { codegen } from './codegen.js'
import { spawnEquivalenceGraph } from '../model/spawn-graph.js'
import { allocateEquivalenceGraph } from '../model/allocate-graph.js'

const DEFS = [...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES]

// Spawn — small graph (~20 nodes), per-type accumulator, 3 specs.
const SPAWN_GRAPH = spawnEquivalenceGraph([
  { type: 'gift', rate: 0.4 }, { type: 'coin', rate: 0.6 }, { type: 'star', rate: 0.2 },
])

// Allocate — bigger graph (~40 nodes), 6 agents × 3 goodies, realistic merged-demo subset.
const ALLOC_GRAPH = allocateEquivalenceGraph(
  [0.2, 0.9, 0.5, 0.4, 0.7, 0.3],
  [['gift', 'coin'], ['coin'], ['gift', 'star'], ['coin', 'star'], ['gift', 'coin', 'star'], ['star']],
  ['gift', 'coin', 'star'],
  { gift: 2, coin: 1.5, star: 4 },
)

describe('Spawn graph — interp vs baked vs codegen', () => {
  const rt = new Runtime(DEFS)
  const co = compile(SPAWN_GRAPH, DEFS)
  const cg = codegen(SPAWN_GRAPH, DEFS)
  bench('interp',   () => { rt.tick(SPAWN_GRAPH) })
  bench('baked',    () => { co.tick() })
  bench('codegen',  () => { cg.tick() })
})

describe('Allocate graph — interp vs baked vs codegen', () => {
  const rt = new Runtime(DEFS)
  const co = compile(ALLOC_GRAPH, DEFS)
  const cg = codegen(ALLOC_GRAPH, DEFS)
  bench('interp',   () => { rt.tick(ALLOC_GRAPH) })
  bench('baked',    () => { co.tick() })
  bench('codegen',  () => { cg.tick() })
})
