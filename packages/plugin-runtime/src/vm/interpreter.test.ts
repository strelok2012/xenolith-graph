import { describe, it, expect } from 'vitest'
import { Runtime, type RtNode, type RtEdge, type RtPin, type RtGraph } from './interpreter.js'
import { BUILTIN_PRIMITIVES } from './primitives.js'

// --- tiny graph builders ----------------------------------------------------------------------
const ein = (id: string): RtPin => ({ id, kind: 'exec', direction: 'in' })
const eout = (id: string): RtPin => ({ id, kind: 'exec', direction: 'out' })
const din = (id: string): RtPin => ({ id, kind: 'data', direction: 'in' })
const dout = (id: string): RtPin => ({ id, kind: 'data', direction: 'out' })
const node = (id: string, type: string, pins: RtPin[], state?: Record<string, unknown>): RtNode =>
  ({ id, type, pins, ...(state ? { state } : {}) })
const edge = (fn: string, fp: string, tn: string, tp: string): RtEdge => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

const tick = (id = 'tick'): RtNode => node(id, 'Tick', [eout('out')])
const constN = (id: string, value: unknown): RtNode => node(id, 'Const', [dout('out')], { value })
const add = (id: string): RtNode => node(id, 'Add', [din('a'), din('b'), dout('out')])
const getVar = (id: string, name: string): RtNode => node(id, 'GetVar', [dout('value')], { name })
const setVar = (id: string, name: string): RtNode => node(id, 'SetVar', [ein('in'), din('value'), eout('out')], { name })

const run = (graph: RtGraph, ticks = 1): Runtime => {
  const rt = new Runtime(BUILTIN_PRIMITIVES)
  for (let i = 0; i < ticks; i++) rt.tick(graph)
  return rt
}

describe('pure pull', () => {
  it('lazily evaluates an upstream pure subgraph when an exec node reads its input', () => {
    const graph: RtGraph = {
      nodes: [tick(), setVar('s', 'result'), constN('a', 2), constN('b', 3), add('add')],
      edges: [
        edge('tick', 'out', 's', 'in'),
        edge('a', 'out', 'add', 'a'),
        edge('b', 'out', 'add', 'b'),
        edge('add', 'out', 's', 'value'),
      ],
    }
    expect(run(graph).getVar('result')).toBe(5)
  })
})

describe('state + feedback across ticks', () => {
  it('a variable persists and feeds back into itself (x += 1 each tick)', () => {
    const graph: RtGraph = {
      nodes: [tick(), getVar('g', 'x'), constN('one', 1), add('add'), setVar('s', 'x')],
      edges: [
        edge('tick', 'out', 's', 'in'),
        edge('g', 'value', 'add', 'a'),
        edge('one', 'out', 'add', 'b'),
        edge('add', 'out', 's', 'value'),
      ],
    }
    expect(run(graph, 1).getVar('x')).toBe(1)
    expect(run(graph, 3).getVar('x')).toBe(3) // proves cross-tick persistence
  })
})

describe('Sequence', () => {
  it('fires exec outs in declared order', () => {
    const seq = node('seq', 'Sequence', [ein('in'), eout('then0'), eout('then1')])
    const graph: RtGraph = {
      nodes: [tick(), seq, constN('c1', 1), setVar('s0', 'v'), constN('c2', 2), setVar('s1', 'v')],
      edges: [
        edge('tick', 'out', 'seq', 'in'),
        edge('seq', 'then0', 's0', 'in'),
        edge('c1', 'out', 's0', 'value'),
        edge('seq', 'then1', 's1', 'in'),
        edge('c2', 'out', 's1', 'value'),
      ],
    }
    expect(run(graph).getVar('v')).toBe(2) // then1 (=2) ran after then0 (=1)
  })
})

