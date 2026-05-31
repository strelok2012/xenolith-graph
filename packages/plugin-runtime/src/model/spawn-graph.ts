// Spawn expressed as a sub-graph of primitives — data-flow equivalent of native `Spawn` (per-type
// fractional rate accumulator stored in a VM var). Same I/O contract: exec-in + `specs` data-in →
// `units` data-out + exec-out.
//
// Per tick (for each spec {type, rate}):
//   acc[type] += rate
//   while acc[type] >= 1:  push type to out; acc[type] -= 1
// Equivalent without `while`: emitCount = floor(acc[type] + rate); acc[type] = (acc[type] + rate) - emitCount;
//   units = repeat(type, emitCount)
// Then concat all per-spec `units` arrays.

import type { RtGraph, RtNode, RtPin, RtEdge } from '../vm/interpreter.js'

const ein  = (id: string): RtPin => ({ id, kind: 'exec', direction: 'in' })
const eout = (id: string): RtPin => ({ id, kind: 'exec', direction: 'out' })
const din  = (id: string): RtPin => ({ id, kind: 'data', direction: 'in' })
const dout = (id: string): RtPin => ({ id, kind: 'data', direction: 'out' })
const nd = (id: string, type: string, pins: RtPin[], state?: Record<string, unknown>): RtNode =>
  ({ id, type, pins, ...(state ? { state } : {}) })
const e = (fn: string, fp: string, tn: string, tp: string): RtEdge => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

