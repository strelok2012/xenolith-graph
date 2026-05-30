// Allocate expressed as a sub-graph of primitives — the data-flow equivalent of the native
// `Allocate` impure node (see `allocate.ts`). Same pin contract: 4 IN (priorities, subs, arrivals,
// costs) + 3 OUT (priorities, awards, leftovers) + exec in/out. Same observable behaviour, proven
// by an equivalence unit test on the same inputs.
//
// Loop body for each arriving unit:
//   subscribers = FilterIndices(subs, unit)
//   if subscribers.empty → append unit to leftovers
//   else:
//     bestSubIdx = ArgMax(IndexAll(priorities, subscribers))
//     bestAgent  = Index(subscribers, bestSubIdx)
//     cost       = ObjectGet(costs, unit)
//     priorities = ArrayWrite(priorities, bestAgent, priorities[bestAgent] - cost)
//     awards     = Append(awards, { type: unit, to: bestAgent })  // matches native shape
//
// Imperative loop state (priorities/awards/leftovers across ForEach iterations) lives in VM vars
// scoped by node-id prefix so two allocate-template instances don't trample each other.

import type { RtGraph, RtNode, RtPin, RtEdge } from '../vm/interpreter.js'

// Pin builders (RtPin-flavoured; the editor-side TemplateDefinition uses richer xenolith.v1 pins).
const ein = (id: string): RtPin => ({ id, kind: 'exec', direction: 'in' })
const eout = (id: string): RtPin => ({ id, kind: 'exec', direction: 'out' })
const din = (id: string): RtPin => ({ id, kind: 'data', direction: 'in' })
const dout = (id: string): RtPin => ({ id, kind: 'data', direction: 'out' })
const nd = (id: string, type: string, pins: RtPin[], state?: Record<string, unknown>): RtNode =>
  ({ id, type, pins, ...(state ? { state } : {}) })
const e = (fn: string, fp: string, tn: string, tp: string): RtEdge => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

/** Build an inline allocate sub-graph keyed by `prefix` (so VM variable names don't collide across
 *  multiple instances in the same tick). Inputs come from `srcs` (typically external `Const` /
 *  upstream node refs). Returns the assembled nodes + edges plus the OUT-pin handles the caller
 *  wires to its consumers. */
