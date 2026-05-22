import type { Command, CommandContext } from './command-bus.js'
import type { Edge, Node } from './graph.js'
import type { EdgeId, NodeId } from './ids.js'

export class AddNode implements Command<void> {
  readonly type = 'AddNode'
  constructor(private readonly node: Node) {}

  apply(ctx: CommandContext): void {
    ctx.graph._addNode(this.node)
  }

  undo(ctx: CommandContext): void {
    ctx.graph._removeNode(this.node.id)
  }
}

export interface RemoveNodeUndo {
  node: Node
  cascadedEdges: Edge[]
}

export class RemoveNode implements Command<RemoveNodeUndo> {
  readonly type = 'RemoveNode'
  constructor(private readonly nodeId: NodeId) {}

  apply(ctx: CommandContext): RemoveNodeUndo {
    const cascaded: Edge[] = []
    for (const edge of ctx.graph.edges()) {
      if (edge.from.node === this.nodeId || edge.to.node === this.nodeId) {
        cascaded.push(edge as Edge)
      }
    }
    for (const edge of cascaded) ctx.graph._removeEdge(edge.id)

    const node = ctx.graph._removeNode(this.nodeId)
    if (!node) {
      for (const edge of cascaded) ctx.graph._addEdge(edge)
      throw new Error(`RemoveNode: node not found: ${this.nodeId}`)
    }
    return { node, cascadedEdges: cascaded }
  }

  undo(ctx: CommandContext, applied: RemoveNodeUndo): void {
    ctx.graph._addNode(applied.node)
    for (const edge of applied.cascadedEdges) ctx.graph._addEdge(edge)
  }
}

export class ConnectPins implements Command<void> {
  readonly type = 'ConnectPins'
  constructor(private readonly edge: Edge) {}

  apply(ctx: CommandContext): void {
    ctx.graph._addEdge(this.edge)
  }

  undo(ctx: CommandContext): void {
    ctx.graph._removeEdge(this.edge.id)
  }
}

export class DisconnectEdge implements Command<Edge> {
  readonly type = 'DisconnectEdge'
  constructor(private readonly edgeId: EdgeId) {}

  apply(ctx: CommandContext): Edge {
    const removed = ctx.graph._removeEdge(this.edgeId)
    if (!removed) throw new Error(`DisconnectEdge: edge not found: ${this.edgeId}`)
    return removed
  }

  undo(ctx: CommandContext, applied: Edge): void {
    ctx.graph._addEdge(applied)
  }
}
