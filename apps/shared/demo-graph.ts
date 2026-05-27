import type { NodeSchema, XenolithGraphV1, XenolithNodeV1, XenolithEdgeV1 } from '@xenolith/editor'
import { REROUTE_TYPE, REROUTE_NODE_TYPE, defaultWidgetValue, type WidgetSpec } from '@xenolith/core'

export { createCurveWidget } from './curve-widget.js'
export { createXYPadWidget } from './xy-pad-widget.js'
import { CURVE_DEFAULT } from './curve-widget.js'
import { XYPAD_DEFAULT } from './xy-pad-widget.js'

/** Initial value for a custom widget — its controller's default, persisted into node.state so a
 *  loaded graph is self-contained (getWidgetValue returns real data, not undefined). */
function customDefault(renderer: string): unknown {
  return renderer === 'curve' ? CURVE_DEFAULT : renderer === 'xypad' ? XYPAD_DEFAULT : null
}

/**
 * The canonical Xenolith demo graph, authored once as plain data in our own `xenolith.v1` format.
 * Every host (playground app, the site /playground page, the landing showcase) loads it via
 * `editor.loadJSON(demoGraph)` — no host hand-builds nodes with addNode/connect anymore.
 *
 * It exercises the full visual vocabulary: all four node categories, collapsed pills, every pin
 * type colour, and BOTH reroute kinds — the inline `$reroute` knot (split into a wire, non-pullable)
 * and the rectangular `Reroute` relay node (a movable node you can pull fresh wires from).
 */

type Cat = 'logic' | 'data' | 'macro' | 'utility'
interface PinSpec { dir: 'in' | 'out'; type: string; label: string }
interface NodeSpec {
  key: string
  type: string
  title?: string
  category: Cat
  description: string
  keywords?: string[]
  position: { x: number; y: number }
  collapsed?: boolean
  pins: PinSpec[]
  widgets?: WidgetSpec[]
}
type Conn = [from: string, fromPin: number, to: string, toPin: number, type: string]

const p = (dir: 'in' | 'out', type: string, label: string): PinSpec => ({ dir, type, label })

// ---- node definitions ------------------------------------------------------------------------
const SPECS: NodeSpec[] = [
  { key: 'source',    type: 'Source',    category: 'logic',   description: 'Emits a stream of float values',         keywords: ['input', 'origin'], position: { x: 40,  y: 60  }, pins: [p('out', 'float', 'Output')] },
  { key: 'sample',    type: 'Sample',    category: 'logic',   description: 'Reads a value at the current cursor',     keywords: ['read'],            position: { x: 40,  y: 200 }, pins: [p('in','float','In'), p('out','float','Out')] },
  { key: 'filter',    type: 'Filter',    category: 'logic',   description: 'Drops values failing a predicate',        keywords: ['where'],           position: { x: 40,  y: 360 }, collapsed: true, pins: [p('in','float','In'), p('out','float','Out')] },
  { key: 'cache',     type: 'Cache',     category: 'data',    description: 'Memoises the last seen object',           keywords: ['store', 'memo'],   position: { x: 40,  y: 500 }, collapsed: true, pins: [p('in','object','In'), p('out','object','Out')] },
  // 'gather' and 'pack' are MACRO groups, authored in the macro section below (not plain nodes).
  { key: 'transform', type: 'Transform', category: 'data',    description: 'Maps an object to a new shape',           keywords: ['move', 'map'],     position: { x: 560, y: 140 }, pins: [p('in','object','In'), p('out','object','Out')],
    widgets: [
      { id: 'scale', type: 'slider', label: 'Scale', key: 'scale', min: 0, max: 2, step: 0.05 },
      { id: 'mode',  type: 'combo',  label: 'Mode',  key: 'mode',  values: ['fit', 'fill', 'stretch'] },
      { id: 'mirror', type: 'toggle', label: 'Mirror', key: 'mirror' },
    ] },
  { key: 'validate',  type: 'Validate',  category: 'data',    description: 'Checks an object against a schema',       keywords: ['check'],           position: { x: 560, y: 300 }, pins: [p('in','object','In'), p('out','wildcard','Out')],
    widgets: [
      { id: 'response', type: 'custom', renderer: 'curve', key: 'response', label: 'Response', height: 120 },
    ] },
  { key: 'enrich',    type: 'Enrich',    category: 'data',    description: 'Augments an object with extra fields',    keywords: ['augment'],         position: { x: 560, y: 510 }, pins: [p('in','object','In'), p('out','object','Out')],
    widgets: [
      { id: 'tint',     type: 'color',  label: 'Tint',     key: 'tint' },
      { id: 'strength', type: 'slider', label: 'Strength', key: 'strength', min: 0, max: 1, step: 0.01 },
    ] },
  { key: 'score',     type: 'Score',     category: 'macro',   description: 'Ranks an object, emits a float score',    keywords: ['rank'],            position: { x: 820, y: 200 }, collapsed: true, pins: [p('in','object','In'), p('out','float','Out')] },
  { key: 'resolve',   type: 'Resolve',   category: 'macro',   description: 'Finalises into a string result',          keywords: ['finalize'],        position: { x: 820, y: 360 }, pins: [p('in','object','In'), p('in','float','Hint'), p('in','wildcard','Aux'), p('out','string','Out')],
    widgets: [
      { id: 'seed', type: 'number', label: 'Seed', key: 'seed', min: 0, max: 999999, step: 1 },
      { id: 'prompt', type: 'text', label: 'Prompt', key: 'prompt', multiline: true, placeholder: 'describe…' },
    ] },
  { key: 'format',    type: 'Format',    category: 'data',    description: 'Renders a result to a display string',    keywords: ['template'],        position: { x: 820, y: 600 }, collapsed: true, pins: [p('in','string','In'), p('out','string','Out')] },
  { key: 'display',   type: 'Display',   category: 'utility', description: 'Renders a string to the viewport',        keywords: ['show', 'output'],  position: { x: 1100, y: 120 }, pins: [p('in','string','In'), p('out','any','Out')] },
  { key: 'audit',     type: 'Audit',     category: 'utility', description: 'Logs a float for inspection',             keywords: ['log'],             position: { x: 1100, y: 280 }, pins: [p('in','float','In'), p('out','any','Out')] },
  { key: 'persist',   type: 'Persist',   category: 'utility', description: 'Writes a string to durable storage',      keywords: ['save', 'write'],   position: { x: 1100, y: 440 }, pins: [p('in','string','In'), p('out','any','Out')] },
  { key: 'notify',    type: 'Notify',    category: 'utility', description: 'Pushes a notification on completion',     keywords: ['alert', 'webhook'],position: { x: 1100, y: 600 }, pins: [p('in','string','In'), p('out','any','Out')] },
  { key: 'archive',   type: 'Archive',   category: 'utility', description: 'Cold-stores any payload',                 keywords: ['cold', 'backup'],  position: { x: 1380, y: 360 }, pins: [p('in','any','In'),  p('out','any','Out')],
    widgets: [
      { id: 'offset', type: 'custom', renderer: 'xypad', key: 'offset', label: 'Offset', height: 110 },
    ] },
]

