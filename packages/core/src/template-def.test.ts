import { describe, it, expect } from 'vitest'
import type { Edge, Node } from './graph.js'
import type { NodeId, PinId, EdgeId } from './ids.js'
import {
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
  type TemplateDefId,
  type TemplateDefinition,
} from './template-def.js'

// Deterministic minters so ids are predictable in assertions.
function minters() {
  let n = 0, p = 0, e = 0, d = 0
  return {
    node: () => `n${n++}` as NodeId,
    pin: () => `p${p++}` as PinId,
    edge: () => `e${e++}` as EdgeId,
    def: () => `d${d++}` as TemplateDefId,
  }
}

function node(id: string, type: string, pins: { id: string; dir: 'in' | 'out'; type?: string }[]): Node {
  return {
    id: id as NodeId,
    type,
    position: { x: 0, y: 0 },
    state: {},
    pins: pins.map((pp) => ({
      id: pp.id as PinId,
      kind: 'data' as const,
      direction: pp.dir,
      type: pp.type ?? 'float',
      multiple: pp.dir === 'out',
    })),
  }
}

function edge(id: string, from: [string, string], to: [string, string]): Edge {
  return {
    id: id as EdgeId,
    from: { node: from[0] as NodeId, pin: from[1] as PinId },
    to: { node: to[0] as NodeId, pin: to[1] as PinId },
  }
}

// ext --e1--> A.in ; A.out --e2--> B.in ; B.out --e3--> ext2.in    (members = A, B)
function fixture() {
  const ext = node('ext', 'Src', [{ id: 'e_out', dir: 'out' }])
  const a = node('A', 'Mid', [{ id: 'a_in', dir: 'in' }, { id: 'a_out', dir: 'out' }])
  const b = node('B', 'Mid', [{ id: 'b_in', dir: 'in' }, { id: 'b_out', dir: 'out', type: 'string' }])
  const ext2 = node('ext2', 'Sink', [{ id: 'e2_in', dir: 'in', type: 'string' }])
  const edges = [
    edge('e1', ['ext', 'e_out'], ['A', 'a_in']),
    edge('e2', ['A', 'a_out'], ['B', 'b_in']),
    edge('e3', ['B', 'b_out'], ['ext2', 'e2_in']),
  ]
  const all = [ext, a, b, ext2]
  const pinInfo = (nid: NodeId, pid: PinId) => {
    const found = all.find((nn) => nn.id === nid)?.pins.find((pp) => pp.id === pid)
    return { type: found?.type ?? 'any', ...(found?.label !== undefined ? { label: found.label } : {}) }
  }
  return { ext, a, b, ext2, edges, all, pinInfo }
}

describe('template type guards', () => {
  it('recognises boundary and instance reserved types', () => {
    expect(isTemplateBoundary({ type: TEMPLATE_INPUT_TYPE })).toBe(true)
    expect(isTemplateBoundary({ type: TEMPLATE_OUTPUT_TYPE })).toBe(true)
    expect(isTemplateBoundary({ type: 'Mid' })).toBe(false)
    expect(isTemplateInstance({ type: TEMPLATE_INSTANCE_TYPE })).toBe(true)
    expect(isTemplateInstance({ type: TEMPLATE_INPUT_TYPE })).toBe(false)
  })
})

