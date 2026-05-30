import type { Edge, Node } from './graph.js'
import type { NodeId, PinId, EdgeId } from './ids.js'
import {
  TEMPLATE_INPUT_TYPE,
  TEMPLATE_OUTPUT_TYPE,
  isTemplateBoundary,
  isTemplateInstance,
  type TemplateDefId,
  type TemplateDefinition,
} from './template-def.js'

export interface PinRef { node: NodeId; pin: PinId }

/** Read-only flattening of a `$templateInstance` into the plain primitive subgraph a host evaluator
 *  can execute. Boundary nodes dissolve into a pin remap: `boundary.inputs[instancePin]` are the
 *  internal IN-pins an instance input feeds (fan-out possible), `boundary.outputs[instancePin]` is the
 *  internal OUT-pin an instance output is produced by. Nested instances expand recursively. */
export interface FlattenedTemplate {
  nodes: Node[]
  edges: Edge[]
  boundary: {
    inputs: Record<string, PinRef[]>
    outputs: Record<string, PinRef>
  }
}

interface FlattenMint {
  node: () => NodeId
  pin: () => PinId
  edge: () => EdgeId
}

/** Flatten `instance` against the definitions reachable through `resolveDef`. Returns null if a
 *  definition is missing or a recursion cycle is detected (a definition transitively containing an
 *  instance of itself). Pure — never mutates the instance, definitions, or document. */
export function flattenTemplateInstance(
  instance: Node,
  resolveDef: (defId: TemplateDefId) => TemplateDefinition | undefined,
  mint: FlattenMint,
): FlattenedTemplate | null {
  return flatten(instance, resolveDef, mint, [])
}

function flatten(
  instance: Node,
  resolveDef: (defId: TemplateDefId) => TemplateDefinition | undefined,
  mint: FlattenMint,
  path: TemplateDefId[],
): FlattenedTemplate | null {
  const defId = instance.state['definitionId'] as TemplateDefId | undefined
  if (defId === undefined) return null
  if (path.includes(defId)) return null // cycle: this definition is already being flattened above us
  const def = resolveDef(defId)
  if (!def) return null
  const childPath = [...path, defId]

  const boundaryToInstPin = invertPinBoundary(instance)

  const nodes: Node[] = []
  const edges: Edge[] = []
  const inputs: Record<string, PinRef[]> = {}
  const outputs: Record<string, PinRef> = {}

  // Resolve each definition member: a primitive gets a fresh-id clone; a nested instance is flattened
  // recursively and remembered so edges touching its pins redirect to its internal pins.
  const primitive = new Map<string, { id: NodeId; pinRemap: Map<string, PinId> }>()
  const nested = new Map<string, FlattenedTemplate>()
  for (const m of def.nodes) {
    if (isTemplateBoundary(m)) continue
    if (isTemplateInstance(m)) {
      const child = flatten(m, resolveDef, mint, childPath)
      if (!child) return null
      nodes.push(...child.nodes)
      edges.push(...child.edges)
      nested.set(String(m.id), child)
      continue
    }
    const id = mint.node()
    const pinRemap = new Map<string, PinId>()
    const pins = m.pins.map((p) => { const np = mint.pin(); pinRemap.set(String(p.id), np); return { ...p, id: np } })
    primitive.set(String(m.id), { id, pinRemap })
    nodes.push({
      ...m, id, position: { ...m.position }, state: { ...m.state }, pins,
      ...(m.size ? { size: { ...m.size } } : {}),
      ...(m.widgets ? { widgets: m.widgets.map((w) => ({ ...w })) } : {}),
      ...(m.meta ? { meta: { ...m.meta } } : {}),
    })
  }

  // Resolve an OUT endpoint (the producing pin) to its concrete internal pin(s) — normally one.
  const resolveOut = (node: NodeId, pin: PinId): PinRef[] => {
    const prim = primitive.get(String(node))
    if (prim) return [{ node: prim.id, pin: prim.pinRemap.get(String(pin))! }]
    const child = nested.get(String(node))
    if (child) { const o = child.boundary.outputs[String(pin)]; return o ? [o] : [] }
    return []
  }
  // Resolve an IN endpoint (the consuming pin) to its concrete internal pin(s) — a nested input may
  // fan out to several internal pins.
  const resolveIn = (node: NodeId, pin: PinId): PinRef[] => {
    const prim = primitive.get(String(node))
    if (prim) return [{ node: prim.id, pin: prim.pinRemap.get(String(pin))! }]
    const child = nested.get(String(node))
    if (child) return child.boundary.inputs[String(pin)] ?? []
    return []
  }

  for (const e of def.edges) {
    const srcInput = isType(def, e.from.node, TEMPLATE_INPUT_TYPE)
    const dstOutput = isType(def, e.to.node, TEMPLATE_OUTPUT_TYPE)
    if (srcInput && dstOutput) continue // degenerate passthrough (input wired straight to output)
    if (srcInput) {
      const instPin = boundaryToInstPin.get(String(e.from.node))
      if (instPin === undefined) continue
      ;(inputs[instPin] ??= []).push(...resolveIn(e.to.node, e.to.pin))
    } else if (dstOutput) {
      const instPin = boundaryToInstPin.get(String(e.to.node))
      if (instPin === undefined) continue
      const producer = resolveOut(e.from.node, e.from.pin)[0]
      if (producer) outputs[instPin] = producer
    } else {
      const srcs = resolveOut(e.from.node, e.from.pin)
      const dsts = resolveIn(e.to.node, e.to.pin)
      for (const s of srcs) for (const d of dsts) edges.push({ id: mint.edge(), from: s, to: d })
    }
  }

  return { nodes, edges, boundary: { inputs, outputs } }
}

