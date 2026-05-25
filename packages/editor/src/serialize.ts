import type { Edge, Node, NodeId, EdgeId, Pin, WidgetSpec } from '@xenolith/core'
import type { RenderEdgeOptions, RenderNodeOptions } from '@xenolith/render-pixi'

export const XENOLITH_GRAPH_VERSION = 'xenolith.v1' as const
export type XenolithGraphVersion = typeof XENOLITH_GRAPH_VERSION

export interface XenolithGraphV1 {
  version: XenolithGraphVersion
  viewport?: { x: number; y: number; zoom: number }
  nodes: XenolithNodeV1[]
  edges: XenolithEdgeV1[]
}

export interface XenolithNodeV1 {
  id: string
  type: string
  position: { x: number; y: number }
  size?: { x: number; y: number }
  state?: Record<string, unknown>
  pins: XenolithPinV1[]
  widgets?: WidgetSpec[]
  render?: { category?: string; title?: string; collapsed?: boolean }
}

export interface XenolithPinV1 {
  id: string
  kind: 'exec' | 'data'
  direction: 'in' | 'out'
  type: string
  multiple: boolean
  label?: string
}

export interface XenolithEdgeV1 {
  id: string
  from: { node: string; pin: string }
  to:   { node: string; pin: string }
  opts?: { sourceType?: string }
}

export interface SerializeInput {
  nodes: ReadonlyArray<Readonly<Node>>
  edges: ReadonlyArray<Readonly<Edge>>
  renderOpts: ReadonlyMap<NodeId | string, RenderNodeOptions>
  edgeOpts:   ReadonlyMap<EdgeId  | string, RenderEdgeOptions>
  viewport?: { x: number; y: number; zoom: number }
}

export interface ParsedGraph {
  viewport?: { x: number; y: number; zoom: number }
  nodes: Node[]
  edges: Edge[]
  renderOpts: Map<string, RenderNodeOptions>
  edgeOpts:   Map<string, RenderEdgeOptions>
}

function serializePin(p: Pin): XenolithPinV1 {
  const out: XenolithPinV1 = {
    id:        String(p.id),
    kind:      p.kind,
    direction: p.direction,
    type:      String(p.type),
    multiple:  p.multiple,
  }
  if (p.label !== undefined) out.label = p.label
  return out
}

function serializeNode(n: Readonly<Node>, render: RenderNodeOptions | undefined): XenolithNodeV1 {
  const out: XenolithNodeV1 = {
    id:       String(n.id),
    type:     n.type,
    position: { x: n.position.x, y: n.position.y },
    pins:     n.pins.map(serializePin),
  }
  if (n.size) out.size = { x: n.size.x, y: n.size.y }
  if (n.widgets && n.widgets.length > 0) out.widgets = n.widgets.map((w) => ({ ...w }) as WidgetSpec)
  if (n.state && Object.keys(n.state).length > 0) out.state = { ...n.state }
  if (render && (render.category !== undefined || render.title !== undefined || render.collapsed !== undefined)) {
    const r: NonNullable<XenolithNodeV1['render']> = {}
    if (render.category  !== undefined) r.category  = render.category
    if (render.title     !== undefined) r.title     = render.title
    if (render.collapsed !== undefined) r.collapsed = render.collapsed
    out.render = r
  }
  return out
}

function serializeEdge(e: Readonly<Edge>, opts: RenderEdgeOptions | undefined): XenolithEdgeV1 {
  const out: XenolithEdgeV1 = {
    id:   String(e.id),
    from: { node: String(e.from.node), pin: String(e.from.pin) },
    to:   { node: String(e.to.node),   pin: String(e.to.pin)   },
  }
  if (opts && opts.sourceType !== undefined) out.opts = { sourceType: opts.sourceType }
  return out
}