describe('planTemplateExtraction', () => {
  it('creates exactly one $templateInput and one $templateOutput from the boundary', () => {
    const { a, b, edges, pinInfo } = fixture()
    const r = planTemplateExtraction('inst' as NodeId, [a, b], edges, pinInfo, minters())
    const ins = r.definition.nodes.filter((nn) => nn.type === TEMPLATE_INPUT_TYPE)
    const outs = r.definition.nodes.filter((nn) => nn.type === TEMPLATE_OUTPUT_TYPE)
    expect(ins).toHaveLength(1)
    expect(outs).toHaveLength(1)
    // $templateInput has one OUT pin carrying the fed member-pin type; $templateOutput one IN pin.
    expect(ins[0]!.pins).toHaveLength(1)
    expect(ins[0]!.pins[0]!.direction).toBe('out')
    expect(ins[0]!.pins[0]!.type).toBe('float') // A.a_in is float
    expect(outs[0]!.pins[0]!.direction).toBe('in')
    expect(outs[0]!.pins[0]!.type).toBe('string') // B.b_out is string
  })

  it('keeps the members and routes internal edges into the definition', () => {
    const { a, b, edges, pinInfo } = fixture()
    const r = planTemplateExtraction('inst' as NodeId, [a, b], edges, pinInfo, minters())
    const memberIds = r.definition.nodes.filter((nn) => nn.type === 'Mid').map((nn) => nn.id)
    expect(memberIds).toEqual(['A', 'B'])
    // The internal edge A.a_out -> B.b_in survives in the definition (same id).
    expect(r.definition.edges.some((ee) => ee.id === 'e2')).toBe(true)
    // Two boundary wires were minted: $templateInput -> A.a_in, B.b_out -> $templateOutput.
    const intoA = r.definition.edges.find((ee) => ee.to.node === 'A' && ee.to.pin === 'a_in' && ee.id !== 'e1')
    const fromB = r.definition.edges.find((ee) => ee.from.node === 'B' && ee.from.pin === 'b_out' && ee.id !== 'e3')
    expect(intoA).toBeTruthy()
    expect(fromB).toBeTruthy()
    expect(intoA!.from.node).toBe(ins(r))
    expect(fromB!.to.node).toBe(outs(r))
  })

  it('removes boundary edges from the outer graph and rewires them onto the instance', () => {
    const { a, b, edges, pinInfo } = fixture()
    const r = planTemplateExtraction('inst' as NodeId, [a, b], edges, pinInfo, minters())
    // The two boundary edges (ext->A, B->ext2) are removed from the outer graph.
    expect(new Set(r.outerDisconnect)).toEqual(new Set(['e1', 'e3']))
    // Two instance pins: one 'in' (from $templateInput), one 'out' (to $templateOutput).
    const inPin = r.instancePins.find((pp) => pp.direction === 'in')!
    const outPin = r.instancePins.find((pp) => pp.direction === 'out')!
    expect(r.instancePins).toHaveLength(2)
    expect(inPin.type).toBe('float')
    expect(outPin.type).toBe('string')
    // Outer rewiring points the external endpoints at the instance pins.
    const fed = r.outerConnect.find((ee) => ee.from.node === 'ext')!
    const drained = r.outerConnect.find((ee) => ee.to.node === 'ext2')!
    expect(fed.to).toEqual({ node: 'inst', pin: inPin.id })
    expect(drained.from).toEqual({ node: 'inst', pin: outPin.id })
    expect(new Set(r.removeFromOuter)).toEqual(new Set(['A', 'B']))
  })

  it('promotes FREE (unconnected) member pins to the interface — A.in and B.out are exposed', () => {
    // Two members wired only to EACH OTHER (A.out → B.in); A.in and B.out are free. The instance must
    // still get one input (A.in) and one output (B.out) so it's usable — nothing crosses a boundary.
    const a = node('A', 'Mid', [{ id: 'a_in', dir: 'in' }, { id: 'a_out', dir: 'out' }])
    const b = node('B', 'Mid', [{ id: 'b_in', dir: 'in' }, { id: 'b_out', dir: 'out', type: 'string' }])
    const edges = [edge('e1', ['A', 'a_out'], ['B', 'b_in'])]
    const all = [a, b]
    const pinInfo = (nid: NodeId, pid: PinId) => {
      const found = all.find((nn) => nn.id === nid)?.pins.find((pp) => pp.id === pid)
      return { type: found?.type ?? 'any' }
    }
    const r = planTemplateExtraction('inst' as NodeId, [a, b], edges, pinInfo, minters())
    expect(r.definition.nodes.filter((n) => n.type === TEMPLATE_INPUT_TYPE)).toHaveLength(1)
    expect(r.definition.nodes.filter((n) => n.type === TEMPLATE_OUTPUT_TYPE)).toHaveLength(1)
    expect(r.instancePins.filter((p) => p.direction === 'in')).toHaveLength(1)
    const outPin = r.instancePins.find((p) => p.direction === 'out')!
    expect(outPin.type).toBe('string') // B.b_out's type carried onto the interface
    // No external connections → nothing to rewire on the outer graph.
    expect(r.outerDisconnect).toEqual([])
    expect(r.outerConnect).toEqual([])
    // The internal A.out → B.in edge moves into the definition.
    expect(r.definition.edges.some((ee) => ee.id === 'e1')).toBe(true)
  })

  it('keeps a purely-internal pin internal (A.out → B.in is NOT exposed)', () => {
    const a = node('A', 'Mid', [{ id: 'a_in', dir: 'in' }, { id: 'a_out', dir: 'out' }])
    const b = node('B', 'Mid', [{ id: 'b_in', dir: 'in' }, { id: 'b_out', dir: 'out' }])
    const r = planTemplateExtraction('inst' as NodeId, [a, b], [edge('e1', ['A', 'a_out'], ['B', 'b_in'])],
      () => ({ type: 'float' }), minters())
    // a_out (drives member B) and b_in (fed by member A) must NOT become interface pins.
    expect(r.instancePins).toHaveLength(2) // only a_in (free in) + b_out (free out)
    expect(r.instancePins.map((p) => p.direction).sort()).toEqual(['in', 'out'])
  })

  it('maps each instance pin back to its boundary node for re-sync stability', () => {
    const { a, b, edges, pinInfo } = fixture()
    const r = planTemplateExtraction('inst' as NodeId, [a, b], edges, pinInfo, minters())
    for (const pin of r.instancePins) {
      expect(r.pinBoundary[pin.id]).toBeTruthy()
      const boundaryNode = r.definition.nodes.find((nn) => nn.id === r.pinBoundary[pin.id])
      expect(boundaryNode && isTemplateBoundary(boundaryNode)).toBe(true)
    }
  })
})

