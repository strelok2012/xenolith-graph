import { describe, it, expect } from 'vitest'
import { Runtime, type RtGraph, type RtNode, type RtPin } from './interpreter.js'
import { BUILTIN_PRIMITIVES } from './primitives.js'
import { COLLECTION_PRIMITIVES, domainNodes, SCATTER_VAR_PREFIX } from './collection.js'

const DEFS = [...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES]
const ein = (id: string): RtPin => ({ id, kind: 'exec', direction: 'in' })
const eout = (id: string): RtPin => ({ id, kind: 'exec', direction: 'out' })
const din = (id: string): RtPin => ({ id, kind: 'data', direction: 'in' })
const dout = (id: string): RtPin => ({ id, kind: 'data', direction: 'out' })
const agent = (id: string, salary: number): RtNode => ({ id, type: 'Agent', state: { salary }, pins: [] })

describe('domainNodes', () => {
  it('filters by type and orders by id (stable)', () => {
    const ns = [agent('b', 2), { id: 'g', type: 'Goodie', state: {}, pins: [] }, agent('a', 1)]
    expect(domainNodes(ns, 'Agent').map((n) => n.id)).toEqual(['a', 'b'])
  })
})

describe('Gather', () => {
  it('reads a field from every node of a type into an array (id order)', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        agent('Ada', 0.5), agent('Cleo', 0.6), agent('Boris', 0.4),
        { id: 'gather', type: 'Gather', state: { nodeType: 'Agent', field: 'salary' }, pins: [dout('out')] },
        { id: 'set', type: 'SetVar', state: { name: 'sal' }, pins: [ein('in'), din('value'), eout('out')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 'set', pin: 'in' } },
        { from: { node: 'gather', pin: 'out' }, to: { node: 'set', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar('sal')).toEqual([0.5, 0.4, 0.6]) // Ada, Boris, Cleo by id
  })

  it('picks up a newly added node automatically (the whole point)', () => {
    const base: RtNode[] = [
      { id: 'tick', type: 'Tick', pins: [eout('out')] },
      { id: 'gather', type: 'Gather', state: { nodeType: 'Agent', field: 'salary' }, pins: [dout('out')] },
      { id: 'set', type: 'SetVar', state: { name: 'sal' }, pins: [ein('in'), din('value'), eout('out')] },
    ]
    const edges = [
      { from: { node: 'tick', pin: 'out' }, to: { node: 'set', pin: 'in' } },
      { from: { node: 'gather', pin: 'out' }, to: { node: 'set', pin: 'value' } },
    ]
    const rt = new Runtime(DEFS)
    rt.tick({ nodes: [...base, agent('Ada', 0.5)], edges })
    expect(rt.getVar('sal')).toEqual([0.5])
    rt.tick({ nodes: [...base, agent('Ada', 0.5), agent('Boris', 0.4)], edges }) // added a node
    expect(rt.getVar('sal')).toEqual([0.5, 0.4])
  })
})

describe('GatherRecords', () => {
  const goodie = (id: string, type: string, cost: number, rate: number): RtNode =>
    ({ id, type: 'Goodie', state: { type, cost, rate }, pins: [] })
  it('reads several fields per node into objects (id order)', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        goodie('g2', 'coin', 1.5, 0.6), goodie('g1', 'gift', 2, 0.4),
        { id: 'gr', type: 'GatherRecords', state: { nodeType: 'Goodie', fields: 'type, rate' }, pins: [dout('out')] },
        { id: 'set', type: 'SetVar', state: { name: 'recs' }, pins: [ein('in'), din('value'), eout('out')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 'set', pin: 'in' } },
        { from: { node: 'gr', pin: 'out' }, to: { node: 'set', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar('recs')).toEqual([{ type: 'gift', rate: 0.4 }, { type: 'coin', rate: 0.6 }])
  })
})

describe('ToMap', () => {
  it('turns records into a key→value object', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'src', type: 'Const', state: { value: [{ type: 'gift', cost: 2 }, { type: 'coin', cost: 1.5 }] }, pins: [dout('out')] },
        { id: 'map', type: 'ToMap', state: { key: 'type', value: 'cost' }, pins: [din('in'), dout('out')] },
        { id: 'set', type: 'SetVar', state: { name: 'costs' }, pins: [ein('in'), din('value'), eout('out')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 'set', pin: 'in' } },
        { from: { node: 'src', pin: 'out' }, to: { node: 'map', pin: 'in' } },
        { from: { node: 'map', pin: 'out' }, to: { node: 'set', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar('costs')).toEqual({ gift: 2, coin: 1.5 })
  })
})

describe('GatherFromInputs', () => {
  it('collects wired inputs (multi-edge) into an array, edge order', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'a', type: 'Const', state: { value: 10 }, pins: [dout('out')] },
        { id: 'b', type: 'Const', state: { value: 20 }, pins: [dout('out')] },
        { id: 'c', type: 'Const', state: { value: 30 }, pins: [dout('out')] },
        { id: 'g', type: 'GatherFromInputs', pins: [din('items'), dout('out')] },
        { id: 'set', type: 'SetVar', state: { name: 'arr' }, pins: [ein('in'), din('value'), eout('out')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 'set', pin: 'in' } },
        { from: { node: 'a', pin: 'out' }, to: { node: 'g', pin: 'items' } },
        { from: { node: 'b', pin: 'out' }, to: { node: 'g', pin: 'items' } },
        { from: { node: 'c', pin: 'out' }, to: { node: 'g', pin: 'items' } },
        { from: { node: 'g', pin: 'out' }, to: { node: 'set', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar('arr')).toEqual([10, 20, 30])
  })
})