// ---- connections (reroutes wired in) ---------------------------------------------------------
// Reroute nodes participate as ordinary endpoints: pin 0 = in, pin 1 = out.
const CONNS: Conn[] = [
  ['source', 0, 'sample', 0, 'float'],
  ['sample', 1, 'filter', 0, 'float'],
  // cache → (inline $reroute knot) → Gather macro — the knot just carries the object wire through.
  ['cache', 1, 'rr_inline', 0, 'object'],
  // (Gather/Pack macro boundary edges are wired in the macro section below.)
  ['transform', 1, 'validate', 0, 'object'],
  ['transform', 1, 'enrich', 0, 'object'],
  ['enrich', 1, 'score', 0, 'object'],
  ['enrich', 1, 'resolve', 0, 'object'],
  ['score', 1, 'resolve', 1, 'float'],
  ['validate', 1, 'resolve', 2, 'wildcard'],
  ['resolve', 3, 'format', 0, 'string'],
  ['resolve', 3, 'display', 0, 'string'],
  ['format', 1, 'notify', 0, 'string'],
  ['resolve', 3, 'persist', 0, 'string'],
  // source → (rectangular Reroute relay) → audit — a pullable relay node across the canvas.
  ['source', 0, 'rr_box', 0, 'float'],
  ['rr_box', 1, 'audit', 0, 'float'],
  ['display', 1, 'archive', 0, 'any'],
  ['persist', 1, 'archive', 0, 'any'],
]

// Reroute placements (positioned by top-left; small footprints).
const REROUTES: { key: string; kind: typeof REROUTE_TYPE | typeof REROUTE_NODE_TYPE; type: string; position: { x: number; y: number } }[] = [
  { key: 'rr_inline', kind: REROUTE_TYPE,      type: 'object', position: { x: 210, y: 470 } },
  { key: 'rr_box',    kind: REROUTE_NODE_TYPE, type: 'float',  position: { x: 620, y: 660 } },
]

// ---- build the data documents ----------------------------------------------------------------
const pinId = (nodeKey: string, i: number): string => `${nodeKey}:pin${i}`