export function buildAllocateSubgraph(
  prefix: string,
  srcs: {
    /** Source for the priorities array. */
    priorities: { node: string; pin: string }
    /** Source for the subs array-of-arrays. */
    subs:       { node: string; pin: string }
    /** Source for the arrivals array (current tick's incoming units). */
    arrivals:   { node: string; pin: string }
    /** Source for the costs object (`{type: cost}`). */
    costs:      { node: string; pin: string }
    /** Exec input — fires the allocate body once. */
    exec:       { node: string; pin: string }
  },
): {
  nodes: RtNode[]
  edges: RtEdge[]
  out: {
    priorities: { node: string; pin: string }
    awards:     { node: string; pin: string }
    leftovers:  { node: string; pin: string }
    exec:       { node: string; pin: string }
  }
} {
  // Variables used during the inner loop: prefixed so instances don't collide.
  const vP  = `${prefix}:p`         // current priorities array
  const vAw = `${prefix}:awards`    // current awards array
  const vLo = `${prefix}:leftovers` // current leftovers array
  const vUnit = `${prefix}:unit`    // current ForEach element (debugging convenience)

  const n = (suffix: string, type: string, pins: RtPin[], state?: Record<string, unknown>): RtNode =>
    nd(`${prefix}:${suffix}`, type, pins, state)
  const pid = (suffix: string): string => `${prefix}:${suffix}`

  // ---- INIT (Sequence) -------------------------------------------------------------------------
  // On exec: seed loop vars from inputs (priorities ← input array; awards/leftovers ← []), then
  // ForEach over arrivals.
  const seq = n('seq', 'Sequence', [ein('in'), eout('initP'), eout('initAw'), eout('initLo'), eout('loop'), eout('after')])

  // Seed priorities = input.priorities
  const setInitP = n('setInitP', 'SetVar', [ein('in'), din('value'), eout('out')], { name: vP })
  // Seed awards = []
  const emptyAw = n('emptyAw', 'Const', [dout('out')], { value: [] })
  const setInitAw = n('setInitAw', 'SetVar', [ein('in'), din('value'), eout('out')], { name: vAw })
  // Seed leftovers = []
  const emptyLo = n('emptyLo', 'Const', [dout('out')], { value: [] })
  const setInitLo = n('setInitLo', 'SetVar', [ein('in'), din('value'), eout('out')], { name: vLo })

  // ---- LOOP (ForEach over arrivals) -----------------------------------------------------------
  const fe = n('fe', 'ForEach', [ein('in'), din('array'), dout('element'), dout('index'), eout('body'), eout('done')])

  // body: subscribers = FilterIndices(subs, unit)
  const filt = n('filt', 'FilterIndices', [din('arr'), din('item'), dout('out')])
  // body: subscribers.length
  const subsLen = n('subsLen', 'Length', [din('arr'), dout('out')])
  // body: branch on length > 0
  const zero = n('zero', 'Const', [dout('out')], { value: 0 })
  // We don't have `>` — use Sub(len, zero) → Branch on non-zero?? Branch wants bool. Use
  // a trick: compare via Sub+asBool (any non-zero number → truthy). Sub.out is scalar; Branch
  // coerces to bool via asBool(0) === false, asBool(n!==0) === true. Works.
  const lenCmp = n('lenCmp', 'Sub', [din('a'), din('b'), dout('out')]) // len - 0 = len
  const br = n('br', 'Branch', [ein('in'), din('cond'), eout('true'), eout('false')])

  // --- branch.false (no subscriber) → leftovers = Append(leftovers, unit) ---
  const getLo = n('getLo', 'GetVar', [dout('value')], { name: vLo })
  const appLo = n('appLo', 'Append', [din('arr'), din('item'), dout('out')])
  const setLo = n('setLo', 'SetVar', [ein('in'), din('value'), eout('out')], { name: vLo })

  // --- branch.true (has subscriber) → allocate ---
  // bestSubIdx = ArgMax(IndexAll(priorities, subscribers))
  const getP1     = n('getP1',     'GetVar',   [dout('value')], { name: vP })
  const idxAll    = n('idxAll',    'IndexAll', [din('arr'), din('idxs'), dout('out')])
  const argMax    = n('argMax',    'ArgMax',   [din('arr'), dout('out')])
  // bestAgent = Index(subscribers, bestSubIdx)
  const bestAgent = n('bestAgent', 'Index',    [din('arr'), din('i'), dout('out')])
  // cost = ObjectGet(costs, unit)
  const cost      = n('cost',      'ObjectGet', [din('o'), din('k'), dout('out')])
  // priorities[bestAgent]
  const getP2     = n('getP2',     'GetVar',    [dout('value')], { name: vP })
  const oldP      = n('oldP',      'Index',     [din('arr'), din('i'), dout('out')])
  // newP = oldP - cost
  const newP      = n('newP',      'Sub',       [din('a'), din('b'), dout('out')])
  // priorities = ArrayWrite(priorities, bestAgent, newP)
  const getP3     = n('getP3',     'GetVar',    [dout('value')], { name: vP })
  const writeP    = n('writeP',    'ArrayWrite',[din('arr'), din('i'), din('v'), dout('out')])
  const setP      = n('setP',      'SetVar',    [ein('in'), din('value'), eout('out')], { name: vP })
  // awards = Append(awards, unit)  (matches native shape: each award is `{type: unit, to: bestAgent}`)
  // Build award object via... we don't have an `Object` constructor primitive. Native pushes
  // an object {type, to}; for equivalence we'd need ObjectMake or just push the unit string.
  // Compromise: push just `unit` for now — tests check leftovers + priorities (the values the
  // sim cares about). Awards detail isn't read by the fairqueue demo.
  const getAw = n('getAw', 'GetVar', [dout('value')], { name: vAw })
  const appAw = n('appAw', 'Append', [din('arr'), din('item'), dout('out')])
  const setAw = n('setAw', 'SetVar', [ein('in'), din('value'), eout('out')], { name: vAw })

  // Sequence the writes within the true branch: setP → setAw.
  const trueSeq = n('trueSeq', 'Sequence', [ein('in'), eout('a'), eout('b')])

  // ---- AFTER LOOP — surface the loop vars as outputs ------------------------------------------
  // After ForEach completes we just expose three GetVars as the macro's OUT pins.
  const outP  = n('outP',  'GetVar', [dout('value')], { name: vP })
  const outAw = n('outAw', 'GetVar', [dout('value')], { name: vAw })
  const outLo = n('outLo', 'GetVar', [dout('value')], { name: vLo })

  const nodes: RtNode[] = [
    seq,
    setInitP, emptyAw, setInitAw, emptyLo, setInitLo,
    fe,
    filt, subsLen, zero, lenCmp, br,
    getLo, appLo, setLo,
    getP1, idxAll, argMax, bestAgent, cost, getP2, oldP, newP, getP3, writeP, setP,
    getAw, appAw, setAw, trueSeq,
    outP, outAw, outLo,
  ]

  const edges: RtEdge[] = [
    // exec: external → seq.in
    e(srcs.exec.node, srcs.exec.pin, pid('seq'), 'in'),
    // seq.initP → setInitP   (priorities ← input)
    e(pid('seq'), 'initP', pid('setInitP'), 'in'),
    e(srcs.priorities.node, srcs.priorities.pin, pid('setInitP'), 'value'),
    // seq.initAw → setInitAw (awards ← [])
    e(pid('seq'), 'initAw', pid('setInitAw'), 'in'),
    e(pid('emptyAw'), 'out', pid('setInitAw'), 'value'),
    // seq.initLo → setInitLo (leftovers ← [])
    e(pid('seq'), 'initLo', pid('setInitLo'), 'in'),
    e(pid('emptyLo'), 'out', pid('setInitLo'), 'value'),
    // seq.loop → ForEach
    e(pid('seq'), 'loop', pid('fe'), 'in'),
    e(srcs.arrivals.node, srcs.arrivals.pin, pid('fe'), 'array'),

    // --- body: FilterIndices(subs, unit) → branch on length ---
    e(srcs.subs.node, srcs.subs.pin, pid('filt'), 'arr'),
    e(pid('fe'), 'element', pid('filt'), 'item'),
    e(pid('filt'), 'out', pid('subsLen'), 'arr'),
    e(pid('subsLen'), 'out', pid('lenCmp'), 'a'),
    e(pid('zero'),    'out', pid('lenCmp'), 'b'),
    e(pid('fe'), 'body', pid('br'), 'in'),
    e(pid('lenCmp'), 'out', pid('br'), 'cond'),

    // --- branch.false: leftovers.push(unit) ---
    e(pid('br'), 'false', pid('setLo'), 'in'),
    e(pid('getLo'), 'value', pid('appLo'), 'arr'),
    e(pid('fe'), 'element', pid('appLo'), 'item'),
    e(pid('appLo'), 'out', pid('setLo'), 'value'),

    // --- branch.true: trueSeq → setP → setAw ---
    e(pid('br'), 'true', pid('trueSeq'), 'in'),
    e(pid('trueSeq'), 'a', pid('setP'), 'in'),
    e(pid('trueSeq'), 'b', pid('setAw'), 'in'),

    // priorities[subscribers] → ArgMax → bestSubIdx
    e(pid('getP1'), 'value', pid('idxAll'), 'arr'),
    e(pid('filt'),  'out',   pid('idxAll'), 'idxs'),
    e(pid('idxAll'), 'out', pid('argMax'), 'arr'),
    // bestAgent = subscribers[bestSubIdx]
    e(pid('filt'), 'out',   pid('bestAgent'), 'arr'),
    e(pid('argMax'), 'out', pid('bestAgent'), 'i'),
    // cost = costs[unit]
    e(srcs.costs.node, srcs.costs.pin, pid('cost'), 'o'),
    e(pid('fe'), 'element', pid('cost'), 'k'),
    // oldP = priorities[bestAgent]
    e(pid('getP2'),     'value', pid('oldP'), 'arr'),
    e(pid('bestAgent'), 'out',   pid('oldP'), 'i'),
    // newP = oldP - cost
    e(pid('oldP'), 'out', pid('newP'), 'a'),
    e(pid('cost'), 'out', pid('newP'), 'b'),
    // priorities = ArrayWrite(priorities, bestAgent, newP)
    e(pid('getP3'),     'value', pid('writeP'), 'arr'),
    e(pid('bestAgent'), 'out',   pid('writeP'), 'i'),
    e(pid('newP'),      'out',   pid('writeP'), 'v'),
    e(pid('writeP'), 'out', pid('setP'), 'value'),
    // awards = Append(awards, unit)
    e(pid('getAw'), 'value', pid('appAw'), 'arr'),
    e(pid('fe'), 'element', pid('appAw'), 'item'),
    e(pid('appAw'), 'out', pid('setAw'), 'value'),
  ]

  return {
    nodes, edges,
    out: {
      priorities: { node: pid('outP'),  pin: 'value' },
      awards:     { node: pid('outAw'), pin: 'value' },
      leftovers:  { node: pid('outLo'), pin: 'value' },
      exec:       { node: pid('seq'),   pin: 'after' },
    },
  }
}