/** Snapshot-level helper: replace every `$templateInstance` in (`nodes`, `edges`) with its flattened
 *  primitive sub-graph and rewire the external edges that touched the instance's interface pins to
 *  the boundary-mapped internal pins. Mirrors `flattenMacroProxies` for templates. Pure — inputs are
 *  not mutated. An instance whose definition is missing or recursive is left in place. */
export function flattenAllTemplateInstances(
  nodes: Node[],
  edges: Edge[],
  resolveDef: (defId: TemplateDefId) => TemplateDefinition | undefined,
  mint: FlattenMint,
): { nodes: Node[]; edges: Edge[] } {
  const instanceFlat = new Map<string, FlattenedTemplate>()
  const outNodes: Node[] = []
  for (const n of nodes) {
    if (!isTemplateInstance(n)) { outNodes.push(n); continue }
    const flat = flattenTemplateInstance(n, resolveDef, mint)
    if (!flat) { outNodes.push(n); continue } // unresolved / recursive — leave as data so the host sees it
    instanceFlat.set(String(n.id), flat)
    outNodes.push(...flat.nodes)
  }
  const outEdges: Edge[] = []
  for (const e of edges) {
    const srcFlat = instanceFlat.get(String(e.from.node))
    const dstFlat = instanceFlat.get(String(e.to.node))
    if (!srcFlat && !dstFlat) { outEdges.push(e); continue }
    const sources = srcFlat
      ? (srcFlat.boundary.outputs[String(e.from.pin)] ? [srcFlat.boundary.outputs[String(e.from.pin)]!] : [])
      : [{ node: e.from.node, pin: e.from.pin }]
    const targets = dstFlat
      ? (dstFlat.boundary.inputs[String(e.to.pin)] ?? [])
      : [{ node: e.to.node, pin: e.to.pin }]
    for (const s of sources) for (const t of targets) outEdges.push({ id: mint.edge(), from: s, to: t })
  }
  // Internal definition edges already live in flat.edges (carried via outNodes' spread above isn't right —
  // edges live separately). Concat them explicitly.
  for (const flat of instanceFlat.values()) outEdges.push(...flat.edges)
  return { nodes: outNodes, edges: outEdges }
}

function invertPinBoundary(instance: Node): Map<string, string> {
  const pinBoundary = (instance.state['pinBoundary'] ?? {}) as Record<string, string>
  const out = new Map<string, string>()
  for (const [pinId, boundaryId] of Object.entries(pinBoundary)) out.set(boundaryId, pinId)
  return out
}

function isType(def: TemplateDefinition, nodeId: NodeId, type: string): boolean {
  const n = def.nodes.find((x) => String(x.id) === String(nodeId))
  return n?.type === type
}