function buildNode(spec: NodeSpec): XenolithNodeV1 {
  const node: XenolithNodeV1 = {
    id: spec.key,
    type: spec.type,
    position: spec.position,
    pins: spec.pins.map((pn, i) => ({
      id: pinId(spec.key, i),
      kind: 'data',
      direction: pn.dir,
      type: pn.type,
      multiple: pn.dir === 'out',
      label: pn.label,
    })),
    render: { category: spec.category, title: spec.title ?? spec.type, collapsed: spec.collapsed ?? false },
  }
  if (spec.widgets) {
    node.widgets = spec.widgets
    node.state = {}
    for (const w of spec.widgets) {
      if (w.key === undefined) continue
      node.state[w.key] = w.type === 'custom' ? customDefault(w.renderer) : defaultWidgetValue(w)
    }
  }
  return node
}

function buildReroute(r: (typeof REROUTES)[number]): XenolithNodeV1 {
  return {
    id: r.key,
    type: r.kind,
    position: r.position,
    pins: [
      { id: pinId(r.key, 0), kind: 'data', direction: 'in',  type: r.type, multiple: false },
      { id: pinId(r.key, 1), kind: 'data', direction: 'out', type: r.type, multiple: true },
    ],
  }
}

const nodes: XenolithNodeV1[] = [...SPECS.map(buildNode), ...REROUTES.map(buildReroute)]

const edges: XenolithEdgeV1[] = CONNS.map(([from, fp, to, tp, type], i) => ({
  id: `e${i}`,
  from: { node: from, pin: pinId(from, fp) },
  to:   { node: to,   pin: pinId(to,   tp) },
  opts: { sourceType: type },
}))

// ---- macro demo (declarative) ---------------------------------------------------------------
// Two self-contained macro groups, "Gather" and "Pack". Each is authored as DATA: ordinary member
// nodes (inlet → steps → outlet) wired to external sources/sinks, plus a `Macro` node carrying
// state.members + collapsed. loadJSON materialises the collapse (derives proxy pins from the boundary
// edges, rewires them) — so it loads as a real collapsed macro reading like a node with pins. The
// inlet IN pins / outlet OUT pin carry the labels that become the macro's pin labels (A/B/C…/Out).
const macroNodes: XenolithNodeV1[] = []
const macroEdges: XenolithEdgeV1[] = []
let meSeq = 0
const sp = (id: string, dir: 'in' | 'out', type: string, label: string, mult = false) =>
  ({ id, kind: 'data' as const, direction: dir, type, multiple: mult, label })
const sn = (id: string, x: number, y: number, pins: ReturnType<typeof sp>[], title: string, category: Cat): void => {
  macroNodes.push({ id, type: 'Step', position: { x, y }, pins, render: { category, title, collapsed: false } })
}
const me = (from: string, fromPin: string, to: string, toPin: string): void => {
  macroEdges.push({ id: `me${meSeq++}`, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } })
}

interface MacroIn { label: string; from?: { node: string; pin: number }; type: string }
interface MacroOut { to: { node: string; pin: number }; type: string }
/** Turn a demo node into a MACRO IN PLACE: build internal members (inlet per input → steps → outlet)
 *  wired to the SAME external neighbours the original node had, then a `Macro` node at its position.
 *  `inputs`/`outputs` describe the external boundary; loadJSON materialises proxy pins (labels kept). */
