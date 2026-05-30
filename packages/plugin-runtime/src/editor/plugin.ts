// The XenolithGraph plugin: installs the runtime's pin types + primitive node schemas into the
// editor (so the COMPUTE graph is visible/editable and the primitives show in the Tab palette).
// Type-only imports from core/editor → erased at runtime, so the headless VM stays import-free.
//
// This is the registration layer only — driving the live graph (reading editor.graph each tick and
// running the VM) is the host's job, kept separate so the same VM can run headlessly.

import type { XenolithPlugin, PluginContext } from '@xenolith/editor'
import type { Node, NodeId } from '@xenolith/core'
import { PIN_TYPES, PRIMITIVE_SCHEMAS } from './schemas.js'
import { outputWidget } from './output-widget.js'
import { structWidget } from './struct-widget.js'
import { pinsFromSchemaFields, widgetsFromSchemaFields, type SchemaExtraPin } from './schema-sync.js'

/** Find the Struct's `schema` IN-pin id (looks for label='schema', falls back to id ending ':schema'). */
function findSchemaPinId(node: Node): string | null {
  for (const p of node.pins) {
    if (p.kind === 'data' && p.direction === 'in' && (p.label === 'schema' || String(p.id) === 'schema' || String(p.id).endsWith(':schema'))) {
      return String(p.id)
    }
  }
  return null
}

/** Re-sync a Struct's pins from the Schema currently wired into its `schema` pin. No-op if the
 *  Struct has no schema pin, or no edge into it, or the source isn't a Schema-typed node. */
function syncStructFromSchema(ctx: PluginContext, structId: NodeId): void {
  const struct = ctx.graph.getNode(structId)
  if (!struct || struct.type !== 'Struct') return
  const schemaPinId = findSchemaPinId(struct as Node)
  if (!schemaPinId) return
  let sourceSchema: Node | null = null
  for (const e of ctx.graph.edges()) {
    if (String(e.to.node) === String(structId) && String(e.to.pin) === schemaPinId) {
      const src = ctx.graph.getNode(e.from.node)
      if (src && src.type === 'Schema') { sourceSchema = src as Node; break }
    }
  }
  const fields = (sourceSchema?.state['fields']    as Record<string, unknown>     | undefined) ?? {}
  const extras = (sourceSchema?.state['extraPins'] as ReadonlyArray<SchemaExtraPin> | undefined) ?? []
  ctx.setNodePins(structId, pinsFromSchemaFields(struct.pins, fields, extras))
  // Preserve any HAND-AUTHORED widgets that aren't `field:*` (none today, but the API allows it);
  // replace the schema-derived widget block wholesale on every sync.
  const handAuthored = (struct.widgets ?? []).filter((w) => !String(w.id).startsWith('field:'))
  ctx.setNodeWidgets(structId, [...handAuthored, ...widgetsFromSchemaFields(fields)])
  // Seed `state[<field>]` with each field's default value so the pinKey-bound widget shows
  // something and the Struct evaluator's fallback returns that value (not undefined) on the first
  // tick before any wire delivers. Skip a field whose state is already set (user already typed).
  for (const [key, value] of Object.entries(fields)) {
    if (struct.state[key] === undefined) ctx.setWidgetValue(structId, `field:${key}`, value, { ephemeral: true })
  }
}

export const runtimePlugin: XenolithPlugin = {
  name: 'runtime',
  install(ctx) {
    for (const t of PIN_TYPES) ctx.types.register(t)
    for (const s of PRIMITIVE_SCHEMAS) ctx.registry.register(s)
    ctx.registerWidget('output', outputWidget)
    ctx.registerWidget('struct', structWidget)

    // Schema → Struct pin sync: when an edge enters a Struct's `schema` pin, synthesize one in-pin
    // per field of the source Schema. On disconnect, strip the synthesized field pins.
    const offConn = ctx.on('edge:connected', ({ edge }) => {
      const target = ctx.graph.getNode(edge.to.node)
      if (target?.type === 'Struct') syncStructFromSchema(ctx, edge.to.node)
    })
    const offDisc = ctx.on('edge:disconnected', () => {
      // We don't know which endpoint vanished without an edge record; rescan all Structs and
      // re-sync. Cheap on graphs of any plausible size (one setNodePins per Struct, no-op when
      // pins didn't change).
      for (const n of ctx.graph.nodes()) {
        if (n.type === 'Struct') syncStructFromSchema(ctx, n.id)
      }
    })
    // `loadJSON` adds edges via a fast path that doesn't fire edge:connected, so on graph load
    // we explicitly rescan every Struct with a wired Schema and sync once.
    const offLoaded = ctx.on('graph:loaded', () => {
      for (const n of ctx.graph.nodes()) {
        if (n.type === 'Struct') syncStructFromSchema(ctx, n.id)
      }
    })

    // A Schema's `fields` widget changing also needs a re-sync on every Struct wired to it.
    const offWidget = ctx.on('widget:changed', ({ nodeId, widgetId }) => {
      const n = ctx.graph.getNode(nodeId)
      if (!n || n.type !== 'Schema' || widgetId !== 'fields') return
      for (const struct of ctx.graph.nodes()) {
        if (struct.type !== 'Struct') continue
        for (const e of ctx.graph.edges()) {
          if (String(e.from.node) === String(nodeId) && String(e.to.node) === String(struct.id)) {
            syncStructFromSchema(ctx, struct.id); break
          }
        }
      }
    })

    return () => {
      offConn(); offDisc(); offLoaded(); offWidget()
      for (const s of PRIMITIVE_SCHEMAS) ctx.registry.unregister(s.type)
      for (const t of PIN_TYPES) ctx.types.unregister(t.id)
    }
  },
}