describe('Output', () => {
  it('publishes the wired value into output:<nodeId> each tick', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'src', type: 'Const', state: { value: 42 }, pins: [dout('out')] },
        { id: 'o', type: 'Output', pins: [ein('in'), din('value'), eout('out')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 'o', pin: 'in' } },
        { from: { node: 'src', pin: 'out' }, to: { node: 'o', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar('output:o')).toBe(42)
  })
})

describe('GetField', () => {
  it('reads a field from a record', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'src', type: 'Const', state: { value: { salary: 0.5, subs: ['gift'] } }, pins: [dout('out')] },
        { id: 'g', type: 'GetField', state: { field: 'salary' }, pins: [din('in'), dout('out')] },
        { id: 'set', type: 'SetVar', state: { name: 'v' }, pins: [ein('in'), din('value'), eout('out')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 'set', pin: 'in' } },
        { from: { node: 'src', pin: 'out' }, to: { node: 'g', pin: 'in' } },
        { from: { node: 'g', pin: 'out' }, to: { node: 'set', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar('v')).toBe(0.5)
  })
})

describe('MapField', () => {
  it('extracts a field from each record into a parallel array', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'src', type: 'Const', state: { value: [{ salary: 0.5 }, { salary: 0.4 }, { salary: 0.6 }] }, pins: [dout('out')] },
        { id: 'm', type: 'MapField', state: { field: 'salary' }, pins: [din('in'), dout('out')] },
        { id: 'set', type: 'SetVar', state: { name: 'sals' }, pins: [ein('in'), din('value'), eout('out')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 'set', pin: 'in' } },
        { from: { node: 'src', pin: 'out' }, to: { node: 'm', pin: 'in' } },
        { from: { node: 'm', pin: 'out' }, to: { node: 'set', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar('sals')).toEqual([0.5, 0.4, 0.6])
  })
})

describe('ScatterToOutputs', () => {
  it('publishes array elements onto each declared data-out pin, in order', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'src', type: 'Const', state: { value: ['x', 'y', 'z'] }, pins: [dout('out')] },
        { id: 's', type: 'ScatterToOutputs', pins: [ein('in'), din('value'), eout('out'), dout('o0'), dout('o1'), dout('o2')] },
        { id: 'sa', type: 'SetVar', state: { name: 'a' }, pins: [ein('in'), din('value'), eout('out')] },
        { id: 'sb', type: 'SetVar', state: { name: 'b' }, pins: [ein('in'), din('value'), eout('out')] },
        { id: 'sc', type: 'SetVar', state: { name: 'c' }, pins: [ein('in'), din('value'), eout('out')] },
        { id: 'seq', type: 'Sequence', pins: [ein('in'), eout('t0'), eout('t1'), eout('t2')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 's', pin: 'in' } },
        { from: { node: 'src', pin: 'out' }, to: { node: 's', pin: 'value' } },
        { from: { node: 's', pin: 'out' }, to: { node: 'seq', pin: 'in' } },
        { from: { node: 'seq', pin: 't0' }, to: { node: 'sa', pin: 'in' } },
        { from: { node: 's', pin: 'o0' }, to: { node: 'sa', pin: 'value' } },
        { from: { node: 'seq', pin: 't1' }, to: { node: 'sb', pin: 'in' } },
        { from: { node: 's', pin: 'o1' }, to: { node: 'sb', pin: 'value' } },
        { from: { node: 'seq', pin: 't2' }, to: { node: 'sc', pin: 'in' } },
        { from: { node: 's', pin: 'o2' }, to: { node: 'sc', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar('a')).toBe('x')
    expect(rt.getVar('b')).toBe('y')
    expect(rt.getVar('c')).toBe('z')
  })
})

describe('Scatter', () => {
  it('publishes its input array as a scatter:<type>:<field> var for the host to write back', () => {
    const graph: RtGraph = {
      nodes: [
        { id: 'tick', type: 'Tick', pins: [eout('out')] },
        { id: 'src', type: 'Const', state: { value: [1, 2, 3] }, pins: [dout('out')] },
        { id: 'scatter', type: 'Scatter', state: { nodeType: 'Agent', field: 'priority' }, pins: [ein('in'), din('value'), eout('out')] },
      ],
      edges: [
        { from: { node: 'tick', pin: 'out' }, to: { node: 'scatter', pin: 'in' } },
        { from: { node: 'src', pin: 'out' }, to: { node: 'scatter', pin: 'value' } },
      ],
    }
    const rt = new Runtime(DEFS)
    rt.tick(graph)
    expect(rt.getVar(`${SCATTER_VAR_PREFIX}Agent:priority`)).toEqual([1, 2, 3])
  })
})
