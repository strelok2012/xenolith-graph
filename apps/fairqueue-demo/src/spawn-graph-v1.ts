// V1-graph version of `buildSpawnSubgraph` (plugin-runtime/src/model/spawn-graph.ts is RtNode-flavoured).
// Same topology, same VM behaviour — but emits XenolithNodeV1 / XenolithEdgeV1 so it can be dropped
// into `fairqueueMergedGraph` (replacing the native `Spawn` verb).

import type { XenolithNodeV1, XenolithEdgeV1, XenolithPinV1, WidgetSpec } from '@xenolith/editor'

const ei = (id: string, label = ''): XenolithPinV1 => ({ id, kind: 'exec', direction: 'in',  type: 'exec', multiple: false, label })
const eo = (id: string, label = ''): XenolithPinV1 => ({ id, kind: 'exec', direction: 'out', type: 'exec', multiple: false, label })
const di = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'in',  type, multiple: false, label })
const dout = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'out', type, multiple: true, label })

const TITLES: Record<string, string> = {
  Sequence: 'Sequence', ForEach: 'For Each',
  GetVar: 'Get Variable', SetVar: 'Set Variable', Const: 'Const',
  Add: 'Add', Sub: 'Subtract', Floor: 'Floor', Repeat: 'Repeat', Concat: 'Concat',
  GetField: 'Get Field', ObjectGet: 'Object Get', ObjectSet: 'Object Set',
}
const CATS: Record<string, string> = {
  Sequence: 'flow', ForEach: 'flow',
  GetVar: 'state', SetVar: 'state', Const: 'state',
  Add: 'math', Sub: 'math', Floor: 'math',
  Repeat: 'array', Concat: 'array', GetField: 'array', ObjectGet: 'array', ObjectSet: 'array',
}
const e = (id: string, fn: string, fp: string, tn: string, tp: string): XenolithEdgeV1 =>
  ({ id, from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

const nameWidget = (pinKey: string): WidgetSpec[] => [{ id: 'name',  type: 'text',   key: 'name',  label: '', pinKey, visibility: 'always' }]
const fieldWidget = (pinKey: string): WidgetSpec[] => [{ id: 'field', type: 'text',  key: 'field', label: '', pinKey, visibility: 'always' }]

/** Spawn sub-graph as a V1 node/edge bundle. Per-type fractional rate accumulator stored in VM
 *  vars `${prefix}:acc` (object) and `${prefix}:units` (this-tick array). One tick:
 *  - units ← []
 *  - For each spec: emitCount = floor(acc[type] + rate); acc[type] = (acc+rate)−emitCount;
 *                   units += repeat(type, emitCount)
 *  - emit units, exec-out. */
export function buildSpawnSubgraphV1(
  prefix: string,
  originX: number,
  originY: number,
  srcs: { specs: { node: string; pin: string }; exec: { node: string; pin: string } },
): {
  nodes: XenolithNodeV1[]
  edges: XenolithEdgeV1[]
  out: { units: { node: string; pin: string }; exec: { node: string; pin: string } }
} {
  const id = (s: string): string => `${prefix}:${s}`
  const vAcc   = `${prefix}:acc`
  const vUnits = `${prefix}:units`

  const place = (col: number, row: number): { x: number; y: number } => ({ x: originX + col * 220, y: originY + row * 110 })

  const n = (
    suffix: string, type: string, col: number, row: number, pins: XenolithPinV1[],
    state?: Record<string, unknown>, widgets?: WidgetSpec[],
  ): XenolithNodeV1 => {
    const out: XenolithNodeV1 = {
      id: id(suffix), type, position: place(col, row),
      render: { title: TITLES[type] ?? type, category: CATS[type] ?? 'array' }, pins,
    }
    if (state)   out.state = state
    if (widgets) (out as { widgets?: WidgetSpec[] }).widgets = widgets
    return out
  }

  // INIT: units ← []; acc kept cross-tick (default {}).
  const seq      = n('seq',      'Sequence', 0, 0, [ei(id('seq:in')), eo(id('seq:initU')), eo(id('seq:loop')), eo(id('seq:after'))])
  const emptyU   = n('emptyU',   'Const',    0, 1, [dout(id('emptyU:out'), 'value', 'array')], { value: [], name: 'empty' }, [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: id('emptyU:out'), visibility: 'always' }])
  const setInitU = n('setInitU', 'SetVar',   1, 0, [ei(id('setInitU:in')), di(id('setInitU:value'), 'value', 'array'), eo(id('setInitU:out'))], { name: vUnits }, nameWidget(id('setInitU:value')))

  // LOOP per spec
  const fe = n('fe', 'ForEach', 1, 2, [ei(id('fe:in')), di(id('fe:array'), 'array', 'array'), dout(id('fe:element'), 'element', 'object'), dout(id('fe:index'), 'index', 'scalar'), eo(id('fe:body')), eo(id('fe:done'))])

  const getType = n('getType', 'GetField', 2, 1, [di(id('getType:rec'), 'record', 'object'), dout(id('getType:out'), 'value', 'string')], { field: 'type' }, fieldWidget(id('getType:rec')))
  const getRate = n('getRate', 'GetField', 2, 2, [di(id('getRate:rec'), 'record', 'object'), dout(id('getRate:out'), 'value', 'scalar')], { field: 'rate' }, fieldWidget(id('getRate:rec')))

  const getAcc = n('getAcc', 'GetVar', 2, 3, [dout(id('getAcc:out'), 'value', 'object')], { name: vAcc }, nameWidget(id('getAcc:out')))
  const oldA   = n('oldA',   'ObjectGet', 3, 1, [di(id('oldA:o'), 'object', 'object'), di(id('oldA:k'), 'key', 'string'), dout(id('oldA:out'), 'value', 'scalar')])
  const newA      = n('newA',      'Add',   3, 2, [di(id('newA:a'), 'a', 'scalar'), di(id('newA:b'), 'b', 'scalar'), dout(id('newA:out'), 'out', 'scalar')])
  const emitCount = n('emitCount', 'Floor', 4, 2, [di(id('emitCount:n'), 'n', 'scalar'), dout(id('emitCount:out'), 'out', 'scalar')])
  const accAfter  = n('accAfter',  'Sub',   4, 3, [di(id('accAfter:a'), 'a', 'scalar'), di(id('accAfter:b'), 'b', 'scalar'), dout(id('accAfter:out'), 'out', 'scalar')])

  const repeat = n('repeat', 'Repeat', 5, 1, [di(id('repeat:i'), 'item', 'object'), di(id('repeat:c'), 'count', 'scalar'), dout(id('repeat:out'), 'out', 'array')])
  const getU   = n('getU',   'GetVar', 5, 0, [dout(id('getU:out'), 'value', 'array')], { name: vUnits }, nameWidget(id('getU:out')))
  const conc   = n('conc',   'Concat', 6, 0, [di(id('conc:a'), 'a', 'array'), di(id('conc:b'), 'b', 'array'), dout(id('conc:out'), 'out', 'array')])
  const setU   = n('setU',   'SetVar', 7, 0, [ei(id('setU:in')), di(id('setU:value'), 'value', 'array'), eo(id('setU:out'))], { name: vUnits }, nameWidget(id('setU:value')))

  const getAcc2 = n('getAcc2', 'GetVar',    5, 3, [dout(id('getAcc2:out'), 'value', 'object')], { name: vAcc }, nameWidget(id('getAcc2:out')))
  const setObj  = n('setObj',  'ObjectSet', 6, 3, [di(id('setObj:o'), 'object', 'object'), di(id('setObj:k'), 'key', 'string'), di(id('setObj:v'), 'value', 'scalar'), dout(id('setObj:out'), 'out', 'object')])
  const setAcc  = n('setAcc',  'SetVar',    7, 3, [ei(id('setAcc:in')), di(id('setAcc:value'), 'value', 'object'), eo(id('setAcc:out'))], { name: vAcc }, nameWidget(id('setAcc:value')))

  const bodySeq = n('bodySeq', 'Sequence', 2, 0, [ei(id('bodySeq:in')), eo(id('bodySeq:a')), eo(id('bodySeq:b'))])
  const outU    = n('outU', 'GetVar', 8, 0, [dout(id('outU:out'), 'units', 'array')], { name: vUnits }, nameWidget(id('outU:out')))

  const nodes: XenolithNodeV1[] = [
    seq, emptyU, setInitU, fe,
    getType, getRate, getAcc, oldA, newA, emitCount, accAfter,
    repeat, getU, conc, setU,
    getAcc2, setObj, setAcc, bodySeq, outU,
  ]
  const edges: XenolithEdgeV1[] = [
    e(`${prefix}:eExec`, srcs.exec.node, srcs.exec.pin, id('seq'), id('seq:in')),
    e(`${prefix}:e1`,  id('seq'), id('seq:initU'),     id('setInitU'), id('setInitU:in')),
    e(`${prefix}:e2`,  id('emptyU'), id('emptyU:out'), id('setInitU'), id('setInitU:value')),
    e(`${prefix}:e3`,  id('seq'), id('seq:loop'),      id('fe'), id('fe:in')),
    e(`${prefix}:e4`,  srcs.specs.node, srcs.specs.pin, id('fe'), id('fe:array')),

    e(`${prefix}:e5`,  id('fe'), id('fe:body'),    id('bodySeq'), id('bodySeq:in')),
    e(`${prefix}:e6`,  id('bodySeq'), id('bodySeq:a'), id('setU'),   id('setU:in')),
    e(`${prefix}:e7`,  id('bodySeq'), id('bodySeq:b'), id('setAcc'), id('setAcc:in')),

    e(`${prefix}:e8`,  id('fe'), id('fe:element'), id('getType'), id('getType:rec')),
    e(`${prefix}:e9`,  id('fe'), id('fe:element'), id('getRate'), id('getRate:rec')),

    e(`${prefix}:e10`, id('getAcc'),  id('getAcc:out'),  id('oldA'), id('oldA:o')),
    e(`${prefix}:e11`, id('getType'), id('getType:out'), id('oldA'), id('oldA:k')),

    e(`${prefix}:e12`, id('oldA'),    id('oldA:out'),    id('newA'), id('newA:a')),
    e(`${prefix}:e13`, id('getRate'), id('getRate:out'), id('newA'), id('newA:b')),

    e(`${prefix}:e14`, id('newA'),      id('newA:out'),      id('emitCount'), id('emitCount:n')),
    e(`${prefix}:e15`, id('newA'),      id('newA:out'),      id('accAfter'),  id('accAfter:a')),
    e(`${prefix}:e16`, id('emitCount'), id('emitCount:out'), id('accAfter'),  id('accAfter:b')),

    e(`${prefix}:e17`, id('getType'),   id('getType:out'),   id('repeat'), id('repeat:i')),
    e(`${prefix}:e18`, id('emitCount'), id('emitCount:out'), id('repeat'), id('repeat:c')),
    e(`${prefix}:e19`, id('getU'),      id('getU:out'),      id('conc'),   id('conc:a')),
    e(`${prefix}:e20`, id('repeat'),    id('repeat:out'),    id('conc'),   id('conc:b')),
    e(`${prefix}:e21`, id('conc'),      id('conc:out'),      id('setU'),   id('setU:value')),

    e(`${prefix}:e22`, id('getAcc2'), id('getAcc2:out'), id('setObj'), id('setObj:o')),
    e(`${prefix}:e23`, id('getType'), id('getType:out'), id('setObj'), id('setObj:k')),
    e(`${prefix}:e24`, id('accAfter'),id('accAfter:out'),id('setObj'), id('setObj:v')),
    e(`${prefix}:e25`, id('setObj'),  id('setObj:out'),  id('setAcc'), id('setAcc:value')),
  ]

  return {
    nodes, edges,
    out: {
      units: { node: id('outU'), pin: id('outU:out') },
      exec:  { node: id('seq'),  pin: id('seq:after') },
    },
  }
}
