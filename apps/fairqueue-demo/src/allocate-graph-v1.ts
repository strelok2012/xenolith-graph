// V1-graph version of `buildAllocateSubgraph` (which lives in plugin-runtime, RtNode-flavoured).
// Same topology, same VM behaviour — but emits `XenolithNodeV1` / `XenolithEdgeV1` so it can be
// dropped into `fairqueueMergedGraph` and serialised to / loaded from the V1 graph file.
//
// Replaces the native `Allocate` node with a pure-primitive sub-graph; the simulation then runs
// entirely through composable primitives (ForEach + FilterIndices + ArgMax + Index + ArrayWrite +
// Append + ObjectGet) with NO bespoke `Allocate` evaluator in the VM.

import type { XenolithNodeV1, XenolithEdgeV1, XenolithPinV1 } from '@xenolith/editor'

const ei = (id: string, label = ''): XenolithPinV1 => ({ id, kind: 'exec', direction: 'in',  type: 'exec', multiple: false, label })
const eo = (id: string, label = ''): XenolithPinV1 => ({ id, kind: 'exec', direction: 'out', type: 'exec', multiple: false, label })
const di = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'in',  type, multiple: false, label })
const dout = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'out', type, multiple: true, label })

// Human-readable titles matching PRIMITIVE_SCHEMAS (so the node header reads "Get Variable", not "GetVar").
const TITLES: Record<string, string> = {
  Sequence: 'Sequence', ForEach: 'For Each', Branch: 'Branch',
  GetVar: 'Get Variable', SetVar: 'Set Variable', Const: 'Const',
  Length: 'Length', Sub: 'Subtract', Append: 'Append', Index: 'Index',
  IndexAll: 'Index All', ArrayWrite: 'Array Write', ArgMax: 'ArgMax',
  FilterIndices: 'Filter Indices', ObjectGet: 'Object Get', Gt: 'Greater',
}
const CATS: Record<string, string> = {
  Sequence: 'flow', ForEach: 'flow', Branch: 'flow',
  GetVar: 'state', SetVar: 'state', Const: 'state',
  Sub: 'math', Gt: 'math',
}
const e = (id: string, fn: string, fp: string, tn: string, tp: string): XenolithEdgeV1 =>
  ({ id, from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

const PIN: Record<string, [number, number]> = {} // x,y by id (debugging only — overridden per-node)

/** Build an allocate sub-graph keyed by `prefix`. Lays nodes out around `originX, originY` in a
 *  loose left-to-right flow. Returns nodes/edges plus handles for the four OUT pins + the exec OUT
 *  pin so the caller can wire them to downstream consumers (scale / leftovers / etc.). */
export function buildAllocateSubgraphV1(
  prefix: string,
  originX: number,
  originY: number,
  srcs: {
    priorities: { node: string; pin: string }
    subs:       { node: string; pin: string }
    arrivals:   { node: string; pin: string }
    costs:      { node: string; pin: string }
    exec:       { node: string; pin: string }
  },
): {
  nodes: XenolithNodeV1[]
  edges: XenolithEdgeV1[]
  out: {
    priorities: { node: string; pin: string }
    awards:     { node: string; pin: string }
    leftovers:  { node: string; pin: string }
    exec:       { node: string; pin: string }
  }
} {
  const id = (suffix: string): string => `${prefix}:${suffix}`
  const vP  = `${prefix}:p`
  const vAw = `${prefix}:awards`
  const vLo = `${prefix}:leftovers`

  // Helper: position a node in a 4-column / N-row grid for readability when dived.
  const place = (col: number, row: number): { x: number; y: number } =>
    ({ x: originX + col * 220, y: originY + row * 120 })
  void PIN

  const node = (suffix: string, type: string, col: number, row: number, pins: XenolithPinV1[], state?: Record<string, unknown>, widgets?: ReadonlyArray<unknown>): XenolithNodeV1 => {
    const out: XenolithNodeV1 = {
      id: id(suffix), type, position: place(col, row),
      render: { title: TITLES[type] ?? type, category: CATS[type] ?? 'array' },
      pins,
    }
    if (state) out.state = state
    if (widgets) (out as { widgets?: unknown }).widgets = widgets
    return out
  }

  // ---- INIT (Sequence + 3 SetVars) ------------------------------------------------------------
  const nameTextWidget = (key: string, pinKey: string, name: string) =>
    [{ id: 'name', type: 'text', key: 'name', label: '', pinKey, visibility: 'always' } as const]

  const seq        = node('seq',        'Sequence', 0, 0, [ei(id('seq:in')), eo(id('seq:initP'), 'init P'), eo(id('seq:initAw'), 'init Aw'), eo(id('seq:initLo'), 'init Lo'), eo(id('seq:loop'), 'loop'), eo(id('seq:after'), 'after')])
  const setInitP   = node('setInitP',   'SetVar',   1, 0, [ei(id('setInitP:in')), di(id('setInitP:value'), 'value', 'array'), eo(id('setInitP:out'))], { name: vP },  nameTextWidget('name', 'value', vP))
  const emptyAw    = node('emptyAw',    'Const',    1, 1, [dout(id('emptyAw:out'), 'out', 'array')], { value: [] }, [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out', visibility: 'always' }])
  const setInitAw  = node('setInitAw',  'SetVar',   2, 1, [ei(id('setInitAw:in')), di(id('setInitAw:value'), 'value', 'array'), eo(id('setInitAw:out'))], { name: vAw }, nameTextWidget('name', 'value', vAw))
  const emptyLo    = node('emptyLo',    'Const',    1, 2, [dout(id('emptyLo:out'), 'out', 'array')], { value: [] }, [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out', visibility: 'always' }])
  const setInitLo  = node('setInitLo',  'SetVar',   2, 2, [ei(id('setInitLo:in')), di(id('setInitLo:value'), 'value', 'array'), eo(id('setInitLo:out'))], { name: vLo }, nameTextWidget('name', 'value', vLo))

  // ---- LOOP (ForEach over arrivals) ----------------------------------------------------------
  const fe   = node('fe',     'ForEach', 3, 0, [ei(id('fe:in')), di(id('fe:array'), 'array', 'array'), dout(id('fe:element'), 'element', 'any'), dout(id('fe:index'), 'index', 'scalar'), eo(id('fe:body')), eo(id('fe:done'))])

  // body: subscribers = FilterIndices(subs, unit)
  const filt    = node('filt',     'FilterIndices', 4, 0, [di(id('filt:arr'), 'array', 'array'), di(id('filt:item'), 'item', 'any'), dout(id('filt:out'), 'out', 'array')])
  const subsLen = node('subsLen',  'Length',        4, 1, [di(id('subsLen:arr'), 'array', 'array'), dout(id('subsLen:out'), 'out', 'scalar')])
  const zero    = node('zero',     'Const',         4, 2, [dout(id('zero:out'), 'out', 'scalar')], { value: 0 }, [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out', visibility: 'always' }])
  // `Gt` (greater-than) — proper comparison. Was `Sub(length, 0)` + asBool truthy hack; that's gone.
  const lenCmp  = node('lenCmp',   'Gt',            5, 1, [di(id('lenCmp:a'), 'a', 'scalar'), di(id('lenCmp:b'), 'b', 'scalar'), dout(id('lenCmp:out'), 'out', 'bool')])
  const br      = node('br',       'Branch',        5, 0, [ei(id('br:in')), di(id('br:cond'), 'cond', 'bool'), eo(id('br:true'), 'true'), eo(id('br:false'), 'false')])

  // branch.false → leftovers.push(unit)
  const getLo = node('getLo', 'GetVar', 5, 3, [dout(id('getLo:value'), 'value', 'array')], { name: vLo }, nameTextWidget('name', 'value', vLo))
  const appLo = node('appLo', 'Append', 6, 3, [di(id('appLo:arr'), 'array', 'array'), di(id('appLo:item'), 'item', 'any'), dout(id('appLo:out'), 'out', 'array')])
  const setLo = node('setLo', 'SetVar', 7, 3, [ei(id('setLo:in')), di(id('setLo:value'), 'value', 'array'), eo(id('setLo:out'))], { name: vLo }, nameTextWidget('name', 'value', vLo))

  // branch.true: bestSubIdx = ArgMax(IndexAll(priorities, subscribers))
  const getP1     = node('getP1',     'GetVar',    6, 0, [dout(id('getP1:value'), 'value', 'array')], { name: vP }, nameTextWidget('name', 'value', vP))
  const idxAll    = node('idxAll',    'IndexAll',  7, 0, [di(id('idxAll:arr'), 'array', 'array'), di(id('idxAll:idxs'), 'idxs', 'array'), dout(id('idxAll:out'), 'out', 'array')])
  const argMax    = node('argMax',    'ArgMax',    8, 0, [di(id('argMax:arr'), 'array', 'array'), dout(id('argMax:out'), 'out', 'scalar')])
  const bestAgent = node('bestAgent', 'Index',     8, 1, [di(id('bestAgent:arr'), 'array', 'array'), di(id('bestAgent:i'), 'idx', 'scalar'), dout(id('bestAgent:out'), 'out', 'any')])
  const cost      = node('cost',      'ObjectGet', 6, 1, [di(id('cost:o'), 'obj', 'object'), di(id('cost:k'), 'key', 'any'), dout(id('cost:out'), 'out', 'any')])
  const getP2     = node('getP2',     'GetVar',    7, 1, [dout(id('getP2:value'), 'value', 'array')], { name: vP }, nameTextWidget('name', 'value', vP))
  const oldP      = node('oldP',      'Index',     8, 2, [di(id('oldP:arr'), 'array', 'array'), di(id('oldP:i'), 'idx', 'scalar'), dout(id('oldP:out'), 'out', 'scalar')])
  const newP      = node('newP',      'Sub',       9, 1, [di(id('newP:a'), 'a', 'scalar'), di(id('newP:b'), 'b', 'scalar'), dout(id('newP:out'), 'out', 'scalar')])
  const getP3     = node('getP3',     'GetVar',    9, 2, [dout(id('getP3:value'), 'value', 'array')], { name: vP }, nameTextWidget('name', 'value', vP))
  const writeP    = node('writeP',    'ArrayWrite',10, 1, [di(id('writeP:arr'), 'array', 'array'), di(id('writeP:i'), 'idx', 'scalar'), di(id('writeP:v'), 'value', 'any'), dout(id('writeP:out'), 'out', 'array')])
  const setP      = node('setP',      'SetVar',    11, 1, [ei(id('setP:in')), di(id('setP:value'), 'value', 'array'), eo(id('setP:out'))], { name: vP }, nameTextWidget('name', 'value', vP))

  const getAw  = node('getAw',  'GetVar', 9,  3, [dout(id('getAw:value'), 'value', 'array')], { name: vAw }, nameTextWidget('name', 'value', vAw))
  const appAw  = node('appAw',  'Append', 10, 3, [di(id('appAw:arr'), 'array', 'array'), di(id('appAw:item'), 'item', 'any'), dout(id('appAw:out'), 'out', 'array')])
  const setAw  = node('setAw',  'SetVar', 11, 3, [ei(id('setAw:in')), di(id('setAw:value'), 'value', 'array'), eo(id('setAw:out'))], { name: vAw }, nameTextWidget('name', 'value', vAw))
  const trueSeq = node('trueSeq', 'Sequence', 6, 2, [ei(id('trueSeq:in')), eo(id('trueSeq:a'), 'then 0'), eo(id('trueSeq:b'), 'then 1')])

  // After loop — expose loop vars as outputs.
  const outP  = node('outP',  'GetVar', 12, 0, [dout(id('outP:value'),  'priorities', 'array')], { name: vP },  nameTextWidget('name', 'value', vP))
  const outAw = node('outAw', 'GetVar', 12, 1, [dout(id('outAw:value'), 'awards',     'array')], { name: vAw }, nameTextWidget('name', 'value', vAw))
  const outLo = node('outLo', 'GetVar', 12, 2, [dout(id('outLo:value'), 'leftovers',  'array')], { name: vLo }, nameTextWidget('name', 'value', vLo))

  const nodes: XenolithNodeV1[] = [
    seq, setInitP, emptyAw, setInitAw, emptyLo, setInitLo,
    fe, filt, subsLen, zero, lenCmp, br,
    getLo, appLo, setLo,
    getP1, idxAll, argMax, bestAgent, cost, getP2, oldP, newP, getP3, writeP, setP,
    getAw, appAw, setAw, trueSeq,
    outP, outAw, outLo,
  ]

  const edges: XenolithEdgeV1[] = [
    e(`${prefix}:e0`,  srcs.exec.node, srcs.exec.pin, id('seq'), id('seq:in')),
    e(`${prefix}:e1`,  id('seq'), id('seq:initP'),  id('setInitP'),  id('setInitP:in')),
    e(`${prefix}:e2`,  srcs.priorities.node, srcs.priorities.pin, id('setInitP'), id('setInitP:value')),
    e(`${prefix}:e3`,  id('seq'), id('seq:initAw'), id('setInitAw'), id('setInitAw:in')),
    e(`${prefix}:e4`,  id('emptyAw'), id('emptyAw:out'), id('setInitAw'), id('setInitAw:value')),
    e(`${prefix}:e5`,  id('seq'), id('seq:initLo'), id('setInitLo'), id('setInitLo:in')),
    e(`${prefix}:e6`,  id('emptyLo'), id('emptyLo:out'), id('setInitLo'), id('setInitLo:value')),
    e(`${prefix}:e7`,  id('seq'), id('seq:loop'), id('fe'), id('fe:in')),
    e(`${prefix}:e8`,  srcs.arrivals.node, srcs.arrivals.pin, id('fe'), id('fe:array')),
    e(`${prefix}:e9`,  srcs.subs.node, srcs.subs.pin, id('filt'), id('filt:arr')),
    e(`${prefix}:e10`, id('fe'), id('fe:element'), id('filt'), id('filt:item')),
    e(`${prefix}:e11`, id('filt'), id('filt:out'), id('subsLen'), id('subsLen:arr')),
    e(`${prefix}:e12`, id('subsLen'), id('subsLen:out'), id('lenCmp'), id('lenCmp:a')),
    e(`${prefix}:e13`, id('zero'), id('zero:out'), id('lenCmp'), id('lenCmp:b')),
    e(`${prefix}:e14`, id('fe'), id('fe:body'), id('br'), id('br:in')),
    e(`${prefix}:e15`, id('lenCmp'), id('lenCmp:out'), id('br'), id('br:cond')),
    // branch.false
    e(`${prefix}:e16`, id('br'), id('br:false'), id('setLo'), id('setLo:in')),
    e(`${prefix}:e17`, id('getLo'), id('getLo:value'), id('appLo'), id('appLo:arr')),
    e(`${prefix}:e18`, id('fe'), id('fe:element'), id('appLo'), id('appLo:item')),
    e(`${prefix}:e19`, id('appLo'), id('appLo:out'), id('setLo'), id('setLo:value')),
    // branch.true
    e(`${prefix}:e20`, id('br'), id('br:true'), id('trueSeq'), id('trueSeq:in')),
    e(`${prefix}:e21`, id('trueSeq'), id('trueSeq:a'), id('setP'), id('setP:in')),
    e(`${prefix}:e22`, id('trueSeq'), id('trueSeq:b'), id('setAw'), id('setAw:in')),
    // ArgMax(IndexAll(priorities, subscribers))
    e(`${prefix}:e23`, id('getP1'), id('getP1:value'), id('idxAll'), id('idxAll:arr')),
    e(`${prefix}:e24`, id('filt'),  id('filt:out'),    id('idxAll'), id('idxAll:idxs')),
    e(`${prefix}:e25`, id('idxAll'), id('idxAll:out'), id('argMax'), id('argMax:arr')),
    e(`${prefix}:e26`, id('filt'),   id('filt:out'),   id('bestAgent'), id('bestAgent:arr')),
    e(`${prefix}:e27`, id('argMax'), id('argMax:out'), id('bestAgent'), id('bestAgent:i')),
    // cost = costs[unit]
    e(`${prefix}:e28`, srcs.costs.node, srcs.costs.pin, id('cost'), id('cost:o')),
    e(`${prefix}:e29`, id('fe'), id('fe:element'),     id('cost'), id('cost:k')),
    // oldP = priorities[bestAgent]
    e(`${prefix}:e30`, id('getP2'),     id('getP2:value'), id('oldP'), id('oldP:arr')),
    e(`${prefix}:e31`, id('bestAgent'), id('bestAgent:out'), id('oldP'), id('oldP:i')),
    // newP = oldP - cost
    e(`${prefix}:e32`, id('oldP'), id('oldP:out'), id('newP'), id('newP:a')),
    e(`${prefix}:e33`, id('cost'), id('cost:out'), id('newP'), id('newP:b')),
    // priorities = ArrayWrite(priorities, bestAgent, newP)
    e(`${prefix}:e34`, id('getP3'),     id('getP3:value'), id('writeP'), id('writeP:arr')),
    e(`${prefix}:e35`, id('bestAgent'), id('bestAgent:out'), id('writeP'), id('writeP:i')),
    e(`${prefix}:e36`, id('newP'),      id('newP:out'),    id('writeP'), id('writeP:v')),
    e(`${prefix}:e37`, id('writeP'),    id('writeP:out'),  id('setP'),   id('setP:value')),
    // awards = Append(awards, unit)
    e(`${prefix}:e38`, id('getAw'), id('getAw:value'), id('appAw'), id('appAw:arr')),
    e(`${prefix}:e39`, id('fe'),    id('fe:element'),  id('appAw'), id('appAw:item')),
    e(`${prefix}:e40`, id('appAw'), id('appAw:out'),   id('setAw'), id('setAw:value')),
  ]

  return {
    nodes, edges,
    out: {
      priorities: { node: id('outP'),  pin: id('outP:value') },
      awards:     { node: id('outAw'), pin: id('outAw:value') },
      leftovers:  { node: id('outLo'), pin: id('outLo:value') },
      // The exec point at which all loop work is done — caller wires downstream exec from here.
      exec:       { node: id('seq'),   pin: id('seq:after') },
    },
  }
}