export function serializeXenolithGraph(input: SerializeInput): XenolithGraphV1 {
  const out: XenolithGraphV1 = {
    version: XENOLITH_GRAPH_VERSION,
    nodes: input.nodes.map((n) => serializeNode(n, input.renderOpts.get(String(n.id) as NodeId))),
    edges: input.edges.map((e) => serializeEdge(e, input.edgeOpts.get(String(e.id) as EdgeId))),
  }
  if (input.viewport) out.viewport = { ...input.viewport }
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function assertVec2(v: unknown, where: string): { x: number; y: number } {
  if (!isPlainObject(v) || typeof v['x'] !== 'number' || typeof v['y'] !== 'number') {
    throw new Error(`xenolith.v1 parse: ${where} must be { x: number, y: number }`)
  }
  return { x: v['x'], y: v['y'] }
}

function parsePin(v: unknown, where: string): Pin {
  if (!isPlainObject(v)) throw new Error(`xenolith.v1 parse: ${where} must be an object`)
  const id = v['id'], kind = v['kind'], direction = v['direction']
  const type = v['type'], multiple = v['multiple'], label = v['label']
  if (typeof id !== 'string')        throw new Error(`xenolith.v1 parse: ${where}.id must be string`)
  if (kind !== 'exec' && kind !== 'data') throw new Error(`xenolith.v1 parse: ${where}.kind invalid`)
  if (direction !== 'in' && direction !== 'out') {
    throw new Error(`xenolith.v1 parse: ${where}.direction invalid`)
  }
  if (typeof type !== 'string')      throw new Error(`xenolith.v1 parse: ${where}.type must be string`)
  if (typeof multiple !== 'boolean') throw new Error(`xenolith.v1 parse: ${where}.multiple must be boolean`)
  const pin: Pin = { id: id as Pin['id'], kind, direction, type, multiple }
  if (typeof label === 'string') pin.label = label
  return pin
}

const WIDGET_TYPES = new Set(['number', 'slider', 'combo', 'text', 'toggle', 'button', 'color', 'custom'])

function parseWidget(v: unknown, where: string): WidgetSpec {
  if (!isPlainObject(v)) throw new Error(`xenolith.v1 parse: ${where} must be an object`)
  const { id, type, label } = v
  if (typeof id !== 'string')    throw new Error(`xenolith.v1 parse: ${where}.id must be string`)
  if (typeof type !== 'string' || !WIDGET_TYPES.has(type)) {
    throw new Error(`xenolith.v1 parse: ${where}.type invalid`)
  }
  if (typeof label !== 'string') throw new Error(`xenolith.v1 parse: ${where}.label must be string`)
  if ((type !== 'button' && type !== 'custom') && typeof v['key'] !== 'string') {
    throw new Error(`xenolith.v1 parse: ${where}.key must be string for type "${type}"`)
  }
  if (type === 'button' && typeof v['action'] !== 'string') {
    throw new Error(`xenolith.v1 parse: ${where}.action must be string`)
  }
  if (type === 'custom' && typeof v['renderer'] !== 'string') {
    throw new Error(`xenolith.v1 parse: ${where}.renderer must be string`)
  }
  // The spec is plain data; copy it through verbatim once the discriminant + required keys check out.
  return { ...v } as unknown as WidgetSpec
}

function parseNode(v: unknown, idx: number): { node: Node; render?: RenderNodeOptions } {
  const where = `nodes[${idx}]`
  if (!isPlainObject(v)) throw new Error(`xenolith.v1 parse: ${where} must be an object`)
  const id = v['id'], type = v['type'], pins = v['pins'], state = v['state']
  if (typeof id !== 'string')   throw new Error(`xenolith.v1 parse: ${where}.id must be string`)
  if (typeof type !== 'string') throw new Error(`xenolith.v1 parse: ${where}.type must be string`)
  const position = assertVec2(v['position'], `${where}.position`)
  if (!Array.isArray(pins)) throw new Error(`xenolith.v1 parse: ${where}.pins must be array`)
  const node: Node = {
    id:       id as Node['id'],
    type,
    position,
    state:    isPlainObject(state) ? { ...state } : {},
    pins:     pins.map((p, i) => parsePin(p, `${where}.pins[${i}]`)),
  }
  if (v['size'] !== undefined) node.size = assertVec2(v['size'], `${where}.size`)
  if (v['widgets'] !== undefined) {
    if (!Array.isArray(v['widgets'])) throw new Error(`xenolith.v1 parse: ${where}.widgets must be array`)
    node.widgets = v['widgets'].map((w, i) => parseWidget(w, `${where}.widgets[${i}]`))
  }

  let render: RenderNodeOptions | undefined
  const rawRender = v['render']
  if (isPlainObject(rawRender)) {
    render = {}
    if (typeof rawRender['category']  === 'string')  render.category  = rawRender['category']
    if (typeof rawRender['title']     === 'string')  render.title     = rawRender['title']
    if (typeof rawRender['collapsed'] === 'boolean') render.collapsed = rawRender['collapsed']
  }
  return render ? { node, render } : { node }
}

function parseEdge(v: unknown, idx: number): { edge: Edge; opts?: RenderEdgeOptions } {
  const where = `edges[${idx}]`
  if (!isPlainObject(v)) throw new Error(`xenolith.v1 parse: ${where} must be an object`)
  const id = v['id'], from = v['from'], to = v['to']
  if (typeof id !== 'string') throw new Error(`xenolith.v1 parse: ${where}.id must be string`)
  if (!isPlainObject(from))   throw new Error(`xenolith.v1 parse: ${where}.from missing`)
  if (!isPlainObject(to))     throw new Error(`xenolith.v1 parse: ${where}.to missing`)
  const fromNode = from['node'], fromPin = from['pin']
  const toNode   = to['node'],   toPin   = to['pin']
  if (typeof fromNode !== 'string' || typeof fromPin !== 'string') {
    throw new Error(`xenolith.v1 parse: ${where}.from must be { node: string, pin: string }`)
  }
  if (typeof toNode !== 'string' || typeof toPin !== 'string') {
    throw new Error(`xenolith.v1 parse: ${where}.to must be { node: string, pin: string }`)
  }
  const edge: Edge = {
    id:   id as Edge['id'],
    from: { node: fromNode as Edge['from']['node'], pin: fromPin as Edge['from']['pin'] },
    to:   { node: toNode   as Edge['to']['node'],   pin: toPin   as Edge['to']['pin']   },
  }
  let opts: RenderEdgeOptions | undefined
  const rawOpts = (v as { opts?: unknown }).opts
  if (isPlainObject(rawOpts) && typeof rawOpts['sourceType'] === 'string') {
    opts = { sourceType: rawOpts['sourceType'] }
  }
  return opts ? { edge, opts } : { edge }
}

export function parseXenolithGraph(data: unknown): ParsedGraph {
  if (!isPlainObject(data)) throw new Error('xenolith.v1 parse: payload must be an object')
  const version = data['version']
  if (version === undefined) throw new Error('xenolith.v1 parse: missing version field')
  if (version !== XENOLITH_GRAPH_VERSION) {
    throw new Error(`xenolith.v1 parse: unsupported version "${String(version)}"`)
  }
  const rawNodes = data['nodes']
  const rawEdges = data['edges']
  if (!Array.isArray(rawNodes)) throw new Error('xenolith.v1 parse: nodes must be an array')
  if (!Array.isArray(rawEdges)) throw new Error('xenolith.v1 parse: edges must be an array')

  const renderOpts = new Map<string, RenderNodeOptions>()
  const nodes: Node[] = []
  rawNodes.forEach((raw, i) => {
    const { node, render } = parseNode(raw, i)
    nodes.push(node)
    if (render) renderOpts.set(String(node.id), render)
  })

  const edgeOpts = new Map<string, RenderEdgeOptions>()
  const edges: Edge[] = []
  rawEdges.forEach((raw, i) => {
    const { edge, opts } = parseEdge(raw, i)
    edges.push(edge)
    if (opts) edgeOpts.set(String(edge.id), opts)
  })

  const out: ParsedGraph = { nodes, edges, renderOpts, edgeOpts }
  const rawViewport = data['viewport']
  if (isPlainObject(rawViewport)
      && typeof rawViewport['x'] === 'number'
      && typeof rawViewport['y'] === 'number'
      && typeof rawViewport['zoom'] === 'number') {
    out.viewport = { x: rawViewport['x'], y: rawViewport['y'], zoom: rawViewport['zoom'] }
  }
  return out
}
