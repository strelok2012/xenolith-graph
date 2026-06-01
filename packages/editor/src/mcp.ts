import type { Edge, NodeId, PinId } from '@xenolith/core'
import { createEdgeId } from '@xenolith/core'

/** Editor-side WebSocket client for the @xenolith/mcp-server bridge.
 *  The protocol mirrors packages/mcp-server/src/protocol.ts — server sends `call`, editor replies
 *  with `result`. Tool handlers below are intentionally thin wrappers around existing public APIs;
 *  validation/undo lives where it already does (commandBus etc). */

interface CallMsg { id: string; kind: 'call'; tool: string; args?: unknown }
interface ResultMsg { id: string; kind: 'result'; ok: true; data?: unknown }
interface ErrorMsg { id: string; kind: 'result'; ok: false; error: string }

/** Subset of editor surface that the MCP client needs. Kept as a structural type so tests can
 *  pass a mock without importing the full editor. */
interface PinLike {
  id: PinId
  kind: 'data' | 'exec'
  direction: 'in' | 'out'
  type: string
  label?: string
  multiple?: boolean
}
interface NodeLike {
  id: NodeId
  type: string
  position: { x: number; y: number }
  size?: { x: number; y: number }
  pins: PinLike[]
  state?: Record<string, unknown>
}
export interface McpEditorSurface {
  registry: { all(): Array<{ type: string; title?: string; category?: string; pins: Array<{ kind: 'data' | 'exec'; direction: 'in' | 'out'; type: string; label?: string }>; widgets?: Array<{ id: string; key?: string; type: string; label?: string }> }> }
  toJSON(): unknown
  insertNode(type: string, worldPos: { x: number; y: number }, opts?: { center?: boolean }): NodeLike | null
  addEdge(edge: Edge): boolean
  fitView(opts?: { padding?: number; maxZoom?: number; minZoom?: number }): void
  moveNode(id: NodeId, position: { x: number; y: number }): void
  setWidgetValue(nodeId: NodeId, widgetId: string, value: unknown): void
  removeNode(nodeId: NodeId): boolean
  disconnectEdge(edgeId: string): boolean
  createMacroFromSelection(memberIds?: NodeId[], title?: string): NodeId | null
  expandMacro(id: NodeId): void
  collapseMacro(id: NodeId): void
  graph: {
    nodes(): Iterable<NodeLike & { widgets?: Array<{ id: string; key?: string; type: string }> }>
    edges(): Iterable<{ id: string; from: { node: NodeId }; to: { node: NodeId } }>
    getNode(id: NodeId): (NodeLike & { widgets?: Array<{ id: string; key?: string; type: string }> }) | undefined
    getEdge?(id: string): { id: string; from: { node: NodeId }; to: { node: NodeId } } | undefined
  }
}

export type ToolHandler = (args: unknown) => unknown | Promise<unknown>

