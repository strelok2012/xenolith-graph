// WASM codegen equivalence vs interpreter for the numeric subset.

import { describe, it, expect } from 'vitest'
import { Runtime, type RtGraph, type RtNode, type RtEdge } from './interpreter.js'
import { BUILTIN_PRIMITIVES } from './primitives.js'
import { wasmCodegen, canCompileToWasm } from './wasm-codegen.js'

const DEFS = [...BUILTIN_PRIMITIVES]

// ---- helpers to build small numeric graphs ----

const ein  = (id: string) => ({ id, kind: 'exec' as const, direction: 'in'  as const, type: 'exec' })
const eout = (id: string) => ({ id, kind: 'exec' as const, direction: 'out' as const, type: 'exec' })
const din  = (id: string) => ({ id, kind: 'data' as const, direction: 'in'  as const, type: 'scalar' })
const dout = (id: string) => ({ id, kind: 'data' as const, direction: 'out' as const, type: 'scalar' })
const e    = (fn: string, fp: string, tn: string, tp: string) => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

/** Simple chain: SetVar('out', Const(7) + Const(5) * Const(2)) → out should equal 17. */
function chainGraph(): RtGraph {
  return {
    nodes: [
      { id: 'tick', type: 'Tick', pins: [eout('out')] },
      { id: 'c7',   type: 'Const', pins: [dout('out')], state: { value: 7 } },
      { id: 'c5',   type: 'Const', pins: [dout('out')], state: { value: 5 } },
      { id: 'c2',   type: 'Const', pins: [dout('out')], state: { value: 2 } },
      { id: 'mul',  type: 'Mul',  pins: [din('a'), din('b'), dout('out')] },
      { id: 'add',  type: 'Add',  pins: [din('a'), din('b'), dout('out')] },
      { id: 'sv',   type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'out' } },
    ],
    edges: [
      e('c5', 'out', 'mul', 'a'),
      e('c2', 'out', 'mul', 'b'),
      e('c7', 'out', 'add', 'a'),
      e('mul', 'out', 'add', 'b'),
      e('tick', 'out', 'sv', 'in'),
      e('add', 'out', 'sv', 'v'),
    ],
  }
}

/** Cross-tick accumulator: out += 1 each tick. */
function accumGraph(): RtGraph {
  return {
    nodes: [
      { id: 'tick', type: 'Tick', pins: [eout('out')] },
      { id: 'getOut', type: 'GetVar', pins: [dout('value')], state: { name: 'out' } },
      { id: 'one',    type: 'Const',  pins: [dout('out')],   state: { value: 1 } },
      { id: 'add',    type: 'Add',    pins: [din('a'), din('b'), dout('out')] },
      { id: 'sv',     type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'out' } },
    ],
    edges: [
      e('getOut', 'value', 'add', 'a'),
      e('one',    'out',   'add', 'b'),
      e('tick',   'out',   'sv',  'in'),
      e('add',    'out',   'sv',  'v'),
    ],
  }
}

/** 50-node Add chain → out = 1 + 2 + 3 + ... + 50 = 1275. Heavy numeric — what WASM should fly on. */
function bigAddGraph(): RtGraph {
  const nodes: RtNode[] = [
    { id: 'tick', type: 'Tick',  pins: [eout('out')] },
    { id: 'c0',   type: 'Const', pins: [dout('out')], state: { value: 1 } },
  ]
  const edges: RtEdge[] = []
  let prev = 'c0'
  for (let i = 1; i < 50; i++) {
    const cId = `c${i}`, aId = `a${i}`
    nodes.push({ id: cId, type: 'Const', pins: [dout('out')], state: { value: i + 1 } })
    nodes.push({ id: aId, type: 'Add', pins: [din('a'), din('b'), dout('out')] })
    edges.push(e(prev, 'out', aId, 'a'))
    edges.push(e(cId,  'out', aId, 'b'))
    prev = aId
  }
  nodes.push({ id: 'sv', type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'out' } })
  edges.push(e('tick', 'out', 'sv', 'in'))
  edges.push(e(prev, 'out', 'sv', 'v'))
  return { nodes, edges }
}

describe('wasm-codegen — numeric equivalence', () => {
  it('chain graph: (7 + 5*2) === 17 — matches interpreter', () => {
    const g = chainGraph()
    expect(canCompileToWasm(g)).toBe(true)
    const rt = new Runtime(DEFS); rt.tick(g)
    const cg = wasmCodegen(g, DEFS); cg.tick()
    expect(cg.getVar('out')).toBe(rt.getVar('out'))
    expect(cg.getVar('out')).toBe(17)
  })

  it('accumulator: persists across ticks via WASM memory', () => {
    const g = accumGraph()
    const rt = new Runtime(DEFS); const cg = wasmCodegen(g, DEFS)
    for (let i = 0; i < 5; i++) { rt.tick(g); cg.tick() }
    expect(cg.getVar('out')).toBe(rt.getVar('out'))
    expect(cg.getVar('out')).toBe(5)
  })

  it('big 50-node add chain matches interpreter', () => {
    const g = bigAddGraph()
    const rt = new Runtime(DEFS); rt.tick(g)
    const cg = wasmCodegen(g, DEFS); cg.tick()
    expect(cg.getVar('out')).toBe(rt.getVar('out'))
    expect(cg.getVar('out')).toBe(1275)
  })

  it('rejects non-numeric graphs (canCompileToWasm = false)', () => {
    const g: RtGraph = { nodes: [{ id: 'g', type: 'GetField', pins: [], state: {} }], edges: [] }
    expect(canCompileToWasm(g)).toBe(false)
    expect(() => wasmCodegen(g, DEFS)).toThrow(/non-numeric/)
  })
})