/** Inline spawn sub-graph keyed by `prefix`. */
export function buildSpawnSubgraph(
  prefix: string,
  srcs: { specs: { node: string; pin: string }; exec: { node: string; pin: string } },
): {
  nodes: RtNode[]
  edges: RtEdge[]
  out: { units: { node: string; pin: string }; exec: { node: string; pin: string } }
} {
  const vAcc   = `${prefix}:acc`    // per-type accumulator object {type: number}
  const vUnits = `${prefix}:units`  // accumulated units this tick

  const id = (s: string): string => `${prefix}:${s}`
  const n = (s: string, t: string, pins: RtPin[], state?: Record<string, unknown>): RtNode =>
    nd(id(s), t, pins, state)

  // INIT: units ← [];  acc stays cross-tick (read whatever was there, default {})
  const seq        = n('seq',       'Sequence', [ein('in'), eout('initU'), eout('loop'), eout('after')])
  const emptyU     = n('emptyU',    'Const',    [dout('out')], { value: [] })
  const setInitU   = n('setInitU',  'SetVar',   [ein('in'), din('value'), eout('out')], { name: vUnits })

  // LOOP body per spec:
  const fe = n('fe', 'ForEach', [ein('in'), din('array'), dout('element'), dout('index'), eout('body'), eout('done')])

  // type = GetField(spec, 'type'); rate = GetField(spec, 'rate')
  const getType = n('getType', 'GetField', [din('record'), dout('value')], { field: 'type' })
  const getRate = n('getRate', 'GetField', [din('record'), dout('value')], { field: 'rate' })

  // accObj = GetVar(acc); old = ObjectGet(accObj, type)
  const getAcc = n('getAcc', 'GetVar',    [dout('value')], { name: vAcc })
  const oldA   = n('oldA',   'ObjectGet', [din('o'), din('k'), dout('out')])

  // newA = old + rate; emitCount = Floor(newA); accAfter = newA - emitCount
  const newA      = n('newA',      'Add',   [din('a'), din('b'), dout('out')])
  const emitCount = n('emitCount', 'Floor', [din('n'), dout('out')])
  const accAfter  = n('accAfter',  'Sub',   [din('a'), din('b'), dout('out')])

  // emitted = Repeat(type, emitCount); units = Concat(units, emitted)
  const repeat = n('repeat', 'Repeat', [din('i'), din('c'), dout('out')])
  const getU   = n('getU',   'GetVar', [dout('value')], { name: vUnits })
  const conc   = n('conc',   'Concat', [din('a'), din('b'), dout('out')])
  const setU   = n('setU',   'SetVar', [ein('in'), din('value'), eout('out')], { name: vUnits })

  // accObj' = ObjectSet(accObj, type, accAfter); save back
  const getAcc2 = n('getAcc2', 'GetVar',    [dout('value')], { name: vAcc })
  const setObj  = n('setObj',  'ObjectSet', [din('o'), din('k'), din('v'), dout('out')])
  const setAcc  = n('setAcc',  'SetVar',    [ein('in'), din('value'), eout('out')], { name: vAcc })

  // Sequence the body writes: setU → setAcc
  const bodySeq = n('bodySeq', 'Sequence', [ein('in'), eout('a'), eout('b')])

  // After loop — expose units as output
  const outU = n('outU', 'GetVar', [dout('value')], { name: vUnits })

  const nodes: RtNode[] = [
    seq, emptyU, setInitU, fe,
    getType, getRate, getAcc, oldA, newA, emitCount, accAfter,
    repeat, getU, conc, setU,
    getAcc2, setObj, setAcc, bodySeq, outU,
  ]
  const edges: RtEdge[] = [
    // exec entry
    e(srcs.exec.node, srcs.exec.pin, id('seq'), 'in'),
    e(id('seq'), 'initU', id('setInitU'), 'in'),
    e(id('emptyU'), 'out', id('setInitU'), 'value'),
    e(id('seq'), 'loop',  id('fe'), 'in'),
    e(srcs.specs.node, srcs.specs.pin, id('fe'), 'array'),

    // body
    e(id('fe'), 'body', id('bodySeq'), 'in'),
    e(id('bodySeq'), 'a', id('setU'),   'in'),
    e(id('bodySeq'), 'b', id('setAcc'), 'in'),

    // type & rate from spec
    e(id('fe'), 'element', id('getType'), 'record'),
    e(id('fe'), 'element', id('getRate'), 'record'),

    // oldA = acc[type]
    e(id('getAcc'),  'value', id('oldA'), 'o'),
    e(id('getType'), 'value', id('oldA'), 'k'),

    // newA = old + rate
    e(id('oldA'),    'out',   id('newA'), 'a'),
    e(id('getRate'), 'value', id('newA'), 'b'),

    // emitCount = floor(newA); accAfter = newA - emitCount
    e(id('newA'),      'out', id('emitCount'), 'n'),
    e(id('newA'),      'out', id('accAfter'),  'a'),
    e(id('emitCount'), 'out', id('accAfter'),  'b'),

    // emitted = Repeat(type, emitCount); units' = Concat(units, emitted); save
    e(id('getType'),   'value', id('repeat'), 'i'),
    e(id('emitCount'), 'out',   id('repeat'), 'c'),
    e(id('getU'),      'value', id('conc'),   'a'),
    e(id('repeat'),    'out',   id('conc'),   'b'),
    e(id('conc'),      'out',   id('setU'),   'value'),

    // acc' = ObjectSet(acc, type, accAfter); save
    e(id('getAcc2'), 'value', id('setObj'), 'o'),
    e(id('getType'), 'value', id('setObj'), 'k'),
    e(id('accAfter'), 'out',  id('setObj'), 'v'),
    e(id('setObj'),  'out',   id('setAcc'), 'value'),
  ]

  return {
    nodes, edges,
    out: { units: { node: id('outU'), pin: 'value' }, exec: { node: id('seq'), pin: 'after' } },
  }
}

/** Standalone test wrapper: takes literal `specs`, drains `units` into a VM var for assertions. */
export function spawnEquivalenceGraph(specs: Array<{ type: string; rate: number }>): RtGraph {
  const tickNode: RtNode = { id: 'tick', type: 'Tick', pins: [eout('out')] }
  const cSpecs: RtNode = { id: 'cS', type: 'Const', pins: [dout('out')], state: { value: specs } }

  const sub = buildSpawnSubgraph('spawn', {
    specs: { node: 'cS', pin: 'out' },
    exec:  { node: 'tick', pin: 'out' },
  })

  const drainU: RtNode = { id: 'drainU', type: 'SetVar', pins: [ein('in'), din('value'), eout('out')], state: { name: 'units' } }

  return {
    nodes: [tickNode, cSpecs, ...sub.nodes, drainU],
    edges: [
      ...sub.edges,
      e(sub.out.exec.node, sub.out.exec.pin, 'drainU', 'in'),
      e(sub.out.units.node, sub.out.units.pin, 'drainU', 'value'),
    ],
  }
}