export function buildHandlers(editor: McpEditorSurface): Record<string, ToolHandler> {
  return {
    list_node_types: () => editor.registry.all().map((s) => ({
      type: s.type,
      title: s.title,
      category: s.category,
      pins: s.pins.map((p, i) => ({
        index: i,
        label: p.label ?? null,
        direction: p.direction,
        kind: p.kind,
        type: p.type,
      })),
      widgets: (s.widgets ?? []).map((w) => ({
        id: w.id,
        key: w.key ?? null,
        type: w.type,
        label: w.label ?? null,
      })),
    })),
    get_graph: () => editor.toJSON(),
    add_node: (args) => {
      const a = (args ?? {}) as { type?: string; x?: number; y?: number }
      if (!a.type) throw new Error('add_node: missing type')
      const pos = (typeof a.x === 'number' && typeof a.y === 'number')
        ? { x: a.x, y: a.y }
        : nextFreeSpot(editor)
      const node = editor.insertNode(a.type, pos)
      if (!node) throw new Error(`unknown node type '${a.type}'`)
      return { id: node.id, position: node.position }
    },
    connect_pins: (args) => {
      const a = args as { from: { node: string; pin: string | number }; to: { node: string; pin: string | number } }
      const fromNode = editor.graph.getNode(a.from.node as NodeId)
      if (!fromNode) throw new Error(`connect_pins: source node '${a.from.node}' not found`)
      const toNode = editor.graph.getNode(a.to.node as NodeId)
      if (!toNode) throw new Error(`connect_pins: target node '${a.to.node}' not found`)
      const fromPin = resolvePin(fromNode, a.from.pin, 'out')
      const toPin   = resolvePin(toNode,   a.to.pin,   'in')
      const edge: Edge = {
        id: createEdgeId(),
        from: { node: fromNode.id, pin: fromPin.id },
        to:   { node: toNode.id,   pin: toPin.id   },
      }
      const ok = editor.addEdge(edge)
      if (!ok) throw new Error(`addEdge rejected: pins incompatible (${fromPin.type} → ${toPin.type}) or vetoed`)
      return { id: edge.id, from: { pin: fromPin.label ?? fromPin.id, type: fromPin.type }, to: { pin: toPin.label ?? toPin.id, type: toPin.type } }
    },
    fit_view: (args) => {
      const a = (args ?? {}) as { padding?: number }
      editor.fitView(a.padding !== undefined ? { padding: a.padding } : {})
      return null
    },
    set_widget_value: (args) => {
      const a = args as { nodeId: string; widget: string; value: unknown }
      const node = editor.graph.getNode(a.nodeId as NodeId)
      if (!node) throw new Error(`set_widget_value: node '${a.nodeId}' not found`)
      const wid = resolveWidgetId(node, a.widget)
      editor.setWidgetValue(node.id, wid, a.value)
      return { nodeId: node.id, widget: wid, value: a.value }
    },
    remove_node: (args) => {
      const a = args as { nodeId: string }
      const ok = editor.removeNode(a.nodeId as NodeId)
      if (!ok) throw new Error(`remove_node: node '${a.nodeId}' not found or removal vetoed`)
      return { removed: a.nodeId }
    },
    disconnect_edge: (args) => {
      const a = args as { edgeId: string }
      const ok = editor.disconnectEdge(a.edgeId)
      if (!ok) throw new Error(`disconnect_edge: edge '${a.edgeId}' not found or vetoed`)
      return { removed: a.edgeId }
    },
    create_macro: (args) => {
      const a = args as { nodeIds: string[]; title?: string }
      const id = editor.createMacroFromSelection(a.nodeIds.map((s) => s as NodeId), a.title ?? 'Macro')
      if (!id) throw new Error('create_macro: failed (need at least 1 valid node)')
      return { id }
    },
    expand_macro: (args) => {
      const a = args as { macroId: string }
      editor.expandMacro(a.macroId as NodeId)
      return { expanded: a.macroId }
    },
    collapse_macro: (args) => {
      const a = args as { macroId: string }
      editor.collapseMacro(a.macroId as NodeId)
      return { collapsed: a.macroId }
    },
    auto_layout: (args) => {
      const a = (args ?? {}) as { direction?: 'LR' | 'TB'; spacing?: number }
      const positions = layeredLayout(editor, a.direction ?? 'LR', a.spacing ?? 80)
      for (const [id, p] of positions) editor.moveNode(id, p)
      editor.fitView({ padding: 64 })
      return { moved: positions.size, direction: a.direction ?? 'LR' }
    },
  }
}

/** Resolve a widget reference like the pin resolver — id → key → label match. The editor's
 *  `setWidgetValue` wants the widget *id*, so we translate friendly names back to it. */
function resolveWidgetId(node: NodeLike & { widgets?: Array<{ id: string; key?: string; type: string; label?: string }> }, ref: string): string {
  const ws = node.widgets ?? []
  if (ws.length === 0) throw new Error(`node '${node.id}' has no widgets`)
  const refStr = String(ref).toLowerCase().trim()
  const byId = ws.find((w) => w.id === ref)
  if (byId) return byId.id
  const byKey = ws.find((w) => (w.key ?? '').toLowerCase() === refStr)
  if (byKey) return byKey.id
  const byLabel = ws.find((w) => (w.label ?? '').toLowerCase() === refStr)
  if (byLabel) return byLabel.id
  const list = ws.map((w) => `${w.id}${w.key ? `(key:${w.key})` : ''}${w.label ? `(label:${w.label})` : ''}`).join(', ')
  throw new Error(`widget '${ref}' not found on node '${node.id}'. available: [${list}]`)
}

/** Resolve a pin reference flexibly. LLMs almost never know the real pin uuid; they pass a label
 *  ("Output"), a numeric index, or "in"/"out" + direction. Resolution order: exact id → label
 *  (case-insensitive) → numeric index → first pin matching `direction`. Throws with a helpful
 *  list of available pins if nothing matches, so the LLM can retry with a correct name. */
