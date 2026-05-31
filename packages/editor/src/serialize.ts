import type { Edge, Node, NodeId, EdgeId, Pin, WidgetSpec, Comment, TemplateDefinition, TemplateDefId, NodeGlyph } from '@xenolith/core'
import type { RenderEdgeOptions, RenderNodeOptions, GraphCategoryPalette, CategoryColorSpec } from '@xenolith/render-pixi'

export const XENOLITH_GRAPH_VERSION = 'xenolith.v1' as const
export type XenolithGraphVersion = typeof XENOLITH_GRAPH_VERSION

export interface XenolithGraphV1 {
  version: XenolithGraphVersion
  viewport?: { x: number; y: number; zoom: number }
  nodes: XenolithNodeV1[]
  edges: XenolithEdgeV1[]
  comments?: XenolithCommentV1[]
  /** Graph-owned category palette — overrides the theme's category tokens, so a host can colour its
   *  own categories (agent/goodie/…) in the data without patching the theme. */
  categories?: Record<string, CategoryColorSpec>
  /** Reusable live-template definitions, keyed by definition id. Each `$templateInstance` node in
   *  `nodes` (or in another template) references one by `state.definitionId`. Optional — old graphs
   *  without it load unchanged. */
  templates?: Record<string, XenolithTemplateV1>
}

export interface XenolithTemplateV1 {
  title: string
  nodes: XenolithNodeV1[]
  edges: XenolithEdgeV1[]
}

export interface XenolithCommentV1 {
  id: string
  position: { x: number; y: number }
  size: { x: number; y: number }
  text: string
  color?: string
}

export interface XenolithNodeV1 {
  id: string
  type: string
  position: { x: number; y: number }
  size?: { x: number; y: number }
  state?: Record<string, unknown>
  pins: XenolithPinV1[]
  widgets?: WidgetSpec[]
  render?: { category?: string; title?: string; collapsed?: boolean; color?: string }
  /** Blueprint "pure" node flag — see {@link import('@xenolith/core').Node.pure}. */
  pure?: boolean
  /** Arbitrary host/plugin metadata, passed through verbatim. */
  meta?: Record<string, unknown>
  /** Header glyph icon (auto-drawn in the node header). */
  glyph?: NodeGlyph
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
  opts?: { sourceType?: string; label?: string; markerEnd?: 'arrow' | 'none'; animated?: boolean }
}

export interface SerializeInput {
  nodes: ReadonlyArray<Readonly<Node>>
  edges: ReadonlyArray<Readonly<Edge>>
  comments?: ReadonlyArray<Readonly<Comment>>
  renderOpts: ReadonlyMap<NodeId | string, RenderNodeOptions>
  edgeOpts:   ReadonlyMap<EdgeId  | string, RenderEdgeOptions>
  viewport?: { x: number; y: number; zoom: number }
  categories?: GraphCategoryPalette
  /** Reusable live-template definitions. Their member nodes' render opts + edge opts are written to
   *  the shared `renderOpts`/`edgeOpts` maps (node/edge ids are globally unique). */
  templates?: ReadonlyArray<TemplateDefinition>
}

