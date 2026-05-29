// The fairqueue model expressed as a @xenolith/plugin-runtime graph (generic primitives + the one
// Allocate verb). State lives in variables (parallel arrays): priorities, salaries, subs, costs,
// arrivals, alpha. One tick:
//   priorities = ScaleArray( Allocate( ZipAdd(priorities, salaries), subs, arrivals, costs ), 1 - alpha )
// i.e. salary (additive) → allocate (cost subtract to top subscriber) → tax (multiply toward 0).
// Proven == the native step() in fairqueue.ts (runtime-graph.test.ts).
//
// Nodes are titled by their PRIMITIVE TYPE (uniform — they ARE the same generic nodes); the meaning
// of each phase lives in COMMENT groups, and the variable each Get/Set touches is a `name` widget —
// NOT a bespoke per-node title. Returns a full xenolith.v1 graph (positions / render / categories /
// comments) that is also structurally a valid RtGraph, so one builder serves headless + rendered.

import { BUILTIN_PRIMITIVES, COLLECTION_PRIMITIVES, Allocate, PRIMITIVE_CATEGORY_COLORS, PRIMITIVE_ICONS, PRIMITIVE_SCHEMAS, type NodeDef } from '@xenolith/plugin-runtime'
import type { XenolithGraphV1, XenolithNodeV1, XenolithPinV1, XenolithEdgeV1, XenolithCommentV1, WidgetSpec } from '@xenolith/editor'
import type { Agent, GoodieSpec } from './fairqueue.js'
import { AGENT_WIDGETS, GOODIE_WIDGETS, CATEGORY_COLORS } from './sim-to-graph.js'

export const FAIRQUEUE_DEFS: NodeDef[] = [...BUILTIN_PRIMITIVES, Allocate]
/** Full def set incl. the Gather/Scatter collection bridge — used by the merged graph. */
export const MERGED_DEFS: NodeDef[] = [...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES, Allocate]
/** Category palette merged: runtime primitive categories + the domain agent/goodie/warehouse colours. */
export const MERGED_CATEGORY_COLORS = { ...PRIMITIVE_CATEGORY_COLORS, ...CATEGORY_COLORS }

// exec pins are the arrow glyph — no text label (UE-style); the shape says "control flow".
const ei = (id: string): XenolithPinV1 => ({ id, kind: 'exec', direction: 'in', type: 'exec', multiple: false, label: '' })
const eo = (id: string, _label = ''): XenolithPinV1 => ({ id, kind: 'exec', direction: 'out', type: 'exec', multiple: false, label: '' })
const di = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'in', type, multiple: false, label })
const dout = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'out', type, multiple: true, label })
// Title is ALWAYS taken from the registered NodeSchema for that type — never per-instance custom.
// (Avoids "Gather priority"/"Map Field salary"-style cosmetic renames; the type identifies the node,
// widgets identify the instance.)
const titleFor = (type: string): string => PRIMITIVE_SCHEMAS.find((s) => s.type === type)?.title ?? type
const node = (id: string, type: string, x: number, y: number, _title: string, category: string, pins: XenolithPinV1[], state?: Record<string, unknown>, widgets?: WidgetSpec[]): XenolithNodeV1 =>
  ({ id, type, position: { x, y }, render: { title: titleFor(type), category }, pins, ...(state ? { state } : {}), ...(widgets ? { widgets } : {}) })
const nameWidget: WidgetSpec[] = [{ id: 'name', type: 'text', key: 'name', label: 'name' }]
const getVar = (id: string, x: number, y: number, name: string, type: string): XenolithNodeV1 =>
  node(id, 'GetVar', x, y, 'Get Variable', 'state', [dout(`${id}:value`, name, type)], { name }, nameWidget)
const setVar = (id: string, x: number, y: number, name: string): XenolithNodeV1 =>
  node(id, 'SetVar', x, y, 'Set Variable', 'state', [ei(`${id}:in`), di(`${id}:value`, 'value', 'array'), eo(`${id}:out`, 'out')], { name }, nameWidget)
