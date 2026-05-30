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
import { CATEGORY_COLORS } from './sim-to-graph.js'
import { buildAllocateSubgraphV1 } from './allocate-graph-v1.js'
import { buildAllocateTemplateDefinition, buildAllocateInstance } from './allocate-template-v1.js'

export const FAIRQUEUE_DEFS: NodeDef[] = [...BUILTIN_PRIMITIVES, Allocate]
/** Full def set incl. the Gather/Scatter collection bridge — used by the merged graph. */
// MERGED engine uses ZERO native domain verbs — Allocate is now a sub-graph of primitives (see
// `allocate-graph-v1.ts`). Spawn stays native for now (next macro target).
export const MERGED_DEFS: NodeDef[] = [...BUILTIN_PRIMITIVES, ...COLLECTION_PRIMITIVES]
// Other engines (JS step / Runtime view) still ship `Allocate` as a single black-box verb.
void Allocate
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
// Every widget must be pinKey-bound — core's layout reserves no body band for non-bound widgets.
// Per-instance overrides below: each widget points at the pin label that should host it.
const nameWidget: WidgetSpec[] = [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: 'value', visibility: 'always' }]
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
    node('one', 'Const', 0, 840, 'Const', 'state', [dout('one:out', 'out', 'scalar')], { value: 1 }, [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out', visibility: 'always' }]),
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
const labelWidget: WidgetSpec[] = [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: 'out' }]
const numWidget: WidgetSpec[] = [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out', visibility: 'always' }]
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

// ---- MERGED graph: agents & goodies are Schema-driven Struct nodes -----------------------------
// Pin and widget lists are SYNTHESIZED by the runtime plugin from a Schema node wired into each
// Struct's `schema` in-pin. We declare the Schema once (per role) and the per-instance Struct nodes
// are just minimal {id, position, state} — no hand-written pin arrays, no hand-written widget arrays.
// Plugin's edge:connected listener does `setNodePins` + `setNodeWidgets` from `schema.state.fields`.

// Per-role schemas. Defaults double as the *type hint* the plugin uses to pick pin types and widget
// shapes: string → text widget + 'string' pin, number → number widget + 'scalar' pin, etc.
const AGENT_SCHEMA_FIELDS  = { name: '', priority: 0, salary: 0,   subs: [] as string[] }
const GOODIE_SCHEMA_FIELDS = { name: '', type: '',     cost: 0,     rate: 0              }

// Schema-declared NON-field pins (multi inputs, typed outputs, …). They go alongside the field
// pins on every Struct wired to this Schema — and DISAPPEAR when the schema wire is removed,
// just like field pins. The agent has one: `subscribe` (multi, goodie-rec) — wires
// `Goodie.self → Agent.subscribe` ARE the subscription set.
const AGENT_SCHEMA_EXTRAS  = [{ label: 'subscribe', direction: 'in' as const, type: 'goodie-rec', multiple: true }]
const GOODIE_SCHEMA_EXTRAS: never[] = []

// Per-instance base pins: only `self` (out) and `schema` (in). Everything else (field pins, extra
// pins like `subscribe`) is synthesized by the plugin from the wired Schema.
const agentSelfPin = (id: string): XenolithPinV1 =>
  ({ id: `${id}:self`, kind: 'data', direction: 'out', type: 'agent', multiple: true, label: 'self' })
const agentSchemaPin = (id: string): XenolithPinV1 =>
  ({ id: `${id}:schema`, kind: 'data', direction: 'in', type: 'object', multiple: false, label: 'schema' })
const goodieSelfPin = (id: string): XenolithPinV1 =>
  ({ id: `${id}:self`, kind: 'data', direction: 'out', type: 'goodie-rec', multiple: true, label: 'self' })
const goodieSchemaPin = (id: string): XenolithPinV1 =>
  ({ id: `${id}:schema`, kind: 'data', direction: 'in', type: 'object', multiple: false, label: 'schema' })

/** Options for `fairqueueMergedGraph`. `flatAllocate: true` inlines the Allocate primitive
 *  sub-graph instead of wrapping it in a `$templateInstance` — needed by headless tests that run
 *  the VM directly without an editor (and therefore without `graphSnapshot({ expandTemplates })`). */
export interface MergedGraphOpts {
  flatAllocate?: boolean
}
export function fairqueueMergedGraph(agents: Agent[], goodies: GoodieSpec[], opts: MergedGraphOpts = {}): XenolithGraphV1 {
  // Two parallel columns: agents far left, goodies just right. Schema nodes sit at the very top of
  // each column above their consumers — visually obvious "this is what these Structs are typed by".
  const AGENT_X  = -1180
  const GOODIE_X = -880
  const AGENT_VSTEP  = 300
  const GOODIE_VSTEP = 300
  const SCHEMA_Y     = -700 // above the first instance

  // Widgets are NOT inherited from the registered Schema schema on loadJSON — every node must carry
  // its own `widgets` array (same as for Struct). The plugin's `struct` DOM widget edits the schema
  // fields object in-node. Pin label MUST match widget.key='fields' — that's how the editor's
  // implicit pinKey binding finds the pin (core no longer reserves a body band for non-pin-bound
  // widgets; every widget must ride inside a pin row).
  // height matches the actual rendered content: 4 field rows (~26px each = 104) + "+ add field"
  // button (~28) + widget root vertical padding (~12) ≈ 144. Bumping it past content height just
  // leaves dead vertical space below the last row, which is what the user keeps reporting.
  // Two pins per Schema:
  //   - `fields` IN  — binding-only pin so the struct widget rides in a normal IN-pin row.
  //   - `definition` OUT — the actual data emission pin downstream Structs wire from.
  //     Label is EMPTY because the widget spans the full row width — a text label here would be
  //     visually overlapped by the widget. The pin DOT stays on the right edge (still grab-able).
  // height = approx 5 compact rows (4 default fields + add button). More fields → widget scrolls
  // internally rather than ballooning the node body. Less than this and even the default 4 fields
  // hide the "+ add field" button on first paint.
  const schemaWidget: WidgetSpec[] = [{ id: 'fields', type: 'custom', renderer: 'struct', key: 'fields', label: '', height: 110 }]
  const schemaPins = (id: string): XenolithPinV1[] => [
    { id: `${id}:fields`,     kind: 'data', direction: 'in',  type: 'object', multiple: false, label: 'fields' },
    { id: `${id}:definition`, kind: 'data', direction: 'out', type: 'object', multiple: true,  label: '' },
  ]
  const agentSchemaNode: XenolithNodeV1 = node('schema:agent', 'Schema', AGENT_X, SCHEMA_Y, 'Schema', 'state',
    schemaPins('schema:agent'), { fields: AGENT_SCHEMA_FIELDS, extraPins: AGENT_SCHEMA_EXTRAS }, schemaWidget)
  const goodieSchemaNode: XenolithNodeV1 = node('schema:goodie', 'Schema', GOODIE_X, SCHEMA_Y, 'Schema', 'state',
    schemaPins('schema:goodie'), { fields: GOODIE_SCHEMA_FIELDS, extraPins: GOODIE_SCHEMA_EXTRAS }, schemaWidget)

  // Per-instance Struct nodes — `state.kind` discriminates for the host. Per-field state values
  // (name/priority/salary/subs) sit at TOP LEVEL; the plugin uses them as widget defaults and
  // Struct V3 reads them as the per-pin fallback when nothing's wired.
  const agentNodes: XenolithNodeV1[] = agents.map((a, i) =>
    node(a.id, 'Struct', AGENT_X, -320 + i * AGENT_VSTEP, 'Struct', 'agent',
      // Only base pins — `subscribe` is now declared in the agent Schema's `extraPins`, so the
      // plugin synthesizes it (pin id `extra:subscribe`) every time the schema wire is present.
      [agentSelfPin(a.id), agentSchemaPin(a.id)],
      // priority:0 — bootstrap before the first Scatter run. The plugin will seed any MISSING
      // schema fields at edge-connect; ours pre-seeded since we already have correct defaults.
      { kind: 'agent', name: a.id, priority: 0, salary: a.salary, subs: a.subscriptions }))
  const goodieNodes: XenolithNodeV1[] = goodies.map((g, i) =>
    node(`goodie:${g.type}`, 'Struct', GOODIE_X, -320 + i * GOODIE_VSTEP, 'Struct', 'goodie',
      [goodieSelfPin(`goodie:${g.type}`), goodieSchemaPin(`goodie:${g.type}`)],
      { kind: 'goodie', name: g.type, type: g.type, cost: g.cost, rate: g.rate }))

  // Scatter has one anonymous data-out per agent (just `o0`, `o1`, …). Currently unwired — the
  // host harvests results from the VM var directly. Kept as a visual placeholder for the eventual
  // "scatter back to the Struct" feedback wires (a generic SetField node, TBD).
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
    node('mPri', 'MapField', -380, -300, 'Map Field', 'array', [di('mPri:in', 'records', 'array'), dout('mPri:out', 'values', 'array')], { field: 'priority' }, [{ id: 'field', type: 'text', key: 'field', label: '', pinKey: 'records', visibility: 'always' }]),
    node('mSal', 'MapField', -380, -150, 'Map Field', 'array', [di('mSal:in', 'records', 'array'), dout('mSal:out', 'values', 'array')], { field: 'salary' }, [{ id: 'field', type: 'text', key: 'field', label: '', pinKey: 'records', visibility: 'always' }]),
    node('mSub', 'MapField', -380, 0, 'Map Field', 'array', [di('mSub:in', 'records', 'array'), dout('mSub:out', 'values', 'array')], { field: 'subs' }, [{ id: 'field', type: 'text', key: 'field', label: '', pinKey: 'records', visibility: 'always' }]),
    // Goodies stay record-shaped (Spawn already wants {type,rate}, ToMap wants {type,cost}).
    node('toMap', 'ToMap', -380, 760, 'To Map', 'array', [di('toMap:in', 'records', 'array'), dout('toMap:out', 'map', 'object')], { key: 'type', value: 'cost' }, [
      // Only `key` is editable in-node (overlap-avoidance — see schemas.ts comment).
      // `value` field stays at state.value='cost' from initial config.
      { id: 'key', type: 'text', key: 'key', label: '', pinKey: 'records', visibility: 'always' },
    ]),
    node('one',   'Const', -640, 300, 'Const', 'state', [dout('one:out',   'out', 'scalar')], { value: 1   }, [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out', visibility: 'always' }]),
    node('alpha', 'Const', -640, 430, 'Const', 'state', [dout('alpha:out', 'out', 'scalar')], { value: 0.1 }, [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out', visibility: 'always' }]),
    node('tick', 'Tick', -380, 440, 'Tick', 'flow', [eo('tick:out')]),
    node('spawn', 'Spawn', -380, 580, 'Spawn', 'domain', [ei('spawn:in'), di('spawn:specs', 'specs', 'array'), dout('spawn:units', 'units', 'array'), eo('spawn:out')]),
    node('zip', 'ZipAdd', -120, -260, 'Zip Add', 'array', [di('zip:a', 'a', 'array'), di('zip:b', 'b', 'array'), dout('zip:out', 'out', 'array')]),
    node('gain', 'Sub', -120, 360, 'Subtract', 'math', [di('gain:a', 'a', 'scalar'), di('gain:b', 'b', 'scalar'), dout('gain:out', 'out', 'scalar')]),
    // `Allocate` is now a SUB-GRAPH of primitives (ForEach + FilterIndices + ArgMax + Index +
    // ArrayWrite + Append + ObjectGet). See `apps/fairqueue-demo/src/allocate-graph-v1.ts`. No
    // native `Allocate` evaluator — the simulation runs purely on composable primitives, proven
    // equivalent by `packages/plugin-runtime/src/model/allocate-graph.test.ts` (7 scenarios).
    node('scale', 'ScaleArray', 420, -40, 'Scale Array', 'array', [di('scale:array', 'array', 'array'), di('scale:k', 'k', 'scalar'), dout('scale:out', 'out', 'array')]),
    // ScatterToOutputs has one data-out per agent (visible feedback wires); auto-grown as agents are added.
    node('scatter', 'ScatterToOutputs', 680, -200, 'Scatter', 'domain', [ei('scatter:in'), di('scatter:value', 'values', 'array'), eo('scatter:out'), ...scatterOuts]),
    // Warehouse: Length(leftovers) → +GetVar('warehouse') → SetVar('warehouse') → Output.
    // Accumulates leftover count across ticks IN THE GRAPH — host just reads the VM var or the
    // Output widget. No more `warehouse += length` on the host side.
    node('lenLo', 'Length', 420, 280, '', 'array', [di('lenLo:in', 'array', 'array'), dout('lenLo:out', 'count', 'scalar')]),
    node('whGet', 'GetVar', 420, 340, 'Get Variable', 'state', [dout('whGet:value', 'value', 'scalar')], { name: 'warehouse' }, [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: 'value', visibility: 'always' }]),
    node('whAdd', 'Add',    580, 310, 'Add', 'math', [di('whAdd:a', 'a', 'scalar'), di('whAdd:b', 'b', 'scalar'), dout('whAdd:out', 'out', 'scalar')]),
    node('whSet', 'SetVar', 760, 280, 'Set Variable', 'state', [ei('whSet:in'), di('whSet:value', 'value', 'scalar'), eo('whSet:out', 'out')], { name: 'warehouse' }, [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: 'value', visibility: 'always' }]),
    node('warehouseOut', 'Output', 940, 340, '', 'state', [
      { id: 'wh:in', kind: 'exec', direction: 'in', type: 'exec', multiple: false, label: '' },
      di('wh:value', 'value', 'scalar'),
      { id: 'wh:out', kind: 'exec', direction: 'out', type: 'exec', multiple: false, label: '' },
    ], {}, [{ id: 'value', type: 'custom', renderer: 'output', key: 'value', label: '', height: 40, pinKey: 'value', visibility: 'always' }]),
    // Mean priority: Mean(scale.out) → Output. Mean across the current-tick priority vector.
    // Host reads `output:meanOut` from VM var instead of computing `.reduce()` on the JS side.
    node('meanPri', 'Mean', 420, 100, 'Mean', 'array', [di('meanPri:in', 'array', 'array'), dout('meanPri:out', 'out', 'scalar')]),
    node('meanOut', 'Output', 580, 100, '', 'state', [
      { id: 'mn:in', kind: 'exec', direction: 'in', type: 'exec', multiple: false, label: '' },
      di('mn:value', 'value', 'scalar'),
      { id: 'mn:out', kind: 'exec', direction: 'out', type: 'exec', multiple: false, label: '' },
    ], {}, [{ id: 'value', type: 'custom', renderer: 'output', key: 'value', label: '', height: 40, pinKey: 'value', visibility: 'always' }]),
  ]

  // Allocate: ONE `$templateInstance` on the canvas (dive in to see primitives). The runtime
  // flattens templates pre-tick via `editor.graphSnapshot({ expandTemplates: true })`.
  // Headless tests pass `flatAllocate: true` to get an inline sub-graph (no template path).
  const allocSub = opts.flatAllocate
    ? buildAllocateSubgraphV1('alloc', 160, -200, {
        priorities: { node: 'zip',   pin: 'zip:out' },
        subs:       { node: 'mSub',  pin: 'mSub:out' },
        arrivals:   { node: 'spawn', pin: 'spawn:units' },
        costs:      { node: 'toMap', pin: 'toMap:out' },
        exec:       { node: 'spawn', pin: 'spawn:out' },
      })
    : null
  const allocInst = opts.flatAllocate ? null : buildAllocateInstance('alloc', 160, -200)

  const nodes = [agentSchemaNode, goodieSchemaNode, ...agentNodes, ...goodieNodes, ...rest,
    ...(allocInst ? [allocInst] : []),
    ...(allocSub ? allocSub.nodes : []),
  ]
  for (const nd of nodes) nd.glyph = { icon: PRIMITIVE_ICONS[nd.type] ?? 'circle', side: 'left' }

  const edges: XenolithEdgeV1[] = [
    // Schema → Struct: wires the role definition into every per-instance Struct. The plugin's
    // listener uses these to call setNodePins + setNodeWidgets so pins/widgets are synthesized
    // from the schema fields — no per-instance hand-writing required.
    ...agents.map((a)  => e(`w_sch_${a.id}`,           'schema:agent',  'schema:agent:definition',  a.id,                `${a.id}:schema`)),
    ...goodies.map((g) => e(`w_sch_goodie:${g.type}`,  'schema:goodie', 'schema:goodie:definition', `goodie:${g.type}`,  `goodie:${g.type}:schema`)),
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
    e('gr_sp', 'gGoodies', 'gGoodies:out', 'spawn', 'spawn:specs'),
    e('gr_tm', 'gGoodies', 'gGoodies:out', 'toMap', 'toMap:in'),
    e('o', 'one', 'one:out', 'gain', 'gain:a'),
    e('al', 'alpha', 'alpha:out', 'gain', 'gain:b'),
    e('gk', 'gain', 'gain:out', 'scale', 'scale:k'),
    e('sv', 'scale', 'scale:out', 'scatter', 'scatter:value'),
    // exec: Tick → Spawn → Allocate → Scatter
    e('t', 'tick', 'tick:out', 'spawn', 'spawn:in'),
    // Allocate wiring depends on whether we're using the template (instance pins) or the inline
    // sub-graph (allocSub pin handles directly). Same logical topology either way.
    ...(allocInst ? [
      e('al_in_exec', 'spawn', 'spawn:out',   'alloc', 'alloc:exec'),
      e('al_in_p',    'zip',   'zip:out',     'alloc', 'alloc:priorities'),
      e('al_in_s',    'mSub',  'mSub:out',    'alloc', 'alloc:subs'),
      e('al_in_arr',  'spawn', 'spawn:units', 'alloc', 'alloc:arrivals'),
      e('al_in_c',    'toMap', 'toMap:out',   'alloc', 'alloc:costs'),
      e('ap', 'alloc', 'alloc:priorities_out', 'scale',   'scale:array'),
      e('as', 'alloc', 'alloc:execOut',        'scatter', 'scatter:in'),
    ] : []),
    ...(allocSub ? [
      ...allocSub.edges,
      e('ap', allocSub.out.priorities.node, allocSub.out.priorities.pin, 'scale',   'scale:array'),
      e('as', allocSub.out.exec.node,       allocSub.out.exec.pin,       'scatter', 'scatter:in'),
    ] : []),
    // Subscription wires: each agent's initial `subscriptions[]` becomes one wire per subscribed
    // goodie type — Goodie.self → Agent.subscribe. Wires ARE the subscriptions; the host keeps
    // `state.data.subs` in sync by re-deriving it from the edge set on every add/remove.
    ...agents.flatMap((a) => a.subscriptions
      .filter((t) => goodies.some((g) => g.type === t))
      .map((t) => e(`w_sub_${a.id}_${t}`, `goodie:${t}`, `goodie:${t}:self`, a.id, `extra:subscribe`))),
    // Feedback wires: Scatter.oN → Agent.field:priority. Visible per-agent feedback path — Struct
    // V3 evaluator merges the wired pin's value into the emitted record. Pin id `field:priority`
    // is what the plugin synthesizes from the Schema's `priority: 0` field.
    ...agents.map((a, i) => e(`w_pr_${a.id}`, 'scatter', `scatter:o${i}`, a.id, `field:priority`)),
    // Warehouse chain (after Scatter): Length(leftovers) + GetVar(warehouse) → Add → SetVar →
    // Output. Accumulates totals in the GRAPH; host reads the VM var instead of running its own
    // `warehouse += ...` loop. Exec chain: Scatter → whSet → warehouseOut.
    e('w_lo',      'alloc', 'alloc:leftovers', 'lenLo', 'lenLo:in'),
    e('w_addA',    'lenLo',  'lenLo:out',       'whAdd', 'whAdd:a'),
    e('w_addB',    'whGet',  'whGet:value',     'whAdd', 'whAdd:b'),
    e('w_setVal',  'whAdd',  'whAdd:out',       'whSet', 'whSet:value'),
    e('w_setIn',   'scatter','scatter:out',     'whSet', 'whSet:in'),
    e('w_outVal',  'whAdd',  'whAdd:out',       'warehouseOut', 'wh:value'),
    e('w_outIn',   'whSet',  'whSet:out',       'warehouseOut', 'wh:in'),
    // Mean priority chain: Mean(scale.out) → Output. Exec chain: warehouseOut → meanOut.
    e('m_inArr',  'scale',        'scale:out',   'meanPri', 'meanPri:in'),
    e('m_outVal', 'meanPri',      'meanPri:out', 'meanOut', 'mn:value'),
    e('m_outIn',  'warehouseOut', 'wh:out',      'meanOut', 'mn:in'),
  ]

  const comments: XenolithCommentV1[] = [
    // Each Struct ~250px tall; with 6 agents at 300 vstep starting -320, column ends ~1280.
    comment('cAgents',  AGENT_X  - 30, -370, 280, 1690, 'Agents · editable nodes (add with Tab)', '#3A2C5A'),
    comment('cGoodies', GOODIE_X - 30, -370, 280,  940, 'Goodies · editable nodes',                 '#4A3A18'),
    comment('cAlgo', -160, -300, 1000, 900, 'Algorithm · Gather → salary → Spawn → Allocate → tax → Scatter', '#244035'),
  ]
  // Embed the Allocate TemplateDefinition keyed by id; the `alloc` $templateInstance references it.
  const allocDef = buildAllocateTemplateDefinition()
  const templates: Record<string, { title: string; nodes: XenolithNodeV1[]; edges: XenolithEdgeV1[] }> = {
    [allocDef.id]: {
      title: allocDef.title,
      nodes: allocDef.nodes as unknown as XenolithNodeV1[],
      edges: allocDef.edges as unknown as XenolithEdgeV1[],
    },
  }
  return { version: 'xenolith.v1', categories: MERGED_CATEGORY_COLORS, nodes, edges, comments, templates } as XenolithGraphV1
}
