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
export type { Node, Edge, Pin, Comment, Vec2, PinKind, PinDirection, NodeGlyph } from './graph.js'
export { incomers, outgoers, connectedEdges, roots, leaves, topoOrder, wouldCreateCycle, reachableFrom } from './traversal.js'

export { CommandBus } from './command-bus.js'
export type { Command, CommandContext, CommandBusOptions, CoreEvents } from './command-bus.js'

export { AddNode, RemoveNode, ConnectPins, DisconnectEdge } from './commands.js'
export type { RemoveNodeUndo } from './commands.js'

export { MoveNode, ResizeNode, SetNodeState, SetNodePins, SetNodeWidgets } from './commands-mut.js'
export type { SetNodePinsUndo, SetNodeWidgetsUndo } from './commands-mut.js'

export { AddComment, RemoveComment, MoveComment, ResizeComment, SetCommentText } from './commands-comment.js'
export { nodesInsideComment } from './comment-spatial.js'
export type { PlacedNode, CommentRect } from './comment-spatial.js'

export { Selection } from './selection.js'
export type { SelectionMode, SelectionChange } from './selection.js'

export { NodeRegistry } from './node-registry.js'
export type { NodeSchema, PinSchema, NodeSearchResult } from './node-registry.js'

export { TypeRegistry } from './types-registry.js'
export type { TypeDescriptor } from './types-registry.js'

export { fuzzyMatch } from './fuzzy.js'
export type { FuzzyMatch } from './fuzzy.js'

export { REROUTE_TYPE, isReroute, createReroute, REROUTE_NODE_TYPE, rerouteNodeSchema } from './reroute.js'
export { MACRO_TYPE, isMacro, createMacro, macroMembers, boundaryEdges, macroProxyPins, planMacroCollapse, planMacroExpand, flattenMacroProxies } from './macro.js'
export type { MacroBoundary, MacroProxyPin, MacroProxyRecord, MacroCollapsePlan, MacroExpandPlan, Minters } from './macro.js'

export {
  TEMPLATE_INPUT_TYPE,
  TEMPLATE_OUTPUT_TYPE,
  TEMPLATE_INSTANCE_TYPE,
  isTemplateBoundary,
  isTemplateInstance,
  templateInterface,
  materializeInterface,
  planTemplateExtraction,
  planTemplateUnpack,
  templateDefContains,
} from './template-def.js'
export type {
  TemplateDefId,
  TemplateDefinition,
  TemplateInterfacePin,
  TemplateMinters,
  TemplateExtraction,
  TemplateUnpackPlan,
} from './template-def.js'

export { flattenTemplateInstance, flattenAllTemplateInstances } from './template-flatten.js'
export type { FlattenedTemplate, PinRef } from './template-flatten.js'

export { defaultWidgetValue, widgetValue, clampWidgetValue, comboOptions, widgetVisibility, widgetBindKey } from './widget.js'
export type { WidgetSpec, WidgetType, WidgetStyle, ComboOption, ComboOptionResolved } from './widget.js'