const e = (eid: string, fn: string, fp: string, tn: string, tp: string): XenolithEdgeV1 =>
  ({ id: eid, from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })
const comment = (id: string, x: number, y: number, w: number, h: number, text: string, color: string): XenolithCommentV1 =>
  ({ id, position: { x, y }, size: { x: w, y: h }, text, color })

export function fairqueueStepGraph(): XenolithGraphV1 {
  const nodes: XenolithNodeV1[] = [
    // inputs column (x = 0) — Get reads a VM variable; Const is a literal
    getVar('getP', 0, 0, 'priorities', 'array'),
    getVar('getSal', 0, 120, 'salaries', 'array'),
    getVar('getSubs', 0, 300, 'subs', 'array'),
    getVar('getArr', 0, 420, 'arrivals', 'array'),
    getVar('getCosts', 0, 540, 'costs', 'object'),
    getVar('getAlpha', 0, 720, 'alpha', 'scalar'),
    node('one', 'Const', 0, 840, 'Const', 'state', [dout('one:out', 'out', 'scalar')], { value: 1 }, [{ id: 'value', type: 'number', key: 'value', label: 'value' }]),
    // per-step math
    node('zip', 'ZipAdd', 300, 40, 'Zip Add', 'array', [di('zip:a', 'a', 'array'), di('zip:b', 'b', 'array'), dout('zip:out', 'out', 'array')]),
    node('gain', 'Sub', 300, 760, 'Subtract', 'math', [di('gain:a', 'a', 'scalar'), di('gain:b', 'b', 'scalar'), dout('gain:out', 'out', 'scalar')]),
    // allocate
    node('tick', 'Tick', 600, 150, 'Tick', 'flow', [eo('tick:out', 'out')]),
    node('alloc', 'Allocate', 600, 290, 'Allocate', 'domain', [
      ei('alloc:in'), di('alloc:p', 'priorities', 'array'), di('alloc:subs', 'subs', 'array'), di('alloc:arr', 'arrivals', 'array'), di('alloc:costs', 'costs', 'object'),
      dout('alloc:priorities', 'priorities', 'array'), dout('alloc:awards', 'awards', 'array'), dout('alloc:leftovers', 'leftovers', 'array'), eo('alloc:out', 'out'),
    ]),
    // tax
    node('scale', 'ScaleArray', 900, 320, 'Scale Array', 'array', [di('scale:array', 'array', 'array'), di('scale:k', 'k', 'scalar'), dout('scale:out', 'out', 'array')]),
    // commit — three independent writes, just chained in order (no conditions / fan-out)
    setVar('setP', 1180, 40, 'priorities'),
    setVar('setAw', 1180, 220, 'awards'),
    setVar('setLo', 1180, 400, 'leftovers'),
  ]
  const edges: XenolithEdgeV1[] = [
    e('t', 'tick', 'tick:out', 'alloc', 'alloc:in'),
    e('p', 'getP', 'getP:value', 'zip', 'zip:a'),
    e('s', 'getSal', 'getSal:value', 'zip', 'zip:b'),
    e('zp', 'zip', 'zip:out', 'alloc', 'alloc:p'),
    e('su', 'getSubs', 'getSubs:value', 'alloc', 'alloc:subs'),
    e('ar', 'getArr', 'getArr:value', 'alloc', 'alloc:arr'),
    e('co', 'getCosts', 'getCosts:value', 'alloc', 'alloc:costs'),
    e('o', 'one', 'one:out', 'gain', 'gain:a'),
    e('al', 'getAlpha', 'getAlpha:value', 'gain', 'gain:b'),
    e('ap', 'alloc', 'alloc:priorities', 'scale', 'scale:array'),
    e('gk', 'gain', 'gain:out', 'scale', 'scale:k'),
    // exec chain: Allocate → Set priorities → Set awards → Set leftovers (order is cosmetic; the
    // three writes are independent — chained, not branched).
    e('c0', 'alloc', 'alloc:out', 'setP', 'setP:in'),
    e('c1', 'setP', 'setP:out', 'setAw', 'setAw:in'),
    e('c2', 'setAw', 'setAw:out', 'setLo', 'setLo:in'),
    // data into each Set
    e('sp', 'scale', 'scale:out', 'setP', 'setP:value'),
    e('aw', 'alloc', 'alloc:awards', 'setAw', 'setAw:value'),
    e('lo', 'alloc', 'alloc:leftovers', 'setLo', 'setLo:value'),
  ]
  const comments: XenolithCommentV1[] = [
    comment('cIn', -30, -50, 250, 1010, 'Inputs · Get reads VM variables', '#2C3A5A'),
    comment('cMath', 270, -10, 250, 920, 'Per-step math', '#244035'),
    comment('cAlloc', 560, 110, 260, 360, 'Allocate · unit → top subscriber, −cost', '#4A3A18'),
    comment('cTax', 860, 280, 230, 170, 'Tax · × (1 − α)', '#1F3A48'),
    comment('cCommit', 1140, -30, 420, 560, 'Commit · Set writes VM variables (chained, in order)', '#2C3A5A'),
  ]
  return { version: 'xenolith.v1', categories: PRIMITIVE_CATEGORY_COLORS, nodes, edges, comments }
}