describe('planTemplateUnpack', () => {
  function def(): TemplateDefinition {
    return {
      id: 'd' as TemplateDefId, title: 'D',
      nodes: [
        node('A', 'Mid', [{ id: 'a_in', dir: 'in' }, { id: 'a_out', dir: 'out' }]),
        node('ti', TEMPLATE_INPUT_TYPE, [{ id: 'ti_o', dir: 'out' }]),
        node('to', TEMPLATE_OUTPUT_TYPE, [{ id: 'to_i', dir: 'in' }]),
      ],
      edges: [edge('w1', ['ti', 'ti_o'], ['A', 'a_in']), edge('w2', ['A', 'a_out'], ['to', 'to_i'])],
    }
  }
  function instance(): Node {
    const n = node('inst', TEMPLATE_INSTANCE_TYPE, [{ id: 'inP', dir: 'in' }, { id: 'outP', dir: 'out' }])
    n.state = { definitionId: 'd', pinBoundary: { inP: 'ti', outP: 'to' } }
    return n
  }

  it('inlines the definition members (fresh ids, no boundary nodes) and rewires outer edges', () => {
    const outer = [edge('o1', ['ext', 'eo'], ['inst', 'inP']), edge('o2', ['inst', 'outP'], ['ext2', 'e2i'])]
    const r = planTemplateUnpack(instance(), def(), outer, minters())
    // Only the member A is inlined — the boundary nodes dissolve.
    expect(r.addNodes).toHaveLength(1)
    expect(r.addNodes[0]!.type).toBe('Mid')
    expect(r.addNodes[0]!.id).not.toBe('A') // fresh id
    expect(r.removeNode).toBe('inst')
    expect(new Set(r.removeEdges)).toEqual(new Set(['o1', 'o2']))
    // The two outer edges are rewired onto the inlined member's pins.
    const aNew = r.addNodes[0]!.id
    const inEdge = r.addEdges.find((e) => e.from.node === 'ext')!
    const outEdge = r.addEdges.find((e) => e.to.node === 'ext2')!
    expect(inEdge.to.node).toBe(aNew)
    expect(outEdge.from.node).toBe(aNew)
    // nodeRemap lets the caller carry render opts from the old member id to the new one.
    expect(r.nodeRemap['A']).toBe(aNew)
  })

  it('a free instance pin leaves the inlined member pin unconnected (nothing to rewire)', () => {
    const r = planTemplateUnpack(instance(), def(), [], minters()) // no outer edges
    expect(r.addNodes).toHaveLength(1)
    expect(r.removeEdges).toEqual([])
    // No outer edges → no rewired edges (the internal w1/w2 are boundary wires, dropped).
    expect(r.addEdges).toEqual([])
  })
})

