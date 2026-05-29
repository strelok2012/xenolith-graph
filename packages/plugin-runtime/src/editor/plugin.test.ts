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
  const ctx = { registry, types, registerWidget: (n: string, c: unknown) => widgets.set(n, c) } as unknown as PluginContext
  return { ctx, registry, types, widgets }
}

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
    expect(pure).toEqual(['Add', 'Const', 'Gather', 'GatherFromInputs', 'GatherRecords', 'GetField', 'GetVar', 'Length', 'MapField', 'Mul', 'ScaleArray', 'Sub', 'ToMap', 'ZipAdd'])
    expect(PRIMITIVE_SCHEMAS.find((s) => s.type === 'Output')?.pure).toBeUndefined()
    expect(PRIMITIVE_SCHEMAS.find((s) => s.type === 'Allocate')?.pure).toBeUndefined()
    expect(PRIMITIVE_SCHEMAS.find((s) => s.type === 'Tick')?.pure).toBeUndefined()
  })
})