// ---- visible-inputs variant for the `?engine=compute` view --------------------------------------
// Same algorithm, but the STATIC inputs live in the graph as Const data nodes (no host-seeding):
// `alpha` is an editable number; `salaries`/`subs`/`costs` hold their value (labelled via `name`).
// `priorities` stays a Get/Set feedback variable (evolving state); `arrivals` stays a Get var fed
// by the host each tick (spawn). The data nodes ARE the agents/goodies data — there is no separate
// "domain": this is the same data, in array form.
const labelWidget: WidgetSpec[] = [{ id: 'name', type: 'text', key: 'name', label: 'holds' }]
const numWidget: WidgetSpec[] = [{ id: 'value', type: 'number', key: 'value', label: 'value' }]
const dataConst = (id: string, x: number, y: number, label: string, value: unknown, type: string): XenolithNodeV1 =>
  node(id, 'Const', x, y, 'Const', 'state', [dout(`${id}:out`, label, type)], { value, name: label }, labelWidget)

export function fairqueueComputeGraph(agents: Agent[], goodies: GoodieSpec[]): XenolithGraphV1 {
  const nodes: XenolithNodeV1[] = [
    // INIT: seed initial priorities ONCE (run via tick(graph,'Init')) — nothing host-seeded
    node('init', 'Init', -610, -306, 'Init', 'flow', [eo('init:out')]),
    dataConst('initP', -608, -200, 'initial', agents.map(() => 0), 'array'),
    setVar('setInitP', -240, -256, 'priorities'),
    // STATE: priorities feeds back via Set/Get
    getVar('getP', -421, 23, 'priorities', 'array'),
    // SPAWN: arrivals produced IN the graph from per-goodie {type,rate}
    dataConst('rates', -216, 136, 'rates', goodies.map((g) => ({ type: g.type, rate: g.rate })), 'array'),
    node('tick', 'Tick', 32, 0, 'Tick', 'flow', [eo('tick:out')]),
    node('spawn', 'Spawn', 248, 120, 'Spawn', 'domain', [ei('spawn:in'), di('spawn:specs', 'specs', 'array'), dout('spawn:units', 'units', 'array'), eo('spawn:out')]),
    // STATIC INPUTS: data nodes IN the graph (agents'/goodies' data, in array form)
    dataConst('salaries', -416, 176, 'salaries', agents.map((a) => a.salary), 'array'),
    dataConst('subs', -216, 280, 'subs', agents.map((a) => a.subscriptions), 'array'),
    dataConst('costs', -416, 320, 'costs', Object.fromEntries(goodies.map((g) => [g.type, g.cost])), 'object'),
    // tax-factor group members "1 − α": one (top-left) + alpha (bottom-left) + Subtract (right),
    // laid out compactly below the inputs column. createMacroFromSelection collapses them in place.
    node('one', 'Const', -416, 600, 'Const', 'state', [dout('one:out', 'one', 'scalar')], { value: 1 }, numWidget),
    node('alpha', 'Const', -416, 760, 'Const', 'state', [dout('alpha:out', 'alpha', 'scalar')], { value: 0.1 }, numWidget),
    node('gain', 'Sub', -180, 680, 'Subtract', 'math', [di('gain:a', 'a', 'scalar'), di('gain:b', 'b', 'scalar'), dout('gain:out', 'out', 'scalar')]),
    // ALGORITHM
    node('zip', 'ZipAdd', 488, 320, 'Zip Add', 'array', [di('zip:a', 'a', 'array'), di('zip:b', 'b', 'array'), dout('zip:out', 'out', 'array')]),
    node('alloc', 'Allocate', 696, 96, 'Allocate', 'domain', [
      ei('alloc:in'), di('alloc:p', 'priorities', 'array'), di('alloc:subs', 'subs', 'array'), di('alloc:arr', 'arrivals', 'array'), di('alloc:costs', 'costs', 'object'),
      dout('alloc:priorities', 'priorities', 'array'), dout('alloc:awards', 'awards', 'array'), dout('alloc:leftovers', 'leftovers', 'array'), eo('alloc:out'),
    ]),
    node('scale', 'ScaleArray', 928, 376, 'Scale Array', 'array', [di('scale:array', 'array', 'array'), di('scale:k', 'k', 'scalar'), dout('scale:out', 'out', 'array')]),
    // COMMIT: chained Set writes
    setVar('setP', 1320, 60, 'priorities'),
    setVar('setAw', 1512, 240, 'awards'),
    setVar('setLo', 1712, 400, 'leftovers'),
  ]
  const edges: XenolithEdgeV1[] = [
    // init flow: seed priorities once
    e('i0', 'init', 'init:out', 'setInitP', 'setInitP:in'),
    e('i1', 'initP', 'initP:out', 'setInitP', 'setInitP:value'),
    // data
    e('p', 'getP', 'getP:value', 'zip', 'zip:a'),
    e('s', 'salaries', 'salaries:out', 'zip', 'zip:b'),
    e('zp', 'zip', 'zip:out', 'alloc', 'alloc:p'),
    e('su', 'subs', 'subs:out', 'alloc', 'alloc:subs'),
    e('rs', 'rates', 'rates:out', 'spawn', 'spawn:specs'),
    e('ar', 'spawn', 'spawn:units', 'alloc', 'alloc:arr'), // arrivals come from Spawn
    e('co', 'costs', 'costs:out', 'alloc', 'alloc:costs'),
    e('o', 'one', 'one:out', 'gain', 'gain:a'),
    e('al', 'alpha', 'alpha:out', 'gain', 'gain:b'),
    e('ap', 'alloc', 'alloc:priorities', 'scale', 'scale:array'),
    e('gk', 'gain', 'gain:out', 'scale', 'scale:k'),
    // per-tick exec: Tick → Spawn → Allocate → Set priorities → Set awards → Set leftovers
    e('t', 'tick', 'tick:out', 'spawn', 'spawn:in'),
    e('ts', 'spawn', 'spawn:out', 'alloc', 'alloc:in'),
    e('c0', 'alloc', 'alloc:out', 'setP', 'setP:in'),
    e('c1', 'setP', 'setP:out', 'setAw', 'setAw:in'),
    e('c2', 'setAw', 'setAw:out', 'setLo', 'setLo:in'),
    e('sp', 'scale', 'scale:out', 'setP', 'setP:value'),
    e('aw', 'alloc', 'alloc:awards', 'setAw', 'setAw:value'),
    e('lo', 'alloc', 'alloc:leftovers', 'setLo', 'setLo:value'),
  ]
  for (const nd of nodes) nd.glyph = { icon: PRIMITIVE_ICONS[nd.type] ?? 'circle', side: 'left' }
  const comments: XenolithCommentV1[] = [
    comment('cInit', -640, -356, 332, 291, 'Init · seed priorities once (no host seeding)', '#3A2C5A'),
    comment('cInputs', -451, -27, 445, 730, 'Inputs · data nodes (state, spawn rates, agents/goodies)', '#244035'),
    comment('cAlgo', 470, -90, 711, 598, 'Algorithm · salary → Spawn → Allocate → tax', '#4A3A18'),
    comment('cCommit', 1290, 10, 613, 570, 'Commit · Set writes VM variables (chained)', '#2C3A5A'),
  ]
  return { version: 'xenolith.v1', categories: PRIMITIVE_CATEGORY_COLORS, nodes, edges, comments }
}