function resolvePin(node: NodeLike, ref: string | number, expectedDir: 'in' | 'out'): PinLike {
  const pins = node.pins
  const byId = pins.find((p) => p.id === ref)
  if (byId) return byId
  const refStr = String(ref).trim()
  const byLabel = pins.find((p) => (p.label ?? '').toLowerCase() === refStr.toLowerCase())
  if (byLabel) return byLabel
  if (/^\d+$/.test(refStr)) {
    const idx = Number(refStr)
    if (idx >= 0 && idx < pins.length) return pins[idx]!
  }
  // "in"/"out" → first pin of that direction (works for single-in/single-out simple nodes).
  if (refStr.toLowerCase() === 'in' || refStr.toLowerCase() === 'out') {
    const dir = refStr.toLowerCase() as 'in' | 'out'
    const byDir = pins.find((p) => p.direction === dir)
    if (byDir) return byDir
  }
  const available = pins
    .filter((p) => p.direction === expectedDir)
    .map((p, i) => `${i}:${p.label ?? p.id}(${p.type})`)
    .join(', ')
  throw new Error(`pin '${refStr}' not found on node '${node.type}' (${node.id}). available ${expectedDir} pins: [${available || 'none'}]`)
}

/** Find a spot to the right of every existing node (or origin if empty). LLMs that omit (x,y) land
 *  in roughly sane order; auto_layout cleans up after. */
function nextFreeSpot(editor: McpEditorSurface): { x: number; y: number } {
  let maxRight = -Infinity
  let topY = 0
  let count = 0
  for (const n of editor.graph.nodes()) {
    const w = n.size?.x ?? 220
    maxRight = Math.max(maxRight, n.position.x + w)
    topY += n.position.y
    count++
  }
  if (count === 0) return { x: 0, y: 0 }
  return { x: maxRight + 60, y: topY / count }
}

/** Layered DAG layout: rank each node by longest-path-from-source, place ranks in columns (LR)
 *  or rows (TB) with `spacing` between every node. Same-rank nodes stack on the cross-axis.
 *  Independent / cyclic / unreachable nodes get their own ranks at the start. */
function layeredLayout(
  editor: McpEditorSurface,
  direction: 'LR' | 'TB',
  spacing: number,
): Map<NodeId, { x: number; y: number }> {
  const allNodes = [...editor.graph.nodes()]

  // Members of macros are NOT laid out as top-level nodes — the macro is the layout unit. They
  // travel with it: after the macro is positioned, members translate by the same delta so they
  // stay anchored to the macro (and appear next to it on expand). Without this, members fall to
  // rank 0 because their original edges are rewired through the macro's proxy pins.
  const memberOf = new Map<string, string>() // member → macroId
  for (const n of allNodes) {
    const members = (n.state?.['members'] as string[] | undefined) ?? []
    if (n.type === 'Macro') for (const m of members) memberOf.set(String(m), n.id)
  }
  const nodes = allNodes.filter((n) => !memberOf.has(n.id))
  const edges = [...editor.graph.edges()]

  const succ = new Map<string, string[]>()
  const inDeg = new Map<string, number>()
  for (const n of nodes) { succ.set(n.id, []); inDeg.set(n.id, 0) }
  for (const e of edges) {
    if (!succ.has(e.from.node) || !inDeg.has(e.to.node)) continue
    succ.get(e.from.node)!.push(e.to.node)
    inDeg.set(e.to.node, (inDeg.get(e.to.node) ?? 0) + 1)
  }
  // Kahn-like rank assignment; cycles → fall back to current rank.
  const rank = new Map<string, number>()
  const queue: string[] = []
  for (const [id, d] of inDeg) if (d === 0) { rank.set(id, 0); queue.push(id) }
  while (queue.length) {
    const id = queue.shift()!
    const r = rank.get(id)!
    for (const s of succ.get(id) ?? []) {
      rank.set(s, Math.max(rank.get(s) ?? 0, r + 1))
      const d = (inDeg.get(s) ?? 1) - 1
      inDeg.set(s, d)
      if (d === 0) queue.push(s)
    }
  }
  // Anything left unranked (cycle) → drop on rank 0.
  for (const n of nodes) if (!rank.has(n.id)) rank.set(n.id, 0)

  // Group by rank, sort each rank deterministically.
  const ranks = new Map<number, { id: NodeId; w: number; h: number }[]>()
  for (const n of nodes) {
    const r = rank.get(n.id) ?? 0
    if (!ranks.has(r)) ranks.set(r, [])
    ranks.get(r)!.push({ id: n.id, w: n.size?.x ?? 220, h: n.size?.y ?? 140 })
  }
  for (const arr of ranks.values()) arr.sort((a, b) => a.id.localeCompare(b.id))

  const out = new Map<NodeId, { x: number; y: number }>()
  if (direction === 'LR') {
    let x = 0
    const sortedRanks = [...ranks.keys()].sort((a, b) => a - b)
    for (const r of sortedRanks) {
      const arr = ranks.get(r)!
      const colW = Math.max(...arr.map((n) => n.w))
      const totalH = arr.reduce((s, n) => s + n.h, 0) + spacing * Math.max(0, arr.length - 1)
      let y = -totalH / 2
      for (const n of arr) { out.set(n.id, { x, y }); y += n.h + spacing }
      x += colW + spacing
    }
  } else {
    let y = 0
    const sortedRanks = [...ranks.keys()].sort((a, b) => a - b)
    for (const r of sortedRanks) {
      const arr = ranks.get(r)!
      const rowH = Math.max(...arr.map((n) => n.h))
      const totalW = arr.reduce((s, n) => s + n.w, 0) + spacing * Math.max(0, arr.length - 1)
      let x = -totalW / 2
      for (const n of arr) { out.set(n.id, { x, y }); x += n.w + spacing }
      y += rowH + spacing
    }
  }

  // Members travel with their macro: translate each member by the same delta the macro moved.
  // Preserves the internal relative arrangement, so on expand the group appears next to the macro
  // (no orphan cluster in the upper-left corner anymore).
  for (const n of allNodes) {
    if (n.type !== 'Macro') continue
    const target = out.get(n.id)
    if (!target) continue
    const dx = target.x - n.position.x
    const dy = target.y - n.position.y
    if (dx === 0 && dy === 0) continue
    const members = (n.state?.['members'] as string[] | undefined) ?? []
    for (const mid of members) {
      const member = allNodes.find((x) => x.id === mid)
      if (!member) continue
      out.set(mid as NodeId, { x: member.position.x + dx, y: member.position.y + dy })
    }
  }
  return out
}

