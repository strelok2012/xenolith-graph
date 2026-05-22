import type { NodeId, EdgeId, PinId, CommentId, TypeId } from './ids.js'

export interface Vec2 {
  x: number
  y: number
}

export type PinKind = 'exec' | 'data'
export type PinDirection = 'in' | 'out'

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

  get version(): number   { return this.#version }
  get nodeCount(): number { return this.#nodes.size }
  get edgeCount(): number { return this.#edges.size }

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
}
