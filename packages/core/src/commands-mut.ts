import type { Command, CommandContext } from './command-bus.js'
import type { Vec2 } from './graph.js'
import type { NodeId } from './ids.js'

export class MoveNode implements Command<Vec2> {
  readonly type = 'MoveNode'
  readonly #target: Vec2
  constructor(
    private readonly nodeId: NodeId,
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
