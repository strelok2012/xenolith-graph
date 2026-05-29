// Editor-facing declarations: pin TYPES (colour/compatibility) and node SCHEMAS for the palette.
// Pure data — no editor import needed. Pin colours are semantic and chosen to read on BOTH themes
// (Xen dark/gold and Liquid Glass). Pin ORDER in each schema is the contract the index-addressed
// interpreter relies on (see vm/interpreter.ts) — keep it aligned with each primitive's evaluator.

import type { NodeSchema, PinSchema, TypeDescriptor } from '@xenolith/core'

export const PIN_TYPES: TypeDescriptor[] = [
  { id: 'exec', color: '#E8E8E8', shape: 'arrow' }, // control flow
  { id: 'scalar', color: '#4FC08D', shape: 'circle' }, // number
  { id: 'bool', color: '#E5484D', shape: 'circle' },
  { id: 'array', color: '#5B9DFF', shape: 'circle' }, // collections (agents/units/…)
  { id: 'object', color: '#C18CFF', shape: 'diamond' }, // records (e.g. costs map)
  { id: 'any', color: '#9AA0A6', shape: 'circle' },
]

// exec pins render as the arrow glyph — plain in/out carry NO text label (UE-style); only branching
// exec outs (Branch true/false, ForEach body/completed, Sequence then N) keep a meaningful label.
const ei = (): PinSchema => ({ kind: 'exec', direction: 'in', type: 'exec', label: '' })
const eo = (label = ''): PinSchema => ({ kind: 'exec', direction: 'out', type: 'exec', label })
const di = (label: string, type: string): PinSchema => ({ kind: 'data', direction: 'in', type, label })
const dobj = (label: string, type: string): PinSchema => ({ kind: 'data', direction: 'out', type, label })

