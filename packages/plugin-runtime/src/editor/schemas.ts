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
  { type: 'Loop',    title: 'Loop',     category: 'flow', description: 'Counted loop with cond — runs body while cond is true, up to `max` times', pins: [ei(), di('max', 'scalar'), di('cond', 'bool'), dobj('idx', 'scalar'), eo('body'), eo('done')] },
  // state
  // Every widget MUST be pinKey-bound (core's layout reserves no body band for non-bound widgets).
  // KNOWN VISUAL ISSUE: widget rect spans the full row width, so it overlaps the bound pin's label
  // (e.g. "warehouse" widget overlaps "value" pin label). Awaiting core fix
  // (see docs/widget-pin-label-overlap.md); for now we accept the overlap.
  { type: 'SetVar', title: 'Set Variable', category: 'state', description: 'Write a variable (persists across ticks)', pins: [ei(), di('value', 'any'), eo()], widgets: [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: 'value', visibility: 'always' }] },
  { type: 'GetVar', title: 'Get Variable', category: 'state', description: 'Read a variable',                          pure: true, pins: [dobj('value', 'any')],                widgets: [{ id: 'name',  type: 'text',   key: 'name',  label: '', pinKey: 'value', visibility: 'always' }] },
  // First-class declared I/O — used by AS-WASM codegen to derive tickArgs signature automatically.
  // Visually distinct (`io` category, amber) so a reader sees graph boundary at a glance.
  { type: 'GraphInput',  title: 'Input',  category: 'io', description: 'Declared graph input — passed in as a tickArgs parameter.',  pure: true, pins: [dobj('value', 'scalar')], widgets: [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: 'value', visibility: 'always' }] },
  { type: 'GraphOutput', title: 'Output', category: 'io', description: 'Declared graph output — returned by tickArgs (first Output) or read via getVar.', pins: [ei(), di('value', 'scalar'), eo()], widgets: [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: 'value', visibility: 'always' }] },
  // Tick-scoped state cell. ONE node = ONE physical storage slot. Reset to `initial` each tick.
  // Reads via `value` pin (pure), writes via the exec path (`set` data-in + ein/eo). Multi-reader
  // friendly — wire `value` to as many consumers as you like; the visual "all roads lead here"
  // makes loop state legible without scattering 8 GetVar("zx") nodes.
  { type: 'Local', title: 'Local', category: 'state', description: 'Tick-scoped state cell — read via `value`, write via `set`. Resets to `initial` each tick.',
    pins: [ei(), di('set', 'scalar'), eo(), dobj('value', 'scalar')],
    widgets: [
      { id: 'name',    type: 'text',   key: 'name',    label: '', pinKey: 'value', visibility: 'always' },
      { id: 'initial', type: 'number', key: 'initial', label: 'init = ', pinKey: 'set', visibility: 'always' },
    ],
  },
  { type: 'Const',  title: 'Const',        category: 'state', description: 'A literal number',                          pure: true, pins: [dobj('out', 'scalar')],               widgets: [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out',   visibility: 'always' }] },
  {
    type: 'Struct', title: 'Struct', category: 'state',
    description: 'A configurable bag of fields. Wire a Schema into `schema` to synthesize one in-pin per field.',
    pure: true,
    pins: [
      { kind: 'data', direction: 'in', type: 'object', label: 'schema' },
      dobj('self', 'object'),
    ],
  },
  {
    type: 'Schema', title: 'Schema', category: 'state',
    description: 'Field definitions ({fieldName: defaultValue}) consumed by a Struct via its schema pin.',
    pure: true,
    // Two pins:
    //   - `fields` IN  — binding-only target for the struct DOM widget (key='fields' auto-binds
    //                    via the editor's pin-key match). IN-pin rows host bound widgets cleanly;
    //                    OUT-pin binding produces visual artifacts (pin + widget on separate rows).
    //   - `definition` OUT — emits `state.fields` to downstream Struct.schema pins.
    pins: [di('fields', 'object'), { kind: 'data', direction: 'out', type: 'object', label: '' }],
    widgets: [{ id: 'fields', type: 'custom', renderer: 'struct', key: 'fields', label: '', height: 110 }],
  },
  // math
  { type: 'Add', title: 'Add', category: 'math', pure: true, pins: [di('a', 'scalar'), di('b', 'scalar'), dobj('out', 'scalar')] },
  { type: 'Sub', title: 'Subtract', category: 'math', pure: true, pins: [di('a', 'scalar'), di('b', 'scalar'), dobj('out', 'scalar')] },
  { type: 'Mul', title: 'Multiply', category: 'math', pure: true, pins: [di('a', 'scalar'), di('b', 'scalar'), dobj('out', 'scalar')] },
  // array
  { type: 'ZipAdd', title: 'Zip Add', category: 'array', description: 'Elementwise a + b', pure: true, pins: [di('a', 'array'), di('b', 'array'), dobj('out', 'array')] },
  { type: 'ScaleArray', title: 'Scale Array', category: 'array', description: 'array × k', pure: true, pins: [di('array', 'array'), di('k', 'scalar'), dobj('out', 'array')] },
  { type: 'Length', title: 'Length', category: 'array', pure: true, pins: [di('array', 'array'), dobj('out', 'scalar')] },
  { type: 'Mean',   title: 'Mean',   category: 'array', description: 'Arithmetic mean of an array (empty → 0)', pure: true, pins: [di('array', 'array'), dobj('out', 'scalar')] },
  { type: 'Index',         title: 'Index',          category: 'array', description: 'Element at index (oob → undefined)', pure: true, pins: [di('array', 'array'), di('idx', 'scalar'),                              dobj('out', 'any')]    },
  { type: 'ArrayWrite',    title: 'Array Write',    category: 'array', description: 'Immutable array.set(idx, value)',     pure: true, pins: [di('array', 'array'), di('idx', 'scalar'), di('value', 'any'),         dobj('out', 'array')]  },
  { type: 'Includes',      title: 'Includes',       category: 'array', description: 'array.includes(item) → bool',         pure: true, pins: [di('array', 'array'), di('item', 'any'),                              dobj('out', 'bool')]   },
  { type: 'ArgMax',        title: 'ArgMax',         category: 'array', description: 'Index of max value (empty → -1)',     pure: true, pins: [di('array', 'array'),                                                  dobj('out', 'scalar')] },
  { type: 'FilterIndices', title: 'Filter Indices', category: 'array', description: 'Indices of subarrays containing item', pure: true, pins: [di('array', 'array'), di('item', 'any'),                              dobj('out', 'array')]  },
  { type: 'ObjectGet',     title: 'Object Get',     category: 'array', description: 'obj[key] — dynamic field lookup',     pure: true, pins: [di('obj', 'object'),  di('key', 'any'),                              dobj('out', 'any')]    },
  { type: 'IndexAll',      title: 'Index All',      category: 'array', description: 'array[indices] → subset',             pure: true, pins: [di('array', 'array'), di('idxs', 'array'),                            dobj('out', 'array')]  },
  { type: 'Append',        title: 'Append',         category: 'array', description: 'Immutable array.push(item)',          pure: true, pins: [di('array', 'array'), di('item', 'any'),                              dobj('out', 'array')]  },
  { type: 'Gt',            title: 'Greater',        category: 'math',  description: 'a > b → bool',                        pure: true, pins: [di('a', 'scalar'), di('b', 'scalar'),                                dobj('out', 'bool')]   },
  { type: 'Gte',           title: 'Greater or Eq',  category: 'math',  description: 'a >= b → bool',                       pure: true, pins: [di('a', 'scalar'), di('b', 'scalar'),                                dobj('out', 'bool')]   },
  { type: 'Eq',            title: 'Equal',          category: 'math',  description: 'a === b → bool',                      pure: true, pins: [di('a', 'any'),    di('b', 'any'),                                  dobj('out', 'bool')]   },
  { type: 'Floor',         title: 'Floor',          category: 'math',  description: 'Math.floor(n)',                       pure: true, pins: [di('n', 'scalar'),                                                     dobj('out', 'scalar')] },
  { type: 'Repeat',        title: 'Repeat',         category: 'array', description: '[item, item, …] × count',             pure: true, pins: [di('item', 'any'), di('count', 'scalar'),                              dobj('out', 'array')]  },
  { type: 'ObjectSet',     title: 'Object Set',     category: 'array', description: 'Immutable {...obj, [key]: value}',    pure: true, pins: [di('obj', 'object'), di('key', 'any'), di('value', 'any'),            dobj('out', 'object')] },
  { type: 'Concat',        title: 'Concat',         category: 'array', description: 'Merge two arrays',                    pure: true, pins: [di('a', 'array'), di('b', 'array'),                                   dobj('out', 'array')]  },
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
      { id: 'nodeType', type: 'text', key: 'nodeType', label: 'node type', pinKey: 'values', visibility: 'always' },
      { id: 'field',    type: 'text', key: 'field',    label: 'field',     pinKey: 'values', visibility: 'always' },
    ],
  },
  {
    type: 'Scatter', title: 'Scatter', category: 'domain', description: 'Write an array back onto each node of a type',
    pins: [ei(), di('values', 'array'), eo()],
    widgets: [
      { id: 'nodeType', type: 'text', key: 'nodeType', label: 'node type', pinKey: 'values', visibility: 'always' },
      { id: 'field',    type: 'text', key: 'field',    label: 'field',     pinKey: 'values', visibility: 'always' },
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
      { id: 'nodeType', type: 'text', key: 'nodeType', label: 'node type', pinKey: 'records', visibility: 'always' },
      { id: 'fields',   type: 'text', key: 'fields',   label: 'fields',    pinKey: 'records', visibility: 'always' },
    ],
  },
  {
    type: 'GetField', title: 'Get Field', category: 'array', description: 'Read a field from a record',
    pure: true, pins: [di('record', 'object'), dobj('value', 'any')],
    widgets: [{ id: 'field', type: 'text', key: 'field', label: '', pinKey: 'record', visibility: 'always' }],
  },
  {
    type: 'MapField', title: 'Map Field', category: 'array', description: 'Pick the same field from every record → array',
    pure: true, pins: [di('records', 'array'), dobj('values', 'array')],
    widgets: [{ id: 'field', type: 'text', key: 'field', label: '', pinKey: 'records', visibility: 'always' }],
  },
  {
    type: 'Output', title: 'Output', category: 'state',
    description: 'Display the wired value in the node (host renders it as a widget)',
    pins: [ei(), di('value', 'any'), eo()],
    widgets: [{ id: 'value', type: 'custom', renderer: 'output', key: 'value', label: '', height: 40, pinKey: 'value' }],
  },
  {
    type: 'ToMap', title: 'To Map', category: 'array', description: 'records[] → { key: value } object',
    pure: true, pins: [di('records', 'array'), dobj('map', 'object')],
    // Only the `key` widget is editable in-node — core's pin-row layout pairs the records IN and
    // map OUT pins on the SAME row, so showing a second widget for `value` would overlap. The
    // value-field is set programmatically via `state.value` (or by editing the V1 graph JSON).
    // Resolves when core supports vertical widget stacking in a pin row (see issue doc).
    widgets: [
      { id: 'key', type: 'text', key: 'key', label: '', pinKey: 'records', visibility: 'always' },
    ],
  },
]

