import type { NodeId, EdgeId, PinId, CommentId, TypeId } from './ids.js'
import type { WidgetSpec } from './widget.js'

export interface Vec2 {
  x: number
  y: number
}

export type PinKind = 'exec' | 'data'
export type PinDirection = 'in' | 'out'

/** A header glyph marker for a node — a small icon drawn in the node header. `icon` names an entry in
 *  the renderer's icon registry (a built-in like 'cpu'/'layers', or a host/plugin-registered name).
 *  `side` picks which side of the title it sits on (default 'left'). Positioning is automatic. */
export interface NodeGlyph {
  icon: string
  side?: 'left' | 'right'
}

export interface Pin {
  id: PinId
  kind: PinKind
  direction: PinDirection
  type: TypeId | string
  multiple: boolean
  label?: string
  default?: unknown
}

export interface Node {
  id: NodeId
  type: string
  position: Vec2
  size?: Vec2
  state: Record<string, unknown>
  pins: Pin[]
  /** In-node UI controls. Values live in `state` (keyed by each widget's `key`). */
  widgets?: WidgetSpec[]
  /** Blueprint "pure" node — no exec flow, lazily pulled. The editor doesn't interpret this; it's a
   *  hint for a host evaluator (and a render cue: pure nodes carry no exec pins). */
  pure?: boolean
  /** Arbitrary host/plugin metadata, passed through serialization untouched. The core never reads it. */
  meta?: Record<string, unknown>
  /** A header glyph icon for this node (auto-positioned in the header by the renderer). */
  glyph?: NodeGlyph
  /** Schema version this node was instantiated under (defaults to its NodeSchema's `version`, or
   *  1). Serialized to JSON so `loadJSON` can route stale payloads through the schema's
   *  `migrate(oldNode, oldVersion)` hook. */
  version?: number
}

export interface Edge {
  id: EdgeId
  from: { node: NodeId; pin: PinId }
  to: { node: NodeId; pin: PinId }
}

export interface Comment {
  id: CommentId
  position: Vec2
  size: Vec2
  text: string
  color?: string
}

export class Graph {
  readonly #nodes = new Map<NodeId, Node>()
  readonly #edges = new Map<EdgeId, Edge>()
  readonly #comments = new Map<CommentId, Comment>()
  #version = 0

  get version(): number      { return this.#version }
  get nodeCount(): number    { return this.#nodes.size }
  get edgeCount(): number    { return this.#edges.size }
  get commentCount(): number { return this.#comments.size }

  getNode(id: NodeId): Readonly<Node> | undefined { return this.#nodes.get(id) }
  hasNode(id: NodeId): boolean                    { return this.#nodes.has(id) }
  *nodes(): IterableIterator<Readonly<Node>> {
    for (const n of this.#nodes.values()) yield n
  }

  getEdge(id: EdgeId): Readonly<Edge> | undefined { return this.#edges.get(id) }
  hasEdge(id: EdgeId): boolean                    { return this.#edges.has(id) }
  *edges(): IterableIterator<Readonly<Edge>> {
    for (const e of this.#edges.values()) yield e
  }

  getComment(id: CommentId): Readonly<Comment> | undefined { return this.#comments.get(id) }
  hasComment(id: CommentId): boolean                        { return this.#comments.has(id) }
  *comments(): IterableIterator<Readonly<Comment>> {
    for (const c of this.#comments.values()) yield c
  }

  /** @internal */
  _addComment(comment: Comment): void {
    if (this.#comments.has(comment.id)) {
      throw new Error(`Graph: duplicate comment id ${comment.id}`)
    }
    this.#comments.set(comment.id, comment)
    this.#version++
  }

  /** @internal */
  _removeComment(id: CommentId): Comment | undefined {
    const comment = this.#comments.get(id)
    if (!comment) return undefined
    this.#comments.delete(id)
    this.#version++
    return comment
  }

  /** @internal — patch mutable Comment fields in place (identity `id` is immutable). */
  _patchComment(
    id: CommentId,
    patch: Partial<Pick<Comment, 'position' | 'size' | 'text' | 'color'>>,
  ): Readonly<Comment> | undefined {
    const comment = this.#comments.get(id)
    if (!comment) return undefined
    if (patch.position !== undefined) comment.position = patch.position
    if (patch.size     !== undefined) comment.size     = patch.size
    if (patch.text     !== undefined) comment.text     = patch.text
    if (patch.color    !== undefined) comment.color    = patch.color
    this.#version++
    return comment
  }

  /** @internal — call only from CommandBus-applied commands. */
  _addNode(node: Node): void {
    if (this.#nodes.has(node.id)) {
      throw new Error(`Graph: duplicate node id ${node.id}`)
    }
    this.#nodes.set(node.id, node)
    this.#version++
  }

  /** @internal */
  _removeNode(id: NodeId): Node | undefined {
    const node = this.#nodes.get(id)
    if (!node) return undefined
    this.#nodes.delete(id)
    this.#version++
    return node
  }

  /** @internal */
  _addEdge(edge: Edge): void {
    if (this.#edges.has(edge.id)) {
      throw new Error(`Graph: duplicate edge id ${edge.id}`)
    }
    this.#edges.set(edge.id, edge)
    this.#version++
  }

  /** @internal */
  _removeEdge(id: EdgeId): Edge | undefined {
    const edge = this.#edges.get(id)
    if (!edge) return undefined
    this.#edges.delete(id)
    this.#version++
    return edge
  }

  /**
   * @internal — patch a subset of mutable Node fields in place.
   * Only `position`, `size`, `state`, and `type` may be patched; identity (`id`) and pin structure
   * (`pins`) are immutable through this method by design. Returns the patched node (same reference)
   * or undefined if the id is unknown.
   */
  _patchNode(
    id: NodeId,
    patch: Partial<Pick<Node, 'position' | 'size' | 'state' | 'type'>>,
  ): Readonly<Node> | undefined {
    const node = this.#nodes.get(id)
    if (!node) return undefined
    if (patch.position !== undefined) node.position = patch.position
    if (patch.size     !== undefined) node.size     = patch.size
    if (patch.state    !== undefined) node.state    = patch.state
    if (patch.type     !== undefined) node.type     = patch.type
    this.#version++
    return node
  }

  /** @internal — replace a node's pin list wholesale. Pruning edges incident to dropped pins is the
   *  caller's job (the SetNodePins command does it so the change is undoable). */
  _setNodePins(id: NodeId, pins: Pin[]): Readonly<Node> | undefined {
    const node = this.#nodes.get(id)
    if (!node) return undefined
    node.pins = pins
    this.#version++
    return node
  }

  /** @internal — replace a node's widget list wholesale. Per-widget `node.state[key]` values are
   *  NOT touched: re-adding a previously-removed widget under the same key restores its value.
   *  Use via the `SetNodeWidgets` command so the change is undoable. */
  _setNodeWidgets(id: NodeId, widgets: WidgetSpec[] | undefined): Readonly<Node> | undefined {
    const node = this.#nodes.get(id)
    if (!node) return undefined
    if (widgets && widgets.length > 0) node.widgets = widgets
    else delete node.widgets
    this.#version++
    return node
  }
}
