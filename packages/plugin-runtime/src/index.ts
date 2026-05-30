export const VERSION = '0.0.0'

export { Runtime } from './vm/interpreter.js'
export type { NodeDef, PureIO, ExecIO, RtNode, RtPin, RtEdge, RtGraph } from './vm/interpreter.js'
export { BUILTIN_PRIMITIVES } from './vm/primitives.js'
export { COLLECTION_PRIMITIVES, domainNodes, SCATTER_VAR_PREFIX, OUTPUT_VAR_PREFIX } from './vm/collection.js'
export { asNumber, asBool, asArray } from './vm/value.js'
export type { VmValue } from './vm/value.js'

export { Allocate } from './model/allocate.js'

export { runtimePlugin } from './editor/plugin.js'
export { attachRuntimeBridge } from './editor/runtime-bridge.js'
export { PIN_TYPES, PRIMITIVE_SCHEMAS, PRIMITIVE_CATEGORY_COLORS, PRIMITIVE_ICONS } from './editor/schemas.js'
export { pinsFromSchemaFields, widgetsFromSchemaFields, schemaPinTypeFor } from './editor/schema-sync.js'
export type { SchemaExtraPin } from './editor/schema-sync.js'