describe('Branch', () => {
  const build = (cond: boolean): RtGraph => {
    const br = node('br', 'Branch', [ein('in'), din('cond'), eout('true'), eout('false')])
    return {
      nodes: [tick(), br, constN('c', cond), constN('t', 'T'), setVar('sT', 'picked'), constN('f', 'F'), setVar('sF', 'picked')],
      edges: [
        edge('tick', 'out', 'br', 'in'),
        edge('c', 'out', 'br', 'cond'),
        edge('br', 'true', 'sT', 'in'),
        edge('t', 'out', 'sT', 'value'),
        edge('br', 'false', 'sF', 'in'),
        edge('f', 'out', 'sF', 'value'),
      ],
    }
  }
  it('takes the true branch', () => { expect(run(build(true)).getVar('picked')).toBe('T') })
  it('takes the false branch', () => { expect(run(build(false)).getVar('picked')).toBe('F') })
})

describe('ForEach', () => {
  it('runs the body per element, re-reading the element each iteration', () => {
    const fe = node('fe', 'ForEach', [ein('in'), din('array'), dout('element'), dout('index'), eout('body'), eout('completed')])
    const graph: RtGraph = {
      nodes: [tick(), fe, constN('arr', [10, 20, 30]), getVar('g', 'sum'), add('add'), setVar('s', 'sum')],
      edges: [
        edge('tick', 'out', 'fe', 'in'),
        edge('arr', 'out', 'fe', 'array'),
        edge('g', 'value', 'add', 'a'),
        edge('fe', 'element', 'add', 'b'),
        edge('add', 'out', 's', 'value'),
        edge('fe', 'body', 's', 'in'),
      ],
    }
    expect(run(graph).getVar('sum')).toBe(60) // 0+10+20+30, sum accumulated in a var
  })
})

describe('Init entry', () => {
  it('fires only on tick(graph, "Init"), not on a normal tick', () => {
    const graph: RtGraph = {
      nodes: [node('init', 'Init', [eout('out')]), constN('c', 7), setVar('s', 'seeded')],
      edges: [edge('init', 'out', 's', 'in'), edge('c', 'out', 's', 'value')],
    }
    const rt = new Runtime(BUILTIN_PRIMITIVES)
    rt.tick(graph) // default entry 'Tick' — Init must NOT fire
    expect(rt.getVar('seeded')).toBeUndefined()
    rt.tick(graph, 'Init') // construction pass
    expect(rt.getVar('seeded')).toBe(7)
  })
})

describe('Spawn', () => {
  const spawnGraph = (): RtGraph => ({
    nodes: [
      tick(),
      constN('specs', [{ type: 'gift', rate: 0.5 }, { type: 'coin', rate: 1 }]),
      node('spawn', 'Spawn', [ein('in'), din('specs'), dout('units'), eout('out')]),
      setVar('s', 'arrivals'),
    ],
    edges: [
      edge('tick', 'out', 'spawn', 'in'),
      edge('specs', 'out', 'spawn', 'specs'),
      edge('spawn', 'out', 's', 'in'),
      edge('spawn', 'units', 's', 'value'),
    ],
  })

  it('emits a unit each time a fractional rate crosses 1 (accumulates per tick)', () => {
    const rt = new Runtime(BUILTIN_PRIMITIVES)
    const g = spawnGraph()
    rt.tick(g) // gift 0.5, coin 1.0 → ['coin']
    expect(rt.getVar('arrivals')).toEqual(['coin'])
    rt.tick(g) // gift 1.0, coin 1.0 → ['gift','coin']
    expect(rt.getVar('arrivals')).toEqual(['gift', 'coin'])
  })

  it('rate 1 emits exactly one per tick; rate 0 never emits', () => {
    const rt = new Runtime(BUILTIN_PRIMITIVES)
    const g: RtGraph = {
      nodes: [
        tick(),
        constN('specs', [{ type: 'a', rate: 1 }, { type: 'b', rate: 0 }]),
        node('spawn', 'Spawn', [ein('in'), din('specs'), dout('units'), eout('out')]),
        setVar('s', 'out'),
      ],
      edges: [
        edge('tick', 'out', 'spawn', 'in'),
        edge('specs', 'out', 'spawn', 'specs'),
        edge('spawn', 'out', 's', 'in'),
        edge('spawn', 'units', 's', 'value'),
      ],
    }
    rt.tick(g); expect(rt.getVar('out')).toEqual(['a'])
    rt.tick(g); expect(rt.getVar('out')).toEqual(['a'])
  })
})
