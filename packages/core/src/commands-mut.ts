import type { Command, CommandContext } from './command-bus.js'
import type { Edge, Pin, Vec2 } from './graph.js'
import type { NodeId } from './ids.js'

export class MoveNode implements Command<Vec2> {
  readonly type = 'MoveNode'
  readonly #target: Vec2
  constructor(
    readonly nodeId: NodeId,
    target: Vec2,
  ) {
    this.#target = { x: target.x, y: target.y }
  }

  apply(ctx: CommandContext): Vec2 {
    const node = ctx.graph.getNode(this.nodeId)
    if (!node) throw new Error(`MoveNode: node not found: ${this.nodeId}`)
    const old = { x: node.position.x, y: node.position.y }
    ctx.graph._patchNode(this.nodeId, { position: { x: this.#target.x, y: this.#target.y } })
    return old
  }

  undo(ctx: CommandContext, old: Vec2): void {
    ctx.graph._patchNode(this.nodeId, { position: old })
  }
}

export class ResizeNode implements Command<Vec2 | undefined> {
  readonly type = 'ResizeNode'
  readonly #target: Vec2
  constructor(
    private readonly nodeId: NodeId,
    target: Vec2,
  ) {
    this.#target = { x: target.x, y: target.y }
  }

  apply(ctx: CommandContext): Vec2 | undefined {
    const node = ctx.graph.getNode(this.nodeId)
    if (!node) throw new Error(`ResizeNode: node not found: ${this.nodeId}`)
    const old = node.size ? { x: node.size.x, y: node.size.y } : undefined
    ctx.graph._patchNode(this.nodeId, { size: { x: this.#target.x, y: this.#target.y } })
    return old
  }

  undo(ctx: CommandContext, old: Vec2 | undefined): void {
    ctx.graph._patchNode(this.nodeId, { size: old as Vec2 })
  }
}

export class SetNodeState implements Command<Record<string, unknown>> {
  readonly type = 'SetNodeState'
  constructor(
    private readonly nodeId: NodeId,
    private readonly partial: Record<string, unknown>,
  ) {}

  apply(ctx: CommandContext): Record<string, unknown> {
    const node = ctx.graph.getNode(this.nodeId)
    if (!node) throw new Error(`SetNodeState: node not found: ${this.nodeId}`)
    const old = { ...node.state }
    ctx.graph._patchNode(this.nodeId, { state: { ...node.state, ...this.partial } })
    return old
  }

  undo(ctx: CommandContext, old: Record<string, unknown>): void {
    ctx.graph._patchNode(this.nodeId, { state: old })
  }
}

export interface SetNodePinsUndo {
  pins: Pin[]
  prunedEdges: Edge[]
}

/** Replace a node's pin list wholesale (variadic pins: Sequence/MakeArray "+", Branch true/false).
 *  Edges incident to a pin that no longer exists are pruned and restored on undo. */
export class SetNodePins implements Command<SetNodePinsUndo> {
  readonly type = 'SetNodePins'
  readonly #pins: Pin[]
  constructor(
    private readonly nodeId: NodeId,
    pins: Pin[],
  ) {
    this.#pins = pins.map((p) => ({ ...p }))
  }

  apply(ctx: CommandContext): SetNodePinsUndo {
    const node = ctx.graph.getNode(this.nodeId)
    if (!node) throw new Error(`SetNodePins: node not found: ${this.nodeId}`)
    const oldPins = node.pins.map((p) => ({ ...p }))
    const survivors = new Set(this.#pins.map((p) => p.id))
    const pruned: Edge[] = []
    for (const edge of ctx.graph.edges()) {
      const touchesDropped =
        (edge.from.node === this.nodeId && !survivors.has(edge.from.pin)) ||
        (edge.to.node === this.nodeId && !survivors.has(edge.to.pin))
      if (touchesDropped) pruned.push(edge as Edge)
    }
    for (const edge of pruned) ctx.graph._removeEdge(edge.id)
    ctx.graph._setNodePins(this.nodeId, this.#pins.map((p) => ({ ...p })))
    return { pins: oldPins, prunedEdges: pruned }
  }

  undo(ctx: CommandContext, applied: SetNodePinsUndo): void {
    ctx.graph._setNodePins(this.nodeId, applied.pins.map((p) => ({ ...p })))
    for (const edge of applied.prunedEdges) ctx.graph._addEdge(edge)
  }
}
