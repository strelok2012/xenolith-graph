import { REROUTE_TYPE } from '@xenolith/core'
import type { NodeSchema, PinSchema, WidgetSpec } from '@xenolith/core'
import type { XenolithGraphV1, XenolithNodeV1, XenolithPinV1, XenolithEdgeV1 } from '@xenolith/editor'

/**
 * Map a ComfyUI node's positional `widgets_values` to typed widgets. Without the server's
 * `object_info`, the workflow JSON only carries the *values* (not widget names/types), so we infer
 * the control from the value's runtime type: number→number, boolean→toggle, string→text (multiline
 * when long / has newlines). Values seed `node.state[wN]`. Full fidelity (names, combos, min/max)
 * arrives when object_info is supplied — a later upgrade.
 */
function widgetsFromValues(values: unknown): { widgets: WidgetSpec[]; state: Record<string, unknown> } {
  const widgets: WidgetSpec[] = []
  const state: Record<string, unknown> = {}
  if (!Array.isArray(values)) return { widgets, state }
  values.forEach((v, i) => {
    const key = `w${i}`
    // Without object_info the widget's real name is unknown — a positional `param N` label is the
    // honest best (still distinguishes the controls). Long text gets its label above, on its own row.
    const label = `param ${i + 1}`
    if (typeof v === 'number') widgets.push({ id: key, type: 'number', label, key })
    else if (typeof v === 'boolean') widgets.push({ id: key, type: 'toggle', label, key })
    else if (typeof v === 'string') widgets.push({ id: key, type: 'text', label, key, multiline: v.length > 36 || v.includes('\n') })
    else return // arrays / objects (e.g. seed-control pairs) — skip
    state[key] = v
  })
  return { widgets, state }
}

/** ComfyUI/litegraph reroute node type names that map onto our core reroute knot. */
const COMFY_REROUTE_TYPES = new Set(['Reroute', 'RerouteNode', 'Reroute (rgthree)'])

/**
 * ComfyUI / litegraph workflow JSON → xenolith.v1 graph (+ derived node schemas).
 *
 * Pure transform — no editor, no DOM. The demo feeds the graph to `editor.loadJSON()` and the
 * schemas to `editor.registry` so the insert palette can spawn more of the same node types.
 *
 * Every node's raw ComfyUI payload (type, widgets_values, properties, title) is preserved under
 * `state.__comfy` so a later export-back to ComfyUI can reconstruct the node faithfully — the key
 * enabler for clipboard interop.
 */

const COMFY_TYPE_MAP: Record<string, string> = {
  MODEL: 'object', LATENT: 'object', VAE: 'object', CLIP: 'object',
  CONDITIONING: 'object', IMAGE: 'object', MASK: 'object', CONTROL_NET: 'object',
  INT: 'float', FLOAT: 'float', NUMBER: 'float',
  STRING: 'string',
  '*': 'any',
}

export function comfyTypeToXen(comfyType: string): string {
  return COMFY_TYPE_MAP[comfyType] ?? (comfyType === '*' ? 'any' : 'object')
}

interface ComfySlot { name?: string; type?: string }
interface ComfyNode {
  id: number
  type: string
  title?: string
  pos?: [number, number] | Record<string, number>
  size?: [number, number] | Record<string, number>
  inputs?: ComfySlot[]
  outputs?: ComfySlot[]
  widgets_values?: unknown
  properties?: Record<string, unknown>
}
type ComfyLink = [number, number, number, number, number, (string | number)?]
interface ComfyWorkflow { nodes: ComfyNode[]; links?: ComfyLink[] }

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function vec2(v: unknown, fallback = { x: 0, y: 0 }): { x: number; y: number } {
  if (Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number') {
    return { x: v[0], y: v[1] }
  }
  if (isObj(v) && typeof v['0'] === 'number' && typeof v['1'] === 'number') {
    return { x: v['0'] as number, y: v['1'] as number }
  }
  return fallback
}

const nodeId  = (comfyId: number): string => `c${comfyId}`
const inPinId  = (comfyId: number, slot: number): string => `c${comfyId}:i${slot}`
const outPinId = (comfyId: number, slot: number): string => `c${comfyId}:o${slot}`