function macroInPlace(prefix: string, title: string, x: number, y: number, inputs: MacroIn[], outputs: MacroOut[]): void {
  const members: string[] = []
  // Inlet per external input — its IN pin (one feed) carries the label that becomes the macro pin.
  const inletOut: string[] = []
  inputs.forEach((inp, i) => {
    const inl = `${prefix}_in${i}`
    sn(inl, x, y + i * 110, [sp(`${inl}.i`, 'in', inp.type, inp.label), sp(`${inl}.o`, 'out', inp.type, 'Out', true)], inp.label, 'logic')
    members.push(inl)
    if (inp.from) me(inp.from.node, pinId(inp.from.node, inp.from.pin), inl, `${inl}.i`) // external → inlet
    inletOut.push(`${inl}.o`)
  })
  // Merge the inlets through a binary tree of 2-input merge nodes — every IN pin takes exactly ONE
  // edge (no 3-into-1). Single-input macros skip straight to the outlet.
  let acc = inletOut[0]!
  for (let i = 1; i < inletOut.length; i++) {
    const m = `${prefix}_m${i}`
    sn(m, x + 180, y + (i - 1) * 110 + 40, [sp(`${m}.a`, 'in', 'object', 'A'), sp(`${m}.b`, 'in', 'object', 'B'), sp(`${m}.o`, 'out', 'object', 'Out', true)], `Merge ${i}`, 'macro')
    members.push(m)
    me(acc.split('.')[0]!, acc, m, `${m}.a`)
    me(inletOut[i]!.split('.')[0]!, inletOut[i]!, m, `${m}.b`)
    acc = `${m}.o`
  }
  // Nested sub-macro (tests macro-in-macro): the merged stream flows acc → [Refine → Emit] → outlet,
  // where Refine+Emit are wrapped in their own collapsed Macro that is itself a member of this one.
  const subY = y + inputs.length * 110 + 30
  const sa = `${prefix}_sa`, sb = `${prefix}_sb`, sm = `${prefix}_sub`
  sn(sa, x + 200, subY, [sp(`${sa}.i`, 'in', 'object', 'In'), sp(`${sa}.o`, 'out', 'object', 'Out', true)], 'Refine', 'logic')
  sn(sb, x + 360, subY, [sp(`${sb}.i`, 'in', 'object', 'In'), sp(`${sb}.o`, 'out', 'object', 'Out', true)], 'Emit', 'utility')
  me(sa, `${sa}.o`, sb, `${sb}.i`)
  macroNodes.push({ id: sm, type: 'Macro', position: { x: x + 240, y: subY }, pins: [], state: { members: [sa, sb], collapsed: true }, render: { category: 'macro', title: 'Sub' } })
  members.push(sm)
  me(acc.split('.')[0]!, acc, sa, `${sa}.i`)
  acc = `${sb}.o`
  // Outlet (output boundary, label "Out") — fed by the sub-macro, drives the external outputs.
  const out = `${prefix}_out`
  sn(out, x + 540, y, [sp(`${out}.i`, 'in', 'object', 'In'), sp(`${out}.o`, 'out', outputs[0]?.type ?? 'object', 'Out', true)], 'Result', 'utility')
  members.push(out)
  me(acc.split('.')[0]!, acc, out, `${out}.i`)
  for (const o of outputs) me(out, `${out}.o`, o.to.node, pinId(o.to.node, o.to.pin))
  macroNodes.push({ id: prefix, type: 'Macro', position: { x, y }, pins: [], state: { members, collapsed: true }, render: { category: 'macro', title } })
}
// Gather macro (was the demo 'gather' node at 300,200): A←filter, B←sample, C←reroute; Out→transform.
macroInPlace('gather', 'Gather', 300, 200,
  [{ label: 'A', from: { node: 'filter', pin: 1 }, type: 'float' },
   { label: 'B', from: { node: 'sample', pin: 1 }, type: 'float' },
   { label: 'C', from: { node: 'rr_inline', pin: 1 }, type: 'object' }],
  [{ to: { node: 'transform', pin: 0 }, type: 'object' }])
// Pack macro (was the demo 'pack' node at 300,420): In←Gather, Tag←cache; (Pack output unused in demo).
macroInPlace('pack', 'Pack', 300, 420,
  [{ label: 'In', type: 'object' },
   { label: 'Tag', from: { node: 'cache', pin: 1 }, type: 'float' }],
  [])
// Macro-to-macro: Gather's outlet feeds Pack's first inlet (member pins, not the macro proxy pins —
// those are derived at load). This becomes a Gather-macro → Pack-macro boundary edge after collapse.
me('gather_out', 'gather_out.o', 'pack_in0', 'pack_in0.i')

export const demoGraph: XenolithGraphV1 = {
  version: 'xenolith.v1',
  nodes: [...nodes, ...macroNodes],
  edges: [...edges, ...macroEdges],
  // One comment/group frame per pipeline column — drag a header to move the whole group, resize from
  // the corner. Also doubles as a perf/LOD test surface (distinct colours + texts across the graph).
  comments: [
    { id: 'c-ingest',    position: { x: 0,    y: 14 }, size: { x: 240, y: 580 }, text: 'Ingest',    color: '#85C244' },
    { id: 'c-combine',   position: { x: 268,  y: 150 }, size: { x: 240, y: 360 }, text: 'Combine',   color: '#5B8DEF' },
    { id: 'c-transform', position: { x: 528,  y: 88 }, size: { x: 250, y: 620 }, text: 'Transform', color: '#E0795A' },
    { id: 'c-resolve',   position: { x: 788,  y: 150 }, size: { x: 240, y: 540 }, text: 'Resolve',   color: '#B06BE8' },
    { id: 'c-output',    position: { x: 1068, y: 70 }, size: { x: 250, y: 620 }, text: 'Output',    color: '#4FC3C9' },
  ],
}

/** Schemas for the insert palette — derived from the same SPECS so Tab / double-click can spawn
 *  any demo node type. (The rectangular `Reroute` is a built-in, auto-registered by the editor.) */
export const demoSchemas: NodeSchema[] = SPECS.map((spec) => ({
  type: spec.type,
  title: spec.title ?? spec.type,
  category: spec.category,
  description: spec.description,
  keywords: spec.keywords ?? [],
  pins: spec.pins.map((pn) => ({ kind: 'data', direction: pn.dir, type: pn.type, label: pn.label, multiple: pn.dir === 'out' })),
  ...(spec.widgets ? { widgets: spec.widgets } : {}),
}))