export interface ParsedGraph {
  viewport?: { x: number; y: number; zoom: number }
  nodes: Node[]
  edges: Edge[]
  comments: Comment[]
  renderOpts: Map<string, RenderNodeOptions>
  edgeOpts:   Map<string, RenderEdgeOptions>
  categories?: GraphCategoryPalette
  /** Parsed template definitions (render/edge opts for their nodes are merged into renderOpts/edgeOpts). */
  templates?: TemplateDefinition[]
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
  if (n.pure !== undefined) out.pure = n.pure
  if (n.meta !== undefined) out.meta = { ...n.meta }
  if (n.glyph !== undefined) out.glyph = { ...n.glyph }
  if (render && (render.category !== undefined || render.title !== undefined || render.collapsed !== undefined || render.color !== undefined)) {
    const r: NonNullable<XenolithNodeV1['render']> = {}
    if (render.category  !== undefined) r.category  = render.category
    if (render.title     !== undefined) r.title     = render.title
    if (render.collapsed !== undefined) r.collapsed = render.collapsed
    if (render.color     !== undefined) r.color     = render.color
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
  if (opts) {
    const o: NonNullable<XenolithEdgeV1['opts']> = {}
    if (opts.sourceType !== undefined) o.sourceType = opts.sourceType
    if (opts.label !== undefined) o.label = opts.label
    if (opts.markerEnd !== undefined && opts.markerEnd !== 'none') o.markerEnd = opts.markerEnd
    if (opts.animated) o.animated = true
    if (Object.keys(o).length > 0) out.opts = o
  }
  return out
}

function serializeComment(c: Readonly<Comment>): XenolithCommentV1 {
  const out: XenolithCommentV1 = {
    id:       String(c.id),
    position: { x: c.position.x, y: c.position.y },
    size:     { x: c.size.x, y: c.size.y },
    text:     c.text,
  }
  if (c.color !== undefined) out.color = c.color
  return out
}

export function serializeXenolithGraph(input: SerializeInput): XenolithGraphV1 {
  // H3 — deterministic output for clean git diffs. Sort every id-keyed collection by id BEFORE
  // mapping to JSON. The runtime treats nodes/edges as sets, so order is semantically irrelevant
  // — but insertion order leaked into the file, churning diffs whenever the user reordered nodes
  // visually (move, paste, undo). Sort once at write time and noise vanishes.
  const sortedNodes = [...input.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const sortedEdges = [...input.edges].sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const out: XenolithGraphV1 = {
    version: XENOLITH_GRAPH_VERSION,
    nodes: sortedNodes.map((n) => serializeNode(n, input.renderOpts.get(String(n.id) as NodeId))),
    edges: sortedEdges.map((e) => serializeEdge(e, input.edgeOpts.get(String(e.id) as EdgeId))),
  }
  if (input.comments && input.comments.length > 0) {
    out.comments = [...input.comments].sort((a, b) => String(a.id).localeCompare(String(b.id))).map(serializeComment)
  }
  if (input.categories && Object.keys(input.categories).length > 0) out.categories = { ...input.categories }
  if (input.templates && input.templates.length > 0) {
    const templates: Record<string, XenolithTemplateV1> = {}
    // Sort template ids too — Records preserve insertion order in JSON.stringify so this matters.
    const sortedDefs = [...input.templates].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    for (const def of sortedDefs) {
      const defNodes = [...def.nodes].sort((a, b) => String(a.id).localeCompare(String(b.id)))
      const defEdges = [...def.edges].sort((a, b) => String(a.id).localeCompare(String(b.id)))
      templates[String(def.id)] = {
        title: def.title,
        nodes: defNodes.map((n) => serializeNode(n, input.renderOpts.get(String(n.id) as NodeId))),
        edges: defEdges.map((e) => serializeEdge(e, input.edgeOpts.get(String(e.id) as EdgeId))),
      }
    }
    out.templates = templates
  }
  if (input.viewport) out.viewport = { ...input.viewport }
  return out
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Validate + normalise the optional top-level `categories` palette. Each entry is `{ color }` or
 *  `{ gradient: { start, end } }`. Returns undefined when absent (so old graphs stay clean). */
function parseCategories(raw: unknown): GraphCategoryPalette | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) throw new Error('xenolith.v1 parse: categories must be an object')
  const out: GraphCategoryPalette = {}
  for (const [name, v] of Object.entries(raw)) {
    if (!isPlainObject(v)) throw new Error(`xenolith.v1 parse: categories.${name} must be an object`)
    if (typeof v['color'] === 'string') {
      out[name] = { color: v['color'] }
    } else if (isPlainObject(v['gradient']) && typeof v['gradient']['start'] === 'string' && typeof v['gradient']['end'] === 'string') {
      out[name] = { gradient: { start: v['gradient']['start'], end: v['gradient']['end'] } }
    } else {
      throw new Error(`xenolith.v1 parse: categories.${name} must have { color } or { gradient: { start, end } }`)
    }
  }
  return Object.keys(out).length > 0 ? out : undefined
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
  if (typeof v['pure'] === 'boolean') node.pure = v['pure']
  if (isPlainObject(v['meta'])) node.meta = { ...v['meta'] }
  if (isPlainObject(v['glyph']) && typeof v['glyph']['icon'] === 'string') {
    const side = v['glyph']['side']
    node.glyph = { icon: v['glyph']['icon'], ...(side === 'left' || side === 'right' ? { side } : {}) }
  }

  let render: RenderNodeOptions | undefined
  const rawRender = v['render']
  if (isPlainObject(rawRender)) {
    render = {}
    if (typeof rawRender['category']  === 'string')  render.category  = rawRender['category']
    if (typeof rawRender['title']     === 'string')  render.title     = rawRender['title']
    if (typeof rawRender['collapsed'] === 'boolean') render.collapsed = rawRender['collapsed']
    if (typeof rawRender['color']     === 'string')  render.color     = rawRender['color']
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
  if (isPlainObject(rawOpts)) {
    const o: RenderEdgeOptions = {}
    if (typeof rawOpts['sourceType'] === 'string') o.sourceType = rawOpts['sourceType']
    if (typeof rawOpts['label'] === 'string') o.label = rawOpts['label']
    if (rawOpts['markerEnd'] === 'arrow') o.markerEnd = 'arrow'
    if (rawOpts['animated'] === true) o.animated = true
    if (Object.keys(o).length > 0) opts = o
  }
  return opts ? { edge, opts } : { edge }
}

function parseComment(v: unknown, idx: number): Comment {
  const where = `comments[${idx}]`
  if (!isPlainObject(v)) throw new Error(`xenolith.v1 parse: ${where} must be an object`)
  if (typeof v['id'] !== 'string') throw new Error(`xenolith.v1 parse: ${where}.id must be string`)
  if (typeof v['text'] !== 'string') throw new Error(`xenolith.v1 parse: ${where}.text must be string`)
  const comment: Comment = {
    id:       v['id'] as Comment['id'],
    position: assertVec2(v['position'], `${where}.position`),
    size:     assertVec2(v['size'], `${where}.size`),
    text:     v['text'],
  }
  if (typeof v['color'] === 'string') comment.color = v['color']
  return comment
}

/** Parse the optional top-level `templates` map into definitions. Member-node render opts and edge
 *  opts are merged into the shared maps (ids are globally unique) so the editor restores them. */
function parseTemplates(
  raw: unknown,
  renderOpts: Map<string, RenderNodeOptions>,
  edgeOpts: Map<string, RenderEdgeOptions>,
): TemplateDefinition[] | undefined {
  if (raw === undefined) return undefined
  if (!isPlainObject(raw)) throw new Error('xenolith.v1 parse: templates must be an object')
  const out: TemplateDefinition[] = []
  for (const [id, v] of Object.entries(raw)) {
    if (!isPlainObject(v)) throw new Error(`xenolith.v1 parse: templates.${id} must be an object`)
    if (typeof v['title'] !== 'string') throw new Error(`xenolith.v1 parse: templates.${id}.title must be string`)
    const rawNodes = v['nodes'], rawEdges = v['edges']
    if (!Array.isArray(rawNodes)) throw new Error(`xenolith.v1 parse: templates.${id}.nodes must be an array`)
    if (!Array.isArray(rawEdges)) throw new Error(`xenolith.v1 parse: templates.${id}.edges must be an array`)
    const nodes: Node[] = []
    rawNodes.forEach((rn, i) => {
      const { node, render } = parseNode(rn, i)
      nodes.push(node)
      if (render) renderOpts.set(String(node.id), render)
    })
    const edges: Edge[] = []
    rawEdges.forEach((re, i) => {
      const { edge, opts } = parseEdge(re, i)
      edges.push(edge)
      if (opts) edgeOpts.set(String(edge.id), opts)
    })
    out.push({ id: id as TemplateDefId, title: v['title'], nodes, edges })
  }
  return out.length > 0 ? out : undefined
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

  const rawComments = data['comments']
  const comments: Comment[] = []
  if (rawComments !== undefined) {
    if (!Array.isArray(rawComments)) throw new Error('xenolith.v1 parse: comments must be an array')
    rawComments.forEach((raw, i) => comments.push(parseComment(raw, i)))
  }

  const out: ParsedGraph = { nodes, edges, comments, renderOpts, edgeOpts }
  const categories = parseCategories(data['categories'])
  if (categories) out.categories = categories
  const templates = parseTemplates(data['templates'], renderOpts, edgeOpts)
  if (templates) out.templates = templates
  const rawViewport = data['viewport']
  if (isPlainObject(rawViewport)
      && typeof rawViewport['x'] === 'number'
      && typeof rawViewport['y'] === 'number'
      && typeof rawViewport['zoom'] === 'number') {
    out.viewport = { x: rawViewport['x'], y: rawViewport['y'], zoom: rawViewport['zoom'] }
  }
  return out
}