describe('templateInterface + materializeInterface', () => {
  it('lists one descriptor per boundary node, inputs before outputs, deterministic', () => {
    const { a, b, edges, pinInfo } = fixture()
    const r = planTemplateExtraction('inst' as NodeId, [a, b], edges, pinInfo, minters())
    const iface = templateInterface(r.definition)
    expect(iface.map((d) => d.direction)).toEqual(['in', 'out'])
    expect(iface[0]!.type).toBe('float')
    expect(iface[1]!.type).toBe('string')
  })

  it('mints fresh per-instance pin ids while preserving direction/type and a boundary map', () => {
    const { a, b, edges, pinInfo } = fixture()
    const r = planTemplateExtraction('inst' as NodeId, [a, b], edges, pinInfo, minters())
    const iface = templateInterface(r.definition)
    let i = 0
    const { pins, pinBoundary } = materializeInterface(iface, () => `fresh${i++}` as PinId)
    expect(pins.map((pp) => pp.id)).toEqual(['fresh0', 'fresh1'])
    expect(pins.map((pp) => pp.direction)).toEqual(['in', 'out'])
    expect(pinBoundary['fresh0']).toBe(iface[0]!.boundary)
  })
})

describe('templateDefContains (recursion guard)', () => {
  function defWithInstanceOf(id: string, ref: string): TemplateDefinition {
    return {
      id: id as TemplateDefId,
      title: id,
      nodes: [{ id: `${id}_i` as NodeId, type: TEMPLATE_INSTANCE_TYPE, position: { x: 0, y: 0 }, state: { definitionId: ref }, pins: [] }],
      edges: [],
    }
  }
  it('detects direct self-containment', () => {
    const reg = new Map<TemplateDefId, TemplateDefinition>([['D' as TemplateDefId, defWithInstanceOf('D', 'D')]])
    expect(templateDefContains(reg, 'D' as TemplateDefId, 'D' as TemplateDefId)).toBe(true)
  })
  it('detects transitive containment D -> E -> D', () => {
    const reg = new Map<TemplateDefId, TemplateDefinition>([
      ['D' as TemplateDefId, defWithInstanceOf('D', 'E')],
      ['E' as TemplateDefId, defWithInstanceOf('E', 'D')],
    ])
    expect(templateDefContains(reg, 'D' as TemplateDefId, 'D' as TemplateDefId)).toBe(true)
  })
  it('returns false when there is no cycle', () => {
    const reg = new Map<TemplateDefId, TemplateDefinition>([
      ['D' as TemplateDefId, defWithInstanceOf('D', 'E')],
      ['E' as TemplateDefId, { id: 'E' as TemplateDefId, title: 'E', nodes: [], edges: [] }],
    ])
    expect(templateDefContains(reg, 'D' as TemplateDefId, 'D' as TemplateDefId)).toBe(false)
  })
})

// helpers: id of the single boundary node of each kind in an extraction result
function ins(r: ReturnType<typeof planTemplateExtraction>): string {
  return r.definition.nodes.find((nn) => nn.type === TEMPLATE_INPUT_TYPE)!.id
}
function outs(r: ReturnType<typeof planTemplateExtraction>): string {
  return r.definition.nodes.find((nn) => nn.type === TEMPLATE_OUTPUT_TYPE)!.id
}