/** Header glyph icon per primitive type (names from render-pixi's built-in Feather set). Hosts can
 *  apply these to node `glyph` so the generic nodes are visually distinguishable at a glance. */
export const PRIMITIVE_ICONS: Record<string, string> = {
  Tick: 'play', Init: 'flag',
  GetVar: 'database', SetVar: 'database', Const: 'square',
  GraphInput: 'arrow-right', GraphOutput: 'arrow-right',
  Local: 'box',
  Add: 'cpu', Sub: 'cpu', Mul: 'cpu',
  ZipAdd: 'layers', ScaleArray: 'layers', Length: 'layers', Mean: 'layers',
  Index: 'layers', ArrayWrite: 'layers', Includes: 'layers', ArgMax: 'layers', FilterIndices: 'layers',
  ObjectGet: 'layers', IndexAll: 'layers', Append: 'layers',
  Gt: 'cpu', Gte: 'cpu', Eq: 'cpu',
  Floor: 'cpu', Repeat: 'layers', ObjectSet: 'layers', Concat: 'layers',
  Branch: 'branch', Sequence: 'code', ForEach: 'code', Loop: 'code',
  Allocate: 'box', Spawn: 'zap',
  Gather: 'database', Scatter: 'database',
  GatherFromInputs: 'database', ScatterToOutputs: 'database',
  GetField: 'layers', MapField: 'layers', GatherRecords: 'database', ToMap: 'layers',
  Output: 'flag',
  Struct: 'box',
  Schema: 'layers',
}
for (const s of PRIMITIVE_SCHEMAS) s.glyph = { icon: PRIMITIVE_ICONS[s.type] ?? 'circle', side: 'left' }

/** Colours for the primitive categories — declared in the runtime preset's `categories` palette. */
export const PRIMITIVE_CATEGORY_COLORS = {
  flow: { color: '#E8E8E8' },
  state: { color: '#5B9DFF' },
  math: { color: '#4FC08D' },
  array: { color: '#3FB6FF' },
  domain: { color: '#FFB020' },
  io: { color: '#E6C87A' }, // amber — graph boundary (Input/Output)
} as const