// category → palette/header colour group (the loaded graph supplies the actual `categories` palette).
export const PRIMITIVE_SCHEMAS: NodeSchema[] = [
  // flow
  { type: 'Tick', title: 'Tick', category: 'flow', description: 'Per-step entry point', pins: [eo()] },
  { type: 'Init', title: 'Init', category: 'flow', description: 'Runs once at start (seed variables)', pins: [eo()] },
  { type: 'Spawn', title: 'Spawn', category: 'domain', description: 'Fractional spawner: {type,rate}[] → units this tick', pins: [ei(), di('specs', 'array'), dobj('units', 'array'), eo()] },
  { type: 'Sequence', title: 'Sequence', category: 'flow', description: 'Fire outputs in order', pins: [ei(), eo('then 0'), eo('then 1')] },
  { type: 'Branch', title: 'Branch', category: 'flow', description: 'If / else on a bool', pins: [ei(), di('cond', 'bool'), eo('true'), eo('false')] },
  { type: 'ForEach', title: 'For Each', category: 'flow', description: 'Loop over an array', pins: [ei(), di('array', 'array'), dobj('element', 'any'), dobj('index', 'scalar'), eo('body'), eo('completed')] },
  // state
  { type: 'SetVar', title: 'Set Variable', category: 'state', description: 'Write a variable (persists across ticks)', pins: [ei(), di('value', 'any'), eo()], widgets: [{ id: 'name', type: 'text', key: 'name', label: 'name' }] },
  { type: 'GetVar', title: 'Get Variable', category: 'state', description: 'Read a variable', pure: true, pins: [dobj('value', 'any')], widgets: [{ id: 'name', type: 'text', key: 'name', label: 'name' }] },
  { type: 'Const', title: 'Const', category: 'state', description: 'A literal number', pure: true, pins: [dobj('out', 'scalar')], widgets: [{ id: 'value', type: 'number', key: 'value', label: 'value' }] },
  // math
  { type: 'Add', title: 'Add', category: 'math', pure: true, pins: [di('a', 'scalar'), di('b', 'scalar'), dobj('out', 'scalar')] },
  { type: 'Sub', title: 'Subtract', category: 'math', pure: true, pins: [di('a', 'scalar'), di('b', 'scalar'), dobj('out', 'scalar')] },
  { type: 'Mul', title: 'Multiply', category: 'math', pure: true, pins: [di('a', 'scalar'), di('b', 'scalar'), dobj('out', 'scalar')] },
  // array
  { type: 'ZipAdd', title: 'Zip Add', category: 'array', description: 'Elementwise a + b', pure: true, pins: [di('a', 'array'), di('b', 'array'), dobj('out', 'array')] },
  { type: 'ScaleArray', title: 'Scale Array', category: 'array', description: 'array × k', pure: true, pins: [di('array', 'array'), di('k', 'scalar'), dobj('out', 'array')] },
  { type: 'Length', title: 'Length', category: 'array', pure: true, pins: [di('array', 'array'), dobj('out', 'scalar')] },
  // domain
  {
    type: 'Allocate', title: 'Allocate', category: 'domain',
    description: 'Route each unit to the top-priority subscriber; cost is subtracted',
    pins: [
      ei(), di('priorities', 'array'), di('subs', 'array'), di('arrivals', 'array'), di('costs', 'object'),
      dobj('priorities', 'array'), dobj('awards', 'array'), dobj('leftovers', 'array'), eo(),
    ],
  },
  // collection bridge: domain nodes ↔ algorithm. `nodeType`/`field` widgets pick what to read/write.
  {
    type: 'Gather', title: 'Gather', category: 'domain', description: 'Read a field from every node of a type → array',
    pure: true, pins: [dobj('values', 'array')],
    widgets: [
      { id: 'nodeType', type: 'text', key: 'nodeType', label: 'node type' },
      { id: 'field', type: 'text', key: 'field', label: 'field' },
    ],
  },
  {
    type: 'Scatter', title: 'Scatter', category: 'domain', description: 'Write an array back onto each node of a type',
    pins: [ei(), di('values', 'array'), eo()],
    widgets: [
      { id: 'nodeType', type: 'text', key: 'nodeType', label: 'node type' },
      { id: 'field', type: 'text', key: 'field', label: 'field' },
    ],
  },
  // Wire-driven gather/scatter: visible plumbing. One multi-input on Gather; one data-out per
  // consumer on Scatter (the host adds pins via setNodePins as consumers connect).
  {
    type: 'GatherFromInputs', title: 'Gather', category: 'domain',
    description: 'Collects wired inputs into an array (in edge order)',
    pure: true,
    pins: [di('items', 'any'), dobj('values', 'array')],
  },
  {
    type: 'ScatterToOutputs', title: 'Scatter', category: 'domain',
    description: 'Publishes array elements onto each declared data-out pin',
    pins: [ei(), di('value', 'array'), eo()],
  },
  {
    type: 'GatherRecords', title: 'Gather Records', category: 'domain', description: 'Read several fields from every node of a type → objects',
    pure: true, pins: [dobj('records', 'array')],
    widgets: [
      { id: 'nodeType', type: 'text', key: 'nodeType', label: 'node type' },
      { id: 'fields', type: 'text', key: 'fields', label: 'fields (csv)' },
    ],
  },
  {
    type: 'GetField', title: 'Get Field', category: 'array', description: 'Read a field from a record',
    pure: true, pins: [di('record', 'object'), dobj('value', 'any')],
    widgets: [{ id: 'field', type: 'text', key: 'field', label: 'field' }],
  },
  {
    type: 'MapField', title: 'Map Field', category: 'array', description: 'Pick the same field from every record → array',
    pure: true, pins: [di('records', 'array'), dobj('values', 'array')],
    widgets: [{ id: 'field', type: 'text', key: 'field', label: 'field' }],
  },
  {
    type: 'Output', title: 'Output', category: 'state',
    description: 'Display the wired value in the node (host renders it as a widget)',
    pins: [ei(), di('value', 'any'), eo()],
    widgets: [{ id: 'value', type: 'custom', renderer: 'output', key: 'value', label: '', height: 40 }],
  },
  {
    type: 'ToMap', title: 'To Map', category: 'array', description: 'records[] → { key: value } object',
    pure: true, pins: [di('records', 'array'), dobj('map', 'object')],
    widgets: [
      { id: 'key', type: 'text', key: 'key', label: 'key field' },
      { id: 'value', type: 'text', key: 'value', label: 'value field' },
    ],
  },
]

/** Header glyph icon per primitive type (names from render-pixi's built-in Feather set). Hosts can
 *  apply these to node `glyph` so the generic nodes are visually distinguishable at a glance. */
export const PRIMITIVE_ICONS: Record<string, string> = {
  Tick: 'play', Init: 'flag',
  GetVar: 'database', SetVar: 'database', Const: 'square',
  Add: 'cpu', Sub: 'cpu', Mul: 'cpu',
  ZipAdd: 'layers', ScaleArray: 'layers', Length: 'layers',
  Branch: 'branch', Sequence: 'code', ForEach: 'code',
  Allocate: 'box', Spawn: 'zap',
  Gather: 'database', Scatter: 'database',
  GatherFromInputs: 'database', ScatterToOutputs: 'database',
  GetField: 'layers', MapField: 'layers', GatherRecords: 'database', ToMap: 'layers',
  Output: 'flag',
}
for (const s of PRIMITIVE_SCHEMAS) s.glyph = { icon: PRIMITIVE_ICONS[s.type] ?? 'circle', side: 'left' }

/** Colours for the primitive categories — declared in the runtime preset's `categories` palette. */
export const PRIMITIVE_CATEGORY_COLORS = {
  flow: { color: '#E8E8E8' },
  state: { color: '#5B9DFF' },
  math: { color: '#4FC08D' },
  array: { color: '#3FB6FF' },
  domain: { color: '#FFB020' },
} as const
