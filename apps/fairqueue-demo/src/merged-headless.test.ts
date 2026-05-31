import { describe, it, expect } from 'vitest'
import { Runtime, pinsFromSchemaFields, type RtGraph, type RtNode, type SchemaExtraPin } from '@xenolith/plugin-runtime'
import { flattenAllTemplateInstances, createNodeId, createPinId, createEdgeId, type Node, type Edge, type TemplateDefinition, type TemplateDefId } from '@xenolith/core'
import { fairqueueMergedGraph, MERGED_DEFS } from './runtime-graph.js'
import { createSim } from './fairqueue.js'

// The merged graph in headless form. Strip XenolithGraphV1 chrome to RtGraph, FLATTEN any
// `$templateInstance` nodes via core's `flattenAllTemplateInstances` (the same path
// `graphSnapshot({ expandTemplates: true })` takes inside the editor), then run a few ticks —
// proves the templated + wire-driven graph reaches the VM with the same behaviour as the
// editor-driven runtime.
describe('merged graph (headless)', () => {
  it('produces non-zero priorities after a few ticks', () => {
    const { agents, goodies } = (() => {
      const ag = ['Ada', 'Boris', 'Cleo', 'Dmitri', 'Esra', 'Finn']
      const sub: Record<string, string[]> = {
        Ada: ['gift', 'coin'], Boris: ['coin'], Cleo: ['gift', 'star'],
        Dmitri: ['coin', 'star'], Esra: ['gift', 'coin', 'star'], Finn: ['star'],
      }
      const sal: Record<string, number> = { Ada: 0.5, Boris: 0.4, Cleo: 0.6, Dmitri: 0.5, Esra: 0.55, Finn: 0.45 }
      const agents = ag.map((id) => ({ id, priority: 0, salary: sal[id]!, subscriptions: sub[id]! }))
      const goodies = [{ type: 'gift', cost: 2, rate: 0.4 }, { type: 'coin', cost: 1.5, rate: 0.6 }, { type: 'star', cost: 4, rate: 0.2 }]
      void createSim // keep import (typecheck)
      return { agents, goodies }
    })()

    const v1 = fairqueueMergedGraph(agents, goodies)
    // 1) Coerce V1 nodes/edges to core's Node/Edge for the flattener (same shape, branded ids).
    const v1Nodes = v1.nodes.map((n): Node => ({
      id: n.id as unknown as Node['id'],
      type: n.type,
      position: n.position,
      state: (n.state ?? {}) as Record<string, unknown>,
      pins: n.pins.map((p) => ({
        id: p.id as unknown as import('@xenolith/core').PinId,
        kind: p.kind, direction: p.direction, type: String(p.type), multiple: !!p.multiple,
        ...(p.label !== undefined ? { label: p.label } : {}),
      })),
    }))
    const v1Edges = v1.edges.map((edge): Edge => ({
      id: edge.id as unknown as Edge['id'],
      from: { node: edge.from.node as unknown as Node['id'], pin: edge.from.pin as unknown as import('@xenolith/core').PinId },
      to:   { node: edge.to.node   as unknown as Node['id'], pin: edge.to.pin   as unknown as import('@xenolith/core').PinId },
    }))
    // 2) FLATTEN any `$templateInstance` against the V1 graph's `templates` map. Pure helper from
    //    core — same code path `graphSnapshot({ expandTemplates: true })` runs editor-side.
    const defs = new Map<TemplateDefId, TemplateDefinition>()
    if (v1.templates) for (const [id, t] of Object.entries(v1.templates)) {
      defs.set(id as TemplateDefId, {
        id: id as TemplateDefId, title: t.title,
        nodes: t.nodes as unknown as Node[],
        edges: t.edges as unknown as Edge[],
      })
    }
    const flat = flattenAllTemplateInstances(v1Nodes, v1Edges,
      (id) => defs.get(id),
      { node: createNodeId, pin: createPinId, edge: createEdgeId })

    // 3) Synthesize per-Struct field pins from each wired Schema's `state.fields` (the plugin does
    //    this editor-side; here we replicate just enough for the headless VM run).
    const schemaByNodeId = new Map<string, { fields: Record<string, unknown>; extras: SchemaExtraPin[] }>()
    for (const n of flat.nodes) if (n.type === 'Schema') {
      schemaByNodeId.set(String(n.id), {
        fields: (n.state?.['fields']    as Record<string, unknown>)     ?? {},
        extras: (n.state?.['extraPins'] as SchemaExtraPin[]) ?? [],
      })
    }
    const schemaPinFor = (structId: string): string | null => {
      const wire = flat.edges.find((edge) => String(edge.to.node) === structId && schemaByNodeId.has(String(edge.from.node)))
      return wire ? String(wire.from.node) : null
    }
    const rtNodes: RtNode[] = flat.nodes.map((n) => {
      if (n.type !== 'Struct') return { id: String(n.id), type: n.type, state: (n.state ?? {}) as Record<string, unknown>, pins: n.pins.map((p) => ({ id: String(p.id), kind: p.kind, direction: p.direction, type: String(p.type), multiple: !!p.multiple })) }
      const srcSchema = schemaPinFor(String(n.id))
      const schema = srcSchema ? schemaByNodeId.get(srcSchema)! : { fields: {}, extras: [] }
      const synthesized = pinsFromSchemaFields(n.pins, schema.fields, schema.extras)
      return { id: String(n.id), type: n.type, state: (n.state ?? {}) as Record<string, unknown>, pins: synthesized.map((p) => ({ id: String(p.id), kind: p.kind, direction: p.direction, type: String(p.type), multiple: !!p.multiple })) }
    })
    const rtEdges = flat.edges.map((edge) => ({ from: { node: String(edge.from.node), pin: String(edge.from.pin) }, to: { node: String(edge.to.node), pin: String(edge.to.pin) } }))
    const graph: RtGraph = { nodes: rtNodes, edges: rtEdges }

    const rt = new Runtime(MERGED_DEFS)
    for (let i = 0; i < 5; i++) rt.tick(graph)
    const scattered = (rt.getVar('scatter-out:scatter') as number[] | undefined) ?? []
    expect(scattered.length).toBe(agents.length)
    expect(scattered.some((v) => v !== 0)).toBe(true)
  })
})