/** Lightweight WebSocket-like contract so unit tests can drive a mock without `ws` or browser WS. */
export interface McpSocketLike {
  send(data: string): void
  close(): void
  onmessage: ((ev: { data: unknown }) => void) | null
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
}

export interface McpClientOptions {
  /** Override the WebSocket constructor (useful for tests; defaults to globalThis.WebSocket). */
  socketFactory?: (url: string) => McpSocketLike
  /** Called on socket open + close + per-call so hosts can show a status indicator. */
  onStatus?: (status: 'connecting' | 'open' | 'closed' | 'error') => void
}

export class McpClient {
  #socket: McpSocketLike | null = null
  #handlers: Record<string, ToolHandler>
  #status: McpClientOptions['onStatus']

  constructor(editor: McpEditorSurface, opts: McpClientOptions = {}) {
    this.#handlers = buildHandlers(editor)
    this.#status = opts.onStatus
  }

  connect(url: string, opts: McpClientOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const factory = opts.socketFactory
        ?? ((u: string) => new (globalThis as unknown as { WebSocket: new (u: string) => McpSocketLike }).WebSocket(u))
      const ws = factory(url)
      this.#socket = ws
      this.#status?.('connecting')
      ws.onopen = () => {
        ws.send(JSON.stringify({ kind: 'hello', editorVersion: '0.0.0' }))
        this.#status?.('open')
        resolve()
      }
      ws.onerror = () => { this.#status?.('error'); reject(new Error('mcp socket error')) }
      ws.onclose = () => { this.#status?.('closed'); this.#socket = null }
      ws.onmessage = (ev) => { void this.#onMessage(typeof ev.data === 'string' ? ev.data : '') }
    })
  }

  disconnect(): void { this.#socket?.close(); this.#socket = null }

  async #onMessage(raw: string): Promise<void> {
    let msg: CallMsg | null = null
    try { msg = JSON.parse(raw) as CallMsg } catch { return }
    if (!msg || msg.kind !== 'call' || typeof msg.id !== 'string' || typeof msg.tool !== 'string') return
    const handler = this.#handlers[msg.tool]
    const respond = (r: ResultMsg | ErrorMsg): void => this.#socket?.send(JSON.stringify(r))
    if (!handler) { respond({ id: msg.id, kind: 'result', ok: false, error: `unknown tool '${msg.tool}'` }); return }
    try {
      const data = await handler(msg.args)
      respond({ id: msg.id, kind: 'result', ok: true, data })
    } catch (err) {
      respond({ id: msg.id, kind: 'result', ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
}