// ---- MERGED graph: agents & goodies are REAL editable nodes ------------------------------------
// The payoff. Agent/Goodie are pinless DATA nodes (priority-bar + salary; cost + rate); `Gather`
// scans them by type (no wires needed), so adding a node via Tab auto-joins the sim. The algorithm
// is the same salary→Spawn→Allocate→tax. `Scatter Agent.priority` publishes results for the host to
// write back onto each agent's bar. Subscriptions live in each agent's `state.subs` (baked for now).

const agentSelfPin = (id: string) => dout(`${id}:self`, 'self', 'agent')
const agentPriorityPin = (id: string): XenolithPinV1 => ({ id: `${id}:priority`, kind: 'data', direction: 'in', type: 'scalar', multiple: false, label: 'priority' })
const goodieSelfPin = (id: string) => dout(`${id}:self`, 'self', 'goodie-rec')

export function fairqueueMergedGraph(agents: Agent[], goodies: GoodieSpec[]): XenolithGraphV1 {
  // Agent/Goodie nodes carry the canonical type title ("Agent"/"Goodie"); the per-instance NAME is
  // a widget value (`state.name`) — same as Set/Get Variable. So the type identifies the node, the
  // widget identifies the instance — no per-instance custom titles.
  const agentNodes: XenolithNodeV1[] = agents.map((a, i) =>
    node(a.id, 'Agent', -980, -320 + i * 150, 'Agent', 'agent', [agentSelfPin(a.id), agentPriorityPin(a.id)],
      { name: a.id, priority: 0, salary: a.salary, subs: a.subscriptions }, AGENT_WIDGETS))
  const goodieNodes: XenolithNodeV1[] = goodies.map((g, i) =>
    node(`goodie:${g.type}`, 'Goodie', -980, 620 + i * 150, 'Goodie', 'goodie', [goodieSelfPin(`goodie:${g.type}`)],
      { name: g.type, type: g.type, cost: g.cost, rate: g.rate }, GOODIE_WIDGETS))

  // Scatter has one data-out per agent (declaration order matches agents[]). Each connects back to
  // the corresponding Agent.priority — visible feedback wires.
  // Scatter has one anonymous data-out per consumer wire (just "o0", "o1", …). It DOESN'T know
  // anything about agent names — i-th output goes to whoever connects to it (in graph order).
  const scatterOuts: XenolithPinV1[] = agents.map((_a, i) => dout(`scatter:o${i}`, `o${i}`, 'scalar'))
  const rest: XenolithNodeV1[] = [
    // Wire-driven gathers: generic — pin labels are `items` (in) and `values` (out). The `items`
    // pin is MULTI-INPUT (one wire per source node) — this is the whole point of GatherFromInputs.
    node('gAgents', 'GatherFromInputs', -640, -150, '', 'domain', [
      { id: 'gAgents:items', kind: 'data', direction: 'in', type: 'agent', multiple: true, label: 'items' },
      dout('gAgents:out', 'values', 'array'),
    ]),
    node('gGoodies', 'GatherFromInputs', -640, 700, '', 'domain', [
      { id: 'gGoodies:items', kind: 'data', direction: 'in', type: 'goodie-rec', multiple: true, label: 'items' },
      dout('gGoodies:out', 'values', 'array'),
    ]),
    // Pick fields out of agent records → arrays the algorithm uses. Generic MapField node; the
    // field name lives in the `field` widget so the node title says WHAT (Map Field), not WHICH.
    node('mPri', 'MapField', -380, -300, 'Map Field', 'array', [di('mPri:in', 'records', 'array'), dout('mPri:out', 'values', 'array')], { field: 'priority' }, [{ id: 'field', type: 'text', key: 'field', label: 'field' }]),
    node('mSal', 'MapField', -380, -150, 'Map Field', 'array', [di('mSal:in', 'records', 'array'), dout('mSal:out', 'values', 'array')], { field: 'salary' }, [{ id: 'field', type: 'text', key: 'field', label: 'field' }]),
    node('mSub', 'MapField', -380, 0, 'Map Field', 'array', [di('mSub:in', 'records', 'array'), dout('mSub:out', 'values', 'array')], { field: 'subs' }, [{ id: 'field', type: 'text', key: 'field', label: 'field' }]),
    // Goodies stay record-shaped (Spawn already wants {type,rate}, ToMap wants {type,cost}).
    node('toMap', 'ToMap', -380, 760, 'To Map', 'array', [di('toMap:in', 'records', 'array'), dout('toMap:out', 'map', 'object')], { key: 'type', value: 'cost' }),
    node('one', 'Const', -640, 300, 'Const', 'state', [dout('one:out', 'one', 'scalar')], { value: 1 }, [{ id: 'value', type: 'number', key: 'value', label: 'value' }]),
    node('alpha', 'Const', -640, 430, 'Const', 'state', [dout('alpha:out', 'alpha', 'scalar')], { value: 0.1 }, [{ id: 'value', type: 'number', key: 'value', label: 'value' }]),
    node('tick', 'Tick', -380, 440, 'Tick', 'flow', [eo('tick:out')]),
    node('spawn', 'Spawn', -380, 580, 'Spawn', 'domain', [ei('spawn:in'), di('spawn:specs', 'specs', 'array'), dout('spawn:units', 'units', 'array'), eo('spawn:out')]),
    node('zip', 'ZipAdd', -120, -260, 'Zip Add', 'array', [di('zip:a', 'a', 'array'), di('zip:b', 'b', 'array'), dout('zip:out', 'out', 'array')]),
    node('gain', 'Sub', -120, 360, 'Subtract', 'math', [di('gain:a', 'a', 'scalar'), di('gain:b', 'b', 'scalar'), dout('gain:out', 'out', 'scalar')]),
    node('alloc', 'Allocate', 160, -200, 'Allocate', 'domain', [
      ei('alloc:in'), di('alloc:p', 'priorities', 'array'), di('alloc:subs', 'subs', 'array'), di('alloc:arr', 'arrivals', 'array'), di('alloc:costs', 'costs', 'object'),
      dout('alloc:priorities', 'priorities', 'array'), dout('alloc:awards', 'awards', 'array'), dout('alloc:leftovers', 'leftovers', 'array'), eo('alloc:out'),
    ]),
    node('scale', 'ScaleArray', 420, -40, 'Scale Array', 'array', [di('scale:array', 'array', 'array'), di('scale:k', 'k', 'scalar'), dout('scale:out', 'out', 'array')]),
    // ScatterToOutputs has one data-out per agent (visible feedback wires); auto-grown as agents are added.
    node('scatter', 'ScatterToOutputs', 680, -200, 'Scatter', 'domain', [ei('scatter:in'), di('scatter:value', 'values', 'array'), eo('scatter:out'), ...scatterOuts]),
    // Warehouse: Length(leftovers) → Output. The Output node renders the count IN the node itself
    // (its `output` widget reads state.value, which Output writes via VM.setState each tick).
    node('lenLo', 'Length', 420, 280, '', 'array', [di('lenLo:in', 'array', 'array'), dout('lenLo:out', 'count', 'scalar')]),
    node('warehouseOut', 'Output', 580, 340, '', 'state', [
      { id: 'wh:in', kind: 'exec', direction: 'in', type: 'exec', multiple: false, label: '' },
      di('wh:value', 'value', 'scalar'),
      { id: 'wh:out', kind: 'exec', direction: 'out', type: 'exec', multiple: false, label: '' },
    ], {}, [{ id: 'value', type: 'custom', renderer: 'output', key: 'value', label: '', height: 40 }]),
  ]

  const nodes = [...agentNodes, ...goodieNodes, ...rest]
  for (const nd of nodes) if (nd.type !== 'Agent' && nd.type !== 'Goodie') nd.glyph = { icon: PRIMITIVE_ICONS[nd.type] ?? 'circle', side: 'left' }

  const edges: XenolithEdgeV1[] = [
    // Agents.self → Gather Agents (one wire per agent — the visible "1 wire per node").
    ...agents.map((a) => e(`w_ag_${a.id}`, a.id, `${a.id}:self`, 'gAgents', 'gAgents:items')),
    // Goodies.self → Gather Goodies (records straight in — Spawn/ToMap use them as-is).
    ...goodies.map((g) => e(`w_go_${g.type}`, `goodie:${g.type}`, `goodie:${g.type}:self`, 'gGoodies', 'gGoodies:items')),
    // Records → parallel arrays via MapField.
    e('m_pri', 'gAgents', 'gAgents:out', 'mPri', 'mPri:in'),
    e('m_sal', 'gAgents', 'gAgents:out', 'mSal', 'mSal:in'),
    e('m_sub', 'gAgents', 'gAgents:out', 'mSub', 'mSub:in'),
    // Algorithm wiring (now sourced from MapField outs instead of by-type Gather).
    e('zp_a', 'mPri', 'mPri:out', 'zip', 'zip:a'),
    e('zp_b', 'mSal', 'mSal:out', 'zip', 'zip:b'),
    e('zp', 'zip', 'zip:out', 'alloc', 'alloc:p'),
    e('su', 'mSub', 'mSub:out', 'alloc', 'alloc:subs'),
    e('gr_sp', 'gGoodies', 'gGoodies:out', 'spawn', 'spawn:specs'),
    e('gr_tm', 'gGoodies', 'gGoodies:out', 'toMap', 'toMap:in'),
    e('tm', 'toMap', 'toMap:out', 'alloc', 'alloc:costs'),
    e('ar', 'spawn', 'spawn:units', 'alloc', 'alloc:arr'),
    e('o', 'one', 'one:out', 'gain', 'gain:a'),
    e('al', 'alpha', 'alpha:out', 'gain', 'gain:b'),
    e('ap', 'alloc', 'alloc:priorities', 'scale', 'scale:array'),
    e('gk', 'gain', 'gain:out', 'scale', 'scale:k'),
    e('sv', 'scale', 'scale:out', 'scatter', 'scatter:value'),
    // exec: Tick → Spawn → Allocate → Scatter
    e('t', 'tick', 'tick:out', 'spawn', 'spawn:in'),
    e('ts', 'spawn', 'spawn:out', 'alloc', 'alloc:in'),
    e('as', 'alloc', 'alloc:out', 'scatter', 'scatter:in'),
    // Scatter.oN → Agent.priority (visible feedback wires).
    ...agents.map((a, i) => e(`w_pr_${a.id}`, 'scatter', `scatter:o${i}`, a.id, `${a.id}:priority`)),
    // Warehouse chain (exec after Scatter): leftovers → Length → Output (renders count in-node).
    e('w_lo', 'alloc', 'alloc:leftovers', 'lenLo', 'lenLo:in'),
    e('w_len_out', 'lenLo', 'lenLo:out', 'warehouseOut', 'wh:value'),
    e('w_set_in', 'scatter', 'scatter:out', 'warehouseOut', 'wh:in'),
  ]

  const comments: XenolithCommentV1[] = [
    comment('cAgents', -1010, -370, 280, 920, 'Agents · editable nodes (add with Tab)', '#3A2C5A'),
    comment('cGoodies', -1010, 580, 280, 470, 'Goodies · editable nodes', '#4A3A18'),
    comment('cAlgo', -160, -300, 1000, 900, 'Algorithm · Gather → salary → Spawn → Allocate → tax → Scatter', '#244035'),
  ]
  return { version: 'xenolith.v1', categories: MERGED_CATEGORY_COLORS, nodes, edges, comments }
}
