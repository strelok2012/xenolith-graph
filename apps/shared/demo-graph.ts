import type { NodeSchema, XenolithGraphV1, XenolithNodeV1, XenolithEdgeV1 } from '@xenolith/editor'
import { REROUTE_TYPE, REROUTE_NODE_TYPE } from '@xenolith/core'

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
}
type Conn = [from: string, fromPin: number, to: string, toPin: number, type: string]

const p = (dir: 'in' | 'out', type: string, label: string): PinSpec => ({ dir, type, label })

// ---- node definitions ------------------------------------------------------------------------
const SPECS: NodeSpec[] = [
  { key: 'source',    type: 'Source',    category: 'logic',   description: 'Emits a stream of float values',         keywords: ['input', 'origin'], position: { x: 40,  y: 60  }, pins: [p('out', 'float', 'Output')] },
  { key: 'sample',    type: 'Sample',    category: 'logic',   description: 'Reads a value at the current cursor',     keywords: ['read'],            position: { x: 40,  y: 200 }, pins: [p('in','float','In'), p('out','float','Out')] },
  { key: 'filter',    type: 'Filter',    category: 'logic',   description: 'Drops values failing a predicate',        keywords: ['where'],           position: { x: 40,  y: 360 }, collapsed: true, pins: [p('in','float','In'), p('out','float','Out')] },
  { key: 'cache',     type: 'Cache',     category: 'data',    description: 'Memoises the last seen object',           keywords: ['store', 'memo'],   position: { x: 40,  y: 500 }, collapsed: true, pins: [p('in','object','In'), p('out','object','Out')] },
  { key: 'gather',    type: 'Gather',    category: 'macro',   description: 'Combines several inputs into one object', keywords: ['merge', 'join'],   position: { x: 300, y: 200 }, pins: [p('in','float','A'), p('in','float','B'), p('in','object','C'), p('out','object','Out')] },
  { key: 'pack',      type: 'Pack',      category: 'macro',   description: 'Bundles an object with a tag',            keywords: ['bundle'],          position: { x: 300, y: 420 }, collapsed: true, pins: [p('in','object','In'), p('in','float','Tag'), p('out','object','Pack')] },
  { key: 'transform', type: 'Transform', category: 'data',    description: 'Maps an object to a new shape',           keywords: ['move', 'map'],     position: { x: 560, y: 140 }, pins: [p('in','object','In'), p('out','object','Out')] },
  { key: 'validate',  type: 'Validate',  category: 'data',    description: 'Checks an object against a schema',       keywords: ['check'],           position: { x: 560, y: 300 }, pins: [p('in','object','In'), p('out','wildcard','Out')] },
  { key: 'enrich',    type: 'Enrich',    category: 'data',    description: 'Augments an object with extra fields',    keywords: ['augment'],         position: { x: 560, y: 460 }, pins: [p('in','object','In'), p('out','object','Out')] },
  { key: 'score',     type: 'Score',     category: 'macro',   description: 'Ranks an object, emits a float score',    keywords: ['rank'],            position: { x: 820, y: 200 }, collapsed: true, pins: [p('in','object','In'), p('out','float','Out')] },
  { key: 'resolve',   type: 'Resolve',   category: 'macro',   description: 'Finalises into a string result',          keywords: ['finalize'],        position: { x: 820, y: 360 }, pins: [p('in','object','In'), p('in','float','Hint'), p('in','wildcard','Aux'), p('out','string','Out')] },
  { key: 'format',    type: 'Format',    category: 'data',    description: 'Renders a result to a display string',    keywords: ['template'],        position: { x: 820, y: 560 }, collapsed: true, pins: [p('in','string','In'), p('out','string','Out')] },
  { key: 'display',   type: 'Display',   category: 'utility', description: 'Renders a string to the viewport',        keywords: ['show', 'output'],  position: { x: 1100, y: 120 }, pins: [p('in','string','In'), p('out','any','Out')] },
  { key: 'audit',     type: 'Audit',     category: 'utility', description: 'Logs a float for inspection',             keywords: ['log'],             position: { x: 1100, y: 280 }, pins: [p('in','float','In'), p('out','any','Out')] },
  { key: 'persist',   type: 'Persist',   category: 'utility', description: 'Writes a string to durable storage',      keywords: ['save', 'write'],   position: { x: 1100, y: 440 }, pins: [p('in','string','In'), p('out','any','Out')] },
  { key: 'notify',    type: 'Notify',    category: 'utility', description: 'Pushes a notification on completion',     keywords: ['alert', 'webhook'],position: { x: 1100, y: 600 }, pins: [p('in','string','In'), p('out','any','Out')] },
  { key: 'archive',   type: 'Archive',   category: 'utility', description: 'Cold-stores any payload',                 keywords: ['cold', 'backup'],  position: { x: 1380, y: 360 }, pins: [p('in','any','In'),  p('out','any','Out')] },
]

// ---- connections (reroutes wired in) ---------------------------------------------------------
// Reroute nodes participate as ordinary endpoints: pin 0 = in, pin 1 = out.
const CONNS: Conn[] = [
  ['source', 0, 'sample', 0, 'float'],
  ['sample', 1, 'filter', 0, 'float'],
  ['filter', 1, 'gather', 0, 'float'],
  ['sample', 1, 'gather', 1, 'float'],
  // cache → (inline $reroute knot) → gather.C — the knot just carries the object wire through.
  ['cache', 1, 'rr_inline', 0, 'object'],
  ['rr_inline', 1, 'gather', 2, 'object'],
  ['gather', 3, 'transform', 0, 'object'],
  ['gather', 3, 'pack', 0, 'object'],
  ['cache', 1, 'pack', 1, 'object'],
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

export const demoGraph: XenolithGraphV1 = { version: 'xenolith.v1', nodes, edges }

/** Schemas for the insert palette — derived from the same SPECS so Tab / double-click can spawn
 *  any demo node type. (The rectangular `Reroute` is a built-in, auto-registered by the editor.) */
export const demoSchemas: NodeSchema[] = SPECS.map((spec) => ({
  type: spec.type,
  title: spec.title ?? spec.type,
  category: spec.category,
  description: spec.description,
  keywords: spec.keywords ?? [],
  pins: spec.pins.map((pn) => ({ kind: 'data', direction: pn.dir, type: pn.type, label: pn.label, multiple: pn.dir === 'out' })),
}))
