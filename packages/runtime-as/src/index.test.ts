// AS-codegen equivalence with the reference interpreter. Same numeric graphs we proved against
// the raw-WASM emitter — should match here too.

import { describe, it, expect } from 'vitest'
import { Runtime, BUILTIN_PRIMITIVES, type RtGraph, type RtNode, type RtEdge } from '@xenolith/plugin-runtime'
import { compile, canCompileToAS } from './index.js'

const DEFS = [...BUILTIN_PRIMITIVES]

const ein  = (id: string) => ({ id, kind: 'exec' as const, direction: 'in'  as const, type: 'exec' })
const eout = (id: string) => ({ id, kind: 'exec' as const, direction: 'out' as const, type: 'exec' })
const din  = (id: string) => ({ id, kind: 'data' as const, direction: 'in'  as const, type: 'scalar' })
const dout = (id: string) => ({ id, kind: 'data' as const, direction: 'out' as const, type: 'scalar' })
const edge = (fn: string, fp: string, tn: string, tp: string) => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

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
      edge('c5', 'out', 'mul', 'a'),
      edge('c2', 'out', 'mul', 'b'),
      edge('c7', 'out', 'add', 'a'),
      edge('mul', 'out', 'add', 'b'),
      edge('tick', 'out', 'sv', 'in'),
      edge('add', 'out', 'sv', 'v'),
    ],
  }
}

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
      edge('getOut', 'value', 'add', 'a'),
      edge('one',    'out',   'add', 'b'),
      edge('tick',   'out',   'sv',  'in'),
      edge('add',    'out',   'sv',  'v'),
    ],
  }
}

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

// Compilation is the expensive part — give vitest plenty of time. The bigAdd compile alone is ~2s.
describe('AS-codegen vs interpreter — numeric equivalence', { timeout: 30_000 }, () => {
  it('chain: (7 + 5*2) === 17', async () => {
    const g = chainGraph()
    expect(canCompileToAS(g)).toBe(true)
    const rt = new Runtime(DEFS); rt.tick(g)
    const cg = await compile(g, DEFS); cg.tick()
    expect(cg.getVar('out')).toBe(rt.getVar('out'))
    expect(cg.getVar('out')).toBe(17)
  })

  it('accumulator across 5 ticks: WASM memory persists', async () => {
    const g = accumGraph()
    const rt = new Runtime(DEFS); const cg = await compile(g, DEFS)
    for (let i = 0; i < 5; i++) { rt.tick(g); cg.tick() }
    expect(cg.getVar('out')).toBe(rt.getVar('out'))
    expect(cg.getVar('out')).toBe(5)
  })

  it('50-node Add chain matches interpreter', async () => {
    const g = bigAdd(50)
    const rt = new Runtime(DEFS); rt.tick(g)
    const cg = await compile(g, DEFS); cg.tick()
    expect(cg.getVar('sum')).toBe(rt.getVar('sum'))
    expect(cg.getVar('sum')).toBe(1275)
  })

  it('rejects non-numeric graphs', async () => {
    const g: RtGraph = { nodes: [{ id: 'g', type: 'GetField', pins: [], state: {} }], edges: [] }
    expect(canCompileToAS(g)).toBe(false)
    await expect(compile(g, DEFS)).rejects.toThrow(/non-numeric/)
  })

  it('Local tick-scoped cell: resets each tick, drives loop body, parity with interpreter', async () => {
    // sum = sum_acc; loop 10 times { sum_acc += 1 }   with sum_acc a Local seeded to 0.
    // After tick: sum == 10. Run tick again: Local resets, sum is 10 again (NOT 20 — that's the point).
    const g: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'acc',  type: 'Local', pins: [ein('in'), din('set'), eout('out'), dout('value')], state: { name: 'acc', initial: 0 } },
        { id: 'loop', type: 'Loop', pins: [
          ein('in'), din('max'), din('cond'),
          dout('idx'),
          eout('body'), eout('done'),
        ] },
        { id: 'ten',  type: 'Const', pins: [dout('out')], state: { value: 10 } },
        { id: 'truthy', type: 'Const', pins: [dout('out')], state: { value: 1 } },
        { id: 'one',  type: 'Const', pins: [dout('out')], state: { value: 1 } },
        { id: 'addOne', type: 'Add',  pins: [din('a'), din('b'), dout('out')] },
        { id: 'sum',  type: 'GraphOutput', pins: [ein('in'), din('value'), eout('out')], state: { name: 'sum' } },
      ],
      edges: [
        edge('tick',  'out', 'loop', 'in'),
        edge('ten',   'out', 'loop', 'max'),
        edge('truthy','out', 'loop', 'cond'),
        edge('loop',  'body', 'acc', 'in'),
        edge('acc',   'value', 'addOne', 'a'),
        edge('one',   'out',   'addOne', 'b'),
        edge('addOne','out',   'acc',    'set'),
        edge('loop',  'done',  'sum',    'in'),
        edge('acc',   'value', 'sum',    'value'),
      ],
    }
    const rt = new Runtime(DEFS); rt.tick(g); rt.tick(g)
    const cg = await compile(g, DEFS)
    expect(cg.tickArgs).toBeDefined()
    expect(cg.tickArgs!()).toBe(10) // first tick
    expect(cg.tickArgs!()).toBe(10) // second tick — Local reset proves itself
    expect(rt.getVar('sum')).toBe(10)
  })

  it('GraphInput/GraphOutput auto-derive tickArgs signature (no meta hint needed)', async () => {
    // (x + 1) * 2 — no `meta` on the graph; AS-WASM should still produce tickArgs(x): y.
    const g: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'x', type: 'GraphInput', pins: [dout('value')], state: { name: 'x' } },
        { id: 'one', type: 'Const', pins: [dout('out')], state: { value: 1 } },
        { id: 'two', type: 'Const', pins: [dout('out')], state: { value: 2 } },
        { id: 'add', type: 'Add', pins: [din('a'), din('b'), dout('out')] },
        { id: 'mul', type: 'Mul', pins: [din('a'), din('b'), dout('out')] },
        { id: 'y',   type: 'GraphOutput', pins: [ein('in'), din('value'), eout('out')], state: { name: 'y' } },
      ],
      edges: [
        edge('x',   'value', 'add', 'a'),
        edge('one', 'out',   'add', 'b'),
        edge('add', 'out',   'mul', 'a'),
        edge('two', 'out',   'mul', 'b'),
        edge('tick', 'out',  'y',   'in'),
        edge('mul',  'out',  'y',   'value'),
      ],
    }
    const cg = await compile(g, DEFS)
    expect(cg.tickArgs).toBeDefined()
    expect(cg.tickArgs!(3)).toBe(8)   // (3+1)*2
    expect(cg.tickArgs!(10)).toBe(22) // (10+1)*2
  })
})
