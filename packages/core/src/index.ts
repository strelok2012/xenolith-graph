export const VERSION = '0.0.0'

export { EventEmitter } from './event-emitter.js'
export type { EventMap, Listener, Unsubscribe, ErrorListener } from './event-emitter.js'

export {
  createNodeId,
  createEdgeId,
  createPinId,
  createCommentId,
  createTypeId,
  isUuidV7,
} from './ids.js'
export type { NodeId, EdgeId, PinId, CommentId, TypeId } from './ids.js'

export { Graph } from './graph.js'
export type { Node, Edge, Pin, Comment, Vec2, PinKind, PinDirection } from './graph.js'

export { CommandBus } from './command-bus.js'
export type { Command, CommandContext, CommandBusOptions, CoreEvents } from './command-bus.js'

export { AddNode, RemoveNode, ConnectPins, DisconnectEdge } from './commands.js'
export type { RemoveNodeUndo } from './commands.js'

export { MoveNode, ResizeNode, SetNodeState } from './commands-mut.js'

export { Selection } from './selection.js'
export type { SelectionMode, SelectionChange } from './selection.js'
