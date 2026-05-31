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
 *  insert, paste, drag-commit, AND undo/redo), because they are bridged off the command bus.
 *  Names ending with `-ing` (`edge:connecting`, `node:removing`) are PRE-mutation and accept a
 *  veto: any listener that calls `payload.cancel()` aborts the mutation before it lands in the
 *  command bus. They fire ONLY on user-driven paths (public API + interactive commit), not on
 *  internal machinery (macro re-collapse, undo/redo of an already-vetoed nothing). */
export type EditorEvents = {
  'node:added': { node: Readonly<Node> }
  'node:removed': { nodeId: NodeId }
  'node:removing': PreventablePayload<{ nodeId: NodeId }>
  'node:moved': { nodeId: NodeId; position: Vec2 }
  'node:click': { nodeId: NodeId }
  /** Pre-click hook (H7 — Rete `addPipe` interception parity). Listeners can `cancel()` to
   *  suppress the click and its side effects (selection change, drag init, dive-on-instance).
   *  Fires only for interactive clicks; programmatic `setSelection` doesn't go through this. */
  'node:clicking': PreventablePayload<{ nodeId: NodeId }>
  'edge:connected': { edge: Readonly<Edge> }
  'edge:disconnected': { edgeId: EdgeId }
  'edge:connecting': PreventablePayload<{ edge: Readonly<Edge> }>
  'edge:disconnecting': PreventablePayload<{ edgeId: EdgeId }>
  'selection:changed': { nodeIds: readonly NodeId[] }
  'viewport:changed': { x: number; y: number; zoom: number }
  'widget:changed': { nodeId: NodeId; widgetId: string; value: unknown }
  'widget:action': { nodeId: NodeId; widgetId: string; action: string }
  'graph:loaded': { nodeCount: number; edgeCount: number }
  'history:changed': { canUndo: boolean; canRedo: boolean }
  /** Fired when diving into / out of a template definition. `depth` 0 is the root document;
   *  `definitionId` is the definition currently displayed (null at the root). */
  'dive:changed': { depth: number; definitionId: string | null }
  /** Properties sidebar opened — `nodeId` is the node whose widgets the panel now shows. */
  'sidebar:opened': { nodeId: NodeId }
  /** Properties sidebar closed (close button OR programmatic). */
  'sidebar:closed': Record<string, never>
  /** Files / DataTransfer items dropped on a node (HTML5 DnD). `nodeId` is the node under the
   *  drop point (null if the drop landed on empty canvas). Hosts wire image / file uploaders
   *  through this — e.g. dropping a PNG on a `LoadImage` node sets its state from the file. */
  'node:drop': {
    nodeId: NodeId | null
    files: readonly File[]
    /** Plain-text payload from `DataTransfer.getData('text/plain')` when the user drops text. */
    text: string | null
    /** Every `DataTransfer.types` entry with its `getData()` payload — useful when the user drags
     *  a URL (text/uri-list), HTML snippet (text/html), or app-specific MIME (application/json).
     *  Files live in `files` instead; this map only carries string types. */
    items: Readonly<Record<string, string>>
    /** World-space drop coordinates so hosts can spawn a new node when nodeId is null. */
    position: { x: number; y: number }
  }
  /** Live Mode flipped (G12). Hosts watching this hide their own panels (palette, toolbars). */
  'livemode:changed': { live: boolean }
}

/** Common shape for `*-ing` preventable events. Listeners call `cancel()` to abort. */
export type PreventablePayload<T> = T & { cancel: () => void }

/** Emit a preventable event and report whether ANY listener cancelled it. The caller passes the
 *  base payload; this helper attaches a fresh `cancel()` closure, so a single listener calling
 *  cancel can't accidentally affect a subsequent emit. Returns `true` when the mutation should
 *  proceed, `false` when at least one listener vetoed. */
export function firePreventable<E extends 'edge:connecting' | 'edge:disconnecting' | 'node:removing' | 'node:clicking'>(
  bus: EventEmitter<EditorEvents>,
  event: E,
  payload: Omit<EditorEvents[E], 'cancel'>,
): boolean {
  let cancelled = false
  const full = { ...payload, cancel: () => { cancelled = true } } as EditorEvents[E]
  bus.emit(event, full)
  return !cancelled
}

interface BridgeOptions {
  coreEvents: EventEmitter<CoreEvents>
  /** The graph the bridge reads when reconstructing a node/edge on undo. A getter is accepted so the
   *  editor can point it at whichever graph is currently displayed (root, or a template definition
   *  while dived). A plain `Graph` is still accepted for headless callers. */
  graph: Graph | (() => Graph)
  bus: EventEmitter<EditorEvents>
  canUndo: () => boolean
  canRedo: () => boolean
}

/** Translate command-bus lifecycle events into the public graph-mutation `EditorEvents`. Pure and
 *  renderer-free so it can be unit-tested headlessly. `forward` is the apply/redo direction;
 *  undo emits the inverse event. */
export function createGraphEventBridge(opts: BridgeOptions): Unsubscribe {
  const { coreEvents, bus, canUndo, canRedo } = opts
  const graphOf = typeof opts.graph === 'function' ? opts.graph : () => opts.graph as Graph

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
        else { const node = graphOf().getNode(nodeId); if (node) bus.emit('node:added', { node }) }
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
        else { const edge = graphOf().getEdge(edgeId); if (edge) bus.emit('edge:connected', { edge }) }
        break
      }
      case 'MoveNode': {
        const nodeId = (command as unknown as { nodeId: NodeId }).nodeId
        const node = graphOf().getNode(nodeId)
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
