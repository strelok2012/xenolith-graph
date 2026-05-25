import {
  EventEmitter,
  type Command,
  type CoreEvents,
  type Edge,
  type EdgeId,
  type Graph,
  type Node,
  type NodeId,
  type Unsubscribe,
  type Vec2,
} from '@xenolith/core'

/** The public event surface of the editor — observe these via `editor.on(name, handler)`.
 *  Graph-mutation events fire on every path that changes the graph (programmatic API, palette
 *  insert, paste, drag-commit, AND undo/redo), because they are bridged off the command bus. */
export type EditorEvents = {
  'node:added': { node: Readonly<Node> }
  'node:removed': { nodeId: NodeId }
  'node:moved': { nodeId: NodeId; position: Vec2 }
  'node:click': { nodeId: NodeId }
  'edge:connected': { edge: Readonly<Edge> }
  'edge:disconnected': { edgeId: EdgeId }
  'selection:changed': { nodeIds: readonly NodeId[] }
  'viewport:changed': { x: number; y: number; zoom: number }
  'widget:changed': { nodeId: NodeId; widgetId: string; value: unknown }
  'widget:action': { nodeId: NodeId; widgetId: string; action: string }
  'graph:loaded': { nodeCount: number; edgeCount: number }
  'history:changed': { canUndo: boolean; canRedo: boolean }
}

interface BridgeOptions {
  coreEvents: EventEmitter<CoreEvents>
  graph: Graph
  bus: EventEmitter<EditorEvents>
  canUndo: () => boolean
  canRedo: () => boolean
}

/** Translate command-bus lifecycle events into the public graph-mutation `EditorEvents`. Pure and
 *  renderer-free so it can be unit-tested headlessly. `forward` is the apply/redo direction;
 *  undo emits the inverse event. */
export function createGraphEventBridge(opts: BridgeOptions): Unsubscribe {
  const { coreEvents, graph, bus, canUndo, canRedo } = opts

  const translate = (command: Command<unknown>, forward: boolean): void => {
    switch (command.type) {
      case 'AddNode': {
        const node = (command as unknown as { node: Node }).node
        if (forward) bus.emit('node:added', { node })
        else bus.emit('node:removed', { nodeId: node.id })
        break
      }
      case 'RemoveNode': {
        const nodeId = (command as unknown as { nodeId: NodeId }).nodeId
        if (forward) bus.emit('node:removed', { nodeId })
        else { const node = graph.getNode(nodeId); if (node) bus.emit('node:added', { node }) }
        break
      }
      case 'ConnectPins': {
        const edge = (command as unknown as { edge: Edge }).edge
        if (forward) bus.emit('edge:connected', { edge })
        else bus.emit('edge:disconnected', { edgeId: edge.id })
        break
      }
      case 'DisconnectEdge': {
        const edgeId = (command as unknown as { edgeId: EdgeId }).edgeId
        if (forward) bus.emit('edge:disconnected', { edgeId })
        else { const edge = graph.getEdge(edgeId); if (edge) bus.emit('edge:connected', { edge }) }
        break
      }
      case 'MoveNode': {
        const nodeId = (command as unknown as { nodeId: NodeId }).nodeId
        const node = graph.getNode(nodeId)
        if (node) bus.emit('node:moved', { nodeId, position: { x: node.position.x, y: node.position.y } })
        break
      }
    }
  }

  const history = (): void => bus.emit('history:changed', { canUndo: canUndo(), canRedo: canRedo() })

  const offApplied = coreEvents.on('command:applied', ({ command }) => { translate(command, true); history() })
  const offRedone = coreEvents.on('command:redone', ({ command }) => { translate(command, true); history() })
  const offUndone = coreEvents.on('command:undone', ({ command }) => { translate(command, false); history() })
  // Inside a transaction the cursor only advances on commit, so the per-command history() above reads
  // a stale canUndo. Re-emit once the transaction settles (drag-commit, delete, paste are all txns).
  const offTxCommit = coreEvents.on('transaction:committed', history)
  const offTxRevert = coreEvents.on('transaction:reverted', history)

  return () => { offApplied(); offRedone(); offUndone(); offTxCommit(); offTxRevert() }
}