function pinSchemasOf(node: ComfyNode): PinSchema[] {
  const pins: PinSchema[] = []
  ;(node.inputs ?? []).forEach((s) => {
    pins.push({ kind: 'data', direction: 'in', type: comfyTypeToXen(s.type ?? '*'), label: s.name ?? s.type ?? 'in', multiple: false })
  })
  ;(node.outputs ?? []).forEach((s) => {
    pins.push({ kind: 'data', direction: 'out', type: comfyTypeToXen(s.type ?? '*'), label: s.name ?? s.type ?? 'out', multiple: true })
  })
  return pins
}

export interface ComfyImportResult {
  graph: XenolithGraphV1
  schemas: NodeSchema[]
}

export function importComfyWorkflow(input: unknown): ComfyImportResult {
  if (!isObj(input) || !Array.isArray(input['nodes'])) {
    throw new Error('importComfyWorkflow: not a ComfyUI workflow (missing nodes[])')
  }
  const wf = input as unknown as ComfyWorkflow
  const present = new Set(wf.nodes.map((n) => n.id))

  const nodes: XenolithNodeV1[] = wf.nodes.map((n) => {
    const reroute = COMFY_REROUTE_TYPES.has(n.type)
    // A reroute resolves its wire colour from the output slot (the input is a bare '*'); colour
    // both knot pins identically so the dot reads as a single typed wire.
    const rerouteType = reroute
      ? comfyTypeToXen(n.outputs?.[0]?.type ?? n.inputs?.[0]?.type ?? '*')
      : ''

    const pins: XenolithPinV1[] = []
    ;(n.inputs ?? []).forEach((s, i) => {
      pins.push({ id: inPinId(n.id, i), kind: 'data', direction: 'in', type: reroute ? rerouteType : comfyTypeToXen(s.type ?? '*'), multiple: false, label: reroute ? '' : (s.name ?? s.type ?? `in${i}`) })
    })
    ;(n.outputs ?? []).forEach((s, i) => {
      pins.push({ id: outPinId(n.id, i), kind: 'data', direction: 'out', type: reroute ? rerouteType : comfyTypeToXen(s.type ?? '*'), multiple: true, label: reroute ? '' : (s.name ?? s.type ?? `out${i}`) })
    })
    // Inline reroutes carry no widgets; everything else maps its widgets_values to typed widgets.
    const { widgets, state: widgetState } = reroute
      ? { widgets: [], state: {} }
      : widgetsFromValues(n.widgets_values)
    const node: XenolithNodeV1 = {
      id: nodeId(n.id),
      type: reroute ? REROUTE_TYPE : n.type,
      position: vec2(n.pos),
      pins,
      render: { title: n.title ?? n.type },
      state: {
        ...widgetState,
        __comfy: {
          type: n.type,
          ...(n.title !== undefined ? { title: n.title } : {}),
          widgets_values: n.widgets_values ?? null,
          properties: n.properties ?? {},
        },
      },
    }
    if (widgets.length > 0) node.widgets = widgets
    return node
  })

  // Resolve every pin's xen type so an edge can be coloured by its actual source pin rather than
  // the link's `type` field, which ComfyUI frequently leaves numeric/empty — most visibly on the
  // wires leaving a Reroute, which would otherwise render grey/white while the knot is coloured.
  const pinType = new Map<string, string>()
  for (const n of nodes) for (const p of n.pins) pinType.set(p.id, String(p.type))

  const edges: XenolithEdgeV1[] = []
  for (const link of wf.links ?? []) {
    const [lid, src, srcSlot, dst, dstSlot, type] = link
    if (!present.has(src) || !present.has(dst)) continue
    const fromPin = outPinId(src, srcSlot)
    const linkType = typeof type === 'string' ? comfyTypeToXen(type) : undefined
    edges.push({
      id: `cl${lid}`,
      from: { node: nodeId(src), pin: fromPin },
      to:   { node: nodeId(dst), pin: inPinId(dst, dstSlot) },
      opts: { sourceType: pinType.get(fromPin) ?? linkType ?? 'any' },
    })
  }

  // One schema per distinct type, from the first node that uses it.
  const schemas: NodeSchema[] = []
  const seen = new Set<string>()
  for (const n of wf.nodes) {
    if (COMFY_REROUTE_TYPES.has(n.type)) continue // reroute is a built-in knot, not a palette type
    if (seen.has(n.type)) continue
    seen.add(n.type)
    schemas.push({ type: n.type, title: n.title ?? n.type, pins: pinSchemasOf(n) })
  }

  return { graph: { version: 'xenolith.v1', nodes, edges }, schemas }
}
