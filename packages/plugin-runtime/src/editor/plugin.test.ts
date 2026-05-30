import { describe, it, expect } from 'vitest'
import { NodeRegistry, TypeRegistry } from '@xenolith/core'
import type { PluginContext } from '@xenolith/editor'
import { runtimePlugin } from './plugin.js'
import { PIN_TYPES, PRIMITIVE_SCHEMAS } from './schemas.js'

// Real core registries + a stubbed context (install only touches registry/types).
function makeCtx(): { ctx: PluginContext; registry: NodeRegistry; types: TypeRegistry; widgets: Map<string, unknown> } {
  const registry = new NodeRegistry()
  const types = new TypeRegistry()
  const widgets = new Map<string, unknown>()
  // Install also subscribes to edge:connected/disconnected and widget:changed for Schema sync —
  // stub these so the install path doesn't crash.
  const noop = (): void => {}
  const ctx = {
    registry, types,
    registerWidget: (n: string, c: unknown) => widgets.set(n, c),
    on: () => noop,
    graph: { nodes: () => [], edges: () => [], getNode: () => undefined },
  } as unknown as PluginContext
  return { ctx, registry, types, widgets }
}

describe('Schema → Struct pin sync (edge:connected listener)', () => {
  it('synthesizes one in-pin per Schema field on the target Struct when wired', () => {
    // Mini fake graph the plugin reads through ctx.graph + ctx.on + ctx.setNodePins.
    const struct = {
      id: 'st', type: 'Struct', state: {} as Record<string, unknown>,
      pins: [
        { id: 'st:schema', kind: 'data', direction: 'in',  type: 'object', multiple: false, label: 'schema' },
        { id: 'st:self',   kind: 'data', direction: 'out', type: 'object', multiple: true,  label: 'self'   },
      ],
      widgets: [] as unknown[],
    }
    const schema = {
      id: 'sch', type: 'Schema',
      state: { fields: { name: 'Ada', priority: 0, salary: 0.5 } },
      pins: [{ id: 'sch:definition', kind: 'data', direction: 'out', type: 'object', multiple: true, label: 'definition' }],
    }
    const nodes = [struct, schema]
    const edges: Array<{ from: { node: string; pin: string }; to: { node: string; pin: string } }> = []

    const listeners: Record<string, ((p: unknown) => void)[]> = {}
    const setPinsCalls: Array<{ nodeId: string; pins: unknown[] }> = []
    const setWidgetsCalls: Array<{ nodeId: string; widgets: unknown[] }> = []
    const setWidgetValueCalls: Array<{ nodeId: string; widgetId: string; value: unknown }> = []

    const registry = new NodeRegistry()
    const types = new TypeRegistry()
    const noop = (): void => {}
    const ctx = {
      registry, types,
      registerWidget: noop,
      on: (event: string, cb: (p: unknown) => void) => {
        ;(listeners[event] ??= []).push(cb)
        return noop
      },
      graph: {
        nodes: () => nodes,
        edges: () => edges,
        getNode: (id: string) => nodes.find((n) => n.id === id),
      },
      setNodePins: (nodeId: string, pins: unknown[]) => {
        setPinsCalls.push({ nodeId, pins })
        const target = nodes.find((n) => n.id === nodeId)
        if (target) (target as { pins: unknown[] }).pins = pins
      },
      setNodeWidgets: (nodeId: string, widgets: unknown[]) => {
        setWidgetsCalls.push({ nodeId, widgets })
        const target = nodes.find((n) => n.id === nodeId)
        if (target) (target as { widgets: unknown[] }).widgets = widgets
      },
      setWidgetValue: (nodeId: string, widgetId: string, value: unknown) => {
        setWidgetValueCalls.push({ nodeId, widgetId, value })
        const target = nodes.find((n) => n.id === nodeId)
        if (target) {
          const key = widgetId.startsWith('field:') ? widgetId.slice('field:'.length) : widgetId
          ;(target as { state: Record<string, unknown> }).state[key] = value
        }
      },
    } as unknown as PluginContext

    runtimePlugin.install(ctx)

    // Simulate the edge being added, then fire edge:connected as the editor would.
    edges.push({ from: { node: 'sch', pin: 'sch:definition' }, to: { node: 'st', pin: 'st:schema' } })
    for (const cb of listeners['edge:connected'] ?? []) cb({ edge: edges[0]! })

    expect(setPinsCalls).toHaveLength(1)
    const newPins = setPinsCalls[0]!.pins as Array<{ id: string; label?: string; type?: string }>
    expect(newPins.map((p) => p.id)).toEqual(['st:schema', 'st:self', 'field:name', 'field:priority', 'field:salary'])
    expect(newPins.find((p) => p.id === 'field:priority')?.type).toBe('scalar')
    expect(newPins.find((p) => p.id === 'field:name')?.type).toBe('string')

    expect(setWidgetsCalls).toHaveLength(1)
    const newWidgets = setWidgetsCalls[0]!.widgets as Array<{ id: string; key?: string; type?: string }>
    expect(newWidgets.map((w) => w.id)).toEqual(['field:name', 'field:priority', 'field:salary'])
    expect(newWidgets.find((w) => w.key === 'priority')?.type).toBe('number')
    expect(newWidgets.find((w) => w.key === 'name')?.type).toBe('text')

    // Defaults from the schema are seeded into the Struct's state so the widget shows them and the
    // evaluator's fallback returns a real value before any wire delivers.
    expect(struct.state).toEqual({ name: 'Ada', priority: 0, salary: 0.5 })
  })
})

describe('runtimePlugin', () => {
  it('registers every pin type and primitive schema on install', () => {
    const { ctx, registry, types } = makeCtx()
    runtimePlugin.install(ctx)
    for (const t of PIN_TYPES) expect(types.has(t.id)).toBe(true)
    for (const s of PRIMITIVE_SCHEMAS) expect(registry.get(s.type)).toBeDefined()
  })

  it('the disposer unregisters everything it added', () => {
    const { ctx, registry, types } = makeCtx()
    const dispose = runtimePlugin.install(ctx) as () => void
    dispose()
    for (const t of PIN_TYPES) expect(types.has(t.id)).toBe(false)
    for (const s of PRIMITIVE_SCHEMAS) expect(registry.get(s.type)).toBeUndefined()
  })

  it('pure math/array primitives carry the pure flag; flow/domain nodes do not', () => {
    const pure = PRIMITIVE_SCHEMAS.filter((s) => s.pure).map((s) => s.type).sort()
    expect(pure).toEqual(['Add', 'Append', 'ArgMax', 'ArrayWrite', 'Const', 'Eq', 'FilterIndices', 'Gather', 'GatherFromInputs', 'GatherRecords', 'GetField', 'GetVar', 'Gt', 'Gte', 'Includes', 'Index', 'IndexAll', 'Length', 'MapField', 'Mean', 'Mul', 'ObjectGet', 'ScaleArray', 'Schema', 'Struct', 'Sub', 'ToMap', 'ZipAdd'])
    expect(PRIMITIVE_SCHEMAS.find((s) => s.type === 'Output')?.pure).toBeUndefined()
    expect(PRIMITIVE_SCHEMAS.find((s) => s.type === 'Allocate')?.pure).toBeUndefined()
    expect(PRIMITIVE_SCHEMAS.find((s) => s.type === 'Tick')?.pure).toBeUndefined()
  })
})
