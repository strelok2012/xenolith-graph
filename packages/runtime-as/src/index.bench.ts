// AS-WASM vs raw-WASM vs JS-codegen vs interp on numeric graphs. The runtime should match raw
// WASM (or beat it — Binaryen's optimiser is aggressive) and crush JS by 1-2 orders of magnitude.

import { bench, describe } from 'vitest'
import { Runtime, BUILTIN_PRIMITIVES, type RtGraph, type RtNode, type RtEdge } from '@xenolith/plugin-runtime'
// Import the in-package codegen + wasm-codegen via the source paths — they're not exported.
import { codegen } from '../../plugin-runtime/src/vm/codegen.js'
import { wasmCodegen } from '../../plugin-runtime/src/vm/wasm-codegen.js'
import { compile } from './index.js'

const DEFS = [...BUILTIN_PRIMITIVES]

const ein  = (id: string) => ({ id, kind: 'exec' as const, direction: 'in'  as const, type: 'exec' })
const eout = (id: string) => ({ id, kind: 'exec' as const, direction: 'out' as const, type: 'exec' })
const din  = (id: string) => ({ id, kind: 'data' as const, direction: 'in'  as const, type: 'scalar' })
const dout = (id: string) => ({ id, kind: 'data' as const, direction: 'out' as const, type: 'scalar' })
const edge = (fn: string, fp: string, tn: string, tp: string) => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

function bigAdd(n: number): RtGraph {
  const nodes: RtNode[] = [
    { id: 'tick', type: 'Tick',  pins: [eout('out')] },
    { id: 'c0',   type: 'Const', pins: [dout('out')], state: { value: 1 } },
  ]
  const edges: RtEdge[] = []
  let prev = 'c0'
  for (let i = 1; i < n; i++) {
    const cId = `c${i}`, aId = `a${i}`
    nodes.push({ id: cId, type: 'Const', pins: [dout('out')], state: { value: i + 1 } })
    nodes.push({ id: aId, type: 'Add', pins: [din('a'), din('b'), dout('out')] })
    edges.push(edge(prev, 'out', aId, 'a'))
    edges.push(edge(cId,  'out', aId, 'b'))
    prev = aId
  }
  nodes.push({ id: 'sv', type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'sum' } })
  edges.push(edge('tick', 'out', 'sv', 'in'))
  edges.push(edge(prev, 'out', 'sv', 'v'))
  return { nodes, edges }
}

const G = bigAdd(200)

// Pre-compile all engines outside the bench loop. The async AS compile happens at module-load.
const rt = new Runtime(DEFS)
const cg = codegen(G, DEFS)
const wg = wasmCodegen(G, DEFS)
const ag = await compile(G, DEFS)

describe('200-node Add chain — interp vs JS codegen vs raw WASM vs AS WASM', () => {
  bench('interp',         () => { rt.tick(G) })
  bench('codegen-js',     () => { cg.tick() })
  bench('codegen-wasm',   () => { wg.tick() })
  bench('codegen-as',     () => { ag.tick() })
})
