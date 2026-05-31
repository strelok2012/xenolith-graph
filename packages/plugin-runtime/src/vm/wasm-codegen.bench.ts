// WASM vs JS-codegen vs interp on a numeric graph. The fairqueue graphs are string-heavy →
// JS wins there; here we test what WASM was designed for — tight f64 math.

import { bench, describe } from 'vitest'
import { Runtime, type RtGraph, type RtNode, type RtEdge } from './interpreter.js'
import { BUILTIN_PRIMITIVES } from './primitives.js'
import { codegen } from './codegen.js'
import { wasmCodegen } from './wasm-codegen.js'

const DEFS = [...BUILTIN_PRIMITIVES]

const ein  = (id: string) => ({ id, kind: 'exec' as const, direction: 'in'  as const, type: 'exec' })
const eout = (id: string) => ({ id, kind: 'exec' as const, direction: 'out' as const, type: 'exec' })
const din  = (id: string) => ({ id, kind: 'data' as const, direction: 'in'  as const, type: 'scalar' })
const dout = (id: string) => ({ id, kind: 'data' as const, direction: 'out' as const, type: 'scalar' })
const edge = (fn: string, fp: string, tn: string, tp: string) => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

/** 200-node Add chain: 1+2+3+...+200. Hot-path numeric — WASM territory. */
function bigAdd(): RtGraph {
  const nodes: RtNode[] = [
    { id: 'tick', type: 'Tick',  pins: [eout('out')] },
    { id: 'c0',   type: 'Const', pins: [dout('out')], state: { value: 1 } },
  ]
  const edges: RtEdge[] = []
  let prev = 'c0'
  for (let i = 1; i < 200; i++) {
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

/** Mixed math: 100 nodes of alternating Add/Mul/Sub/Floor. Closer to a real DSP/ML inner loop. */
function mixedMath(): RtGraph {
  const nodes: RtNode[] = [
    { id: 'tick', type: 'Tick',  pins: [eout('out')] },
    { id: 'getX', type: 'GetVar', pins: [dout('out')], state: { name: 'x' } },
  ]
  const edges: RtEdge[] = []
  let prev = 'getX'
  for (let i = 0; i < 100; i++) {
    const op = ['Add', 'Mul', 'Sub', 'Floor'][i % 4]!
    const cId = `c${i}`, nId = `n${i}`
    if (op === 'Floor') {
      nodes.push({ id: nId, type: 'Floor', pins: [din('n'), dout('out')] })
      edges.push(edge(prev, 'out', nId, 'n'))
    } else {
      nodes.push({ id: cId, type: 'Const', pins: [dout('out')], state: { value: 1.0001 } })
      nodes.push({ id: nId, type: op, pins: [din('a'), din('b'), dout('out')] })
      edges.push(edge(prev, 'out', nId, 'a'))
      edges.push(edge(cId,  'out', nId, 'b'))
    }
    prev = nId
  }
  nodes.push({ id: 'sv', type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'x' } })
  edges.push(edge('tick', 'out', 'sv', 'in'))
  edges.push(edge(prev, 'out', 'sv', 'v'))
  return { nodes, edges }
}

describe('200-node Add chain — interp vs JS codegen vs WASM', () => {
  const G = bigAdd()
  const rt = new Runtime(DEFS); const cg = codegen(G, DEFS); const wg = wasmCodegen(G, DEFS)
  bench('interp', () => { rt.tick(G) })
  bench('codegen-js', () => { cg.tick() })
  bench('codegen-wasm', () => { wg.tick() })
})

describe('100-node mixed math (Add/Mul/Sub/Floor) — interp vs JS codegen vs WASM', () => {
  const G = mixedMath()
  const rt = new Runtime(DEFS); const cg = codegen(G, DEFS); const wg = wasmCodegen(G, DEFS)
  bench('interp', () => { rt.tick(G) })
  bench('codegen-js', () => { cg.tick() })
  bench('codegen-wasm', () => { wg.tick() })
})