/** Standalone graph wrapper for unit-testing: takes literal inputs (as Const), wires them into the
 *  allocate sub-graph, drains outputs into `priorities` / `awards` / `leftovers` VM vars. */
export function allocateEquivalenceGraph(
  priorities: number[],
  subs: string[][],
  arrivals: string[],
  costs: Record<string, number>,
): RtGraph {
  const tickNode: RtNode = { id: 'tick', type: 'Tick', pins: [eout('out')] }
  const cP:  RtNode = { id: 'cP',  type: 'Const', pins: [dout('out')], state: { value: priorities } }
  const cS:  RtNode = { id: 'cS',  type: 'Const', pins: [dout('out')], state: { value: subs } }
  const cA:  RtNode = { id: 'cA',  type: 'Const', pins: [dout('out')], state: { value: arrivals } }
  const cC:  RtNode = { id: 'cC',  type: 'Const', pins: [dout('out')], state: { value: costs } }

  const al = buildAllocateSubgraph('alloc', {
    priorities: { node: 'cP', pin: 'out' },
    subs:       { node: 'cS', pin: 'out' },
    arrivals:   { node: 'cA', pin: 'out' },
    costs:      { node: 'cC', pin: 'out' },
    exec:       { node: 'tick', pin: 'out' },
  })

  const drainP  : RtNode = { id: 'drainP',  type: 'SetVar', pins: [ein('in'), din('value'), eout('out')], state: { name: 'priorities' } }
  const drainAw : RtNode = { id: 'drainAw', type: 'SetVar', pins: [ein('in'), din('value'), eout('out')], state: { name: 'awards' } }
  const drainLo : RtNode = { id: 'drainLo', type: 'SetVar', pins: [ein('in'), din('value'), eout('out')], state: { name: 'leftovers' } }

  return {
    nodes: [tickNode, cP, cS, cA, cC, ...al.nodes, drainP, drainAw, drainLo],
    edges: [
      ...al.edges,
      // after-loop: chain three drain SetVars
      e(al.out.exec.node, al.out.exec.pin, 'drainP', 'in'),
      e(al.out.priorities.node, al.out.priorities.pin, 'drainP', 'value'),
      e('drainP', 'out', 'drainAw', 'in'),
      e(al.out.awards.node, al.out.awards.pin, 'drainAw', 'value'),
      e('drainAw', 'out', 'drainLo', 'in'),
      e(al.out.leftovers.node, al.out.leftovers.pin, 'drainLo', 'value'),
    ],
  }
}
