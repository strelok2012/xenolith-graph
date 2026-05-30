import { describe, it, expect } from 'vitest'
import type { Node, Edge } from './graph.js'
import type { NodeId, PinId, EdgeId } from './ids.js'
import {
  TEMPLATE_INPUT_TYPE,
  TEMPLATE_OUTPUT_TYPE,
  TEMPLATE_INSTANCE_TYPE,
  type TemplateDefId,
  type TemplateDefinition,
} from './template-def.js'
import { flattenTemplateInstance, flattenAllTemplateInstances } from './template-flatten.js'

// Deterministic id minting for readable assertions.
function minters() {
  let n = 0, p = 0, e = 0
  return {
    node: () => `N${n++}` as NodeId,
    pin: () => `P${p++}` as PinId,
    edge: () => `E${e++}` as EdgeId,
  }
}

const tin = (id: string, pin: string, type = 'float'): Node => ({
  id: id as NodeId, type: TEMPLATE_INPUT_TYPE, position: { x: 0, y: 0 }, state: {},
  pins: [{ id: pin as PinId, kind: 'data', direction: 'out', type, multiple: true }],
})
const tout = (id: string, pin: string, type = 'float'): Node => ({
  id: id as NodeId, type: TEMPLATE_OUTPUT_TYPE, position: { x: 0, y: 0 }, state: {},
  pins: [{ id: pin as PinId, kind: 'data', direction: 'in', type, multiple: false }],
})
const member = (id: string, type: string, pins: Node['pins']): Node => ({
  id: id as NodeId, type, position: { x: 0, y: 0 }, state: {}, pins,
})
const dpin = (id: string, direction: 'in' | 'out', type = 'float') =>
  ({ id: id as PinId, kind: 'data' as const, direction, type, multiple: direction === 'out' })
const edge = (id: string, fn: string, fp: string, tn: string, tp: string): Edge => ({
  id: id as EdgeId, from: { node: fn as NodeId, pin: fp as PinId }, to: { node: tn as NodeId, pin: tp as PinId },
})

function instanceNode(id: string, defId: string, pins: Array<{ pin: string; dir: 'in' | 'out'; boundary: string; type?: string }>): Node {
  const pinBoundary: Record<string, string> = {}
  for (const p of pins) pinBoundary[p.pin] = p.boundary
  return {
    id: id as NodeId, type: TEMPLATE_INSTANCE_TYPE, position: { x: 0, y: 0 },
    state: { definitionId: defId, pinBoundary },
    pins: pins.map((p) => dpin(p.pin, p.dir, p.type)),
  }
}

describe('flattenTemplateInstance', () => {
  // add_def: two inputs (A, B) → an Add member → one output (Sum).
  const add_def: TemplateDefinition = {
    id: 'add_def' as TemplateDefId, title: 'Add',
    nodes: [
      tin('ti_a', 'tia_o'), tin('ti_b', 'tib_o'),
      member('m_add', 'Add', [dpin('ai', 'in'), dpin('bi', 'in'), dpin('ao', 'out')]),
      tout('to_sum', 'tos_i'),
    ],
    edges: [
      edge('de0', 'ti_a', 'tia_o', 'm_add', 'ai'),
      edge('de1', 'ti_b', 'tib_o', 'm_add', 'bi'),
      edge('de2', 'm_add', 'ao', 'to_sum', 'tos_i'),
    ],
  }
  const addInstance = () => instanceNode('inst1', 'add_def', [
    { pin: 'p_in1', dir: 'in', boundary: 'ti_a' },
    { pin: 'p_in2', dir: 'in', boundary: 'ti_b' },
    { pin: 'p_out', dir: 'out', boundary: 'to_sum' },
  ])
  const reg = new Map<TemplateDefId, TemplateDefinition>([[add_def.id, add_def]])
  const resolve = (id: TemplateDefId) => reg.get(id)

  it('flattens one level: members get fresh ids, boundaries map to internal pins', () => {
    const inst = addInstance()
    const r = flattenTemplateInstance(inst, resolve, minters())!
    expect(r.nodes).toHaveLength(1)
    expect(r.nodes[0]!.type).toBe('Add')
    expect(r.nodes[0]!.id).not.toBe('m_add')          // fresh id, document untouched
    expect(r.edges).toHaveLength(0)                   // both def edges crossed a boundary
    const m = r.nodes[0]!
    const ai = m.pins.find((p) => p.direction === 'in')!.id
    const ao = m.pins.find((p) => p.direction === 'out')!.id
    expect(r.boundary.inputs['p_in1']).toEqual([{ node: m.id, pin: ai }])
    expect(r.boundary.inputs['p_in2']![0]!.node).toBe(m.id)
    expect(r.boundary.outputs['p_out']).toEqual({ node: m.id, pin: ao })
  })

  it('does not mutate the definition or the instance', () => {
    const inst = addInstance()
    const before = JSON.stringify({ def: add_def, inst })
    flattenTemplateInstance(inst, resolve, minters())
    expect(JSON.stringify({ def: add_def, inst })).toBe(before)
  })

  it('keeps member→member edges with fresh ids', () => {
    const chain: TemplateDefinition = {
      id: 'chain_def' as TemplateDefId, title: 'Chain',
      nodes: [
        tin('ci', 'cio'),
        member('m1', 'Step', [dpin('m1i', 'in'), dpin('m1o', 'out')]),
        member('m2', 'Step', [dpin('m2i', 'in'), dpin('m2o', 'out')]),
        tout('co', 'coi'),
      ],
      edges: [edge('c0', 'ci', 'cio', 'm1', 'm1i'), edge('c1', 'm1', 'm1o', 'm2', 'm2i'), edge('c2', 'm2', 'm2o', 'co', 'coi')],
    }
    const r = flattenTemplateInstance(
      instanceNode('ci1', 'chain_def', [{ pin: 'pi', dir: 'in', boundary: 'ci' }, { pin: 'po', dir: 'out', boundary: 'co' }]),
      (id) => (id === chain.id ? chain : undefined),
      minters(),
    )!
    expect(r.nodes).toHaveLength(2)
    expect(r.edges).toHaveLength(1) // m1.out → m2.in, fresh ids pointing at the cloned nodes
    const ids = new Set(r.nodes.map((n) => n.id))
    expect(ids.has(r.edges[0]!.from.node)).toBe(true)
    expect(ids.has(r.edges[0]!.to.node)).toBe(true)
  })

  it('recursively flattens a nested instance (fan-out preserved)', () => {
    // outer_def: a single input feeds BOTH inputs of a nested add_def instance; its output is the outer output.
    const outer_def: TemplateDefinition = {
      id: 'outer_def' as TemplateDefId, title: 'Outer',
      nodes: [
        tin('oi', 'oio'),
        instanceNode('nested', 'add_def', [
          { pin: 'ni_in1', dir: 'in', boundary: 'ti_a' },
          { pin: 'ni_in2', dir: 'in', boundary: 'ti_b' },
          { pin: 'ni_out', dir: 'out', boundary: 'to_sum' },
        ]),
        tout('oo', 'ooi'),
      ],
      edges: [
        edge('o0', 'oi', 'oio', 'nested', 'ni_in1'),
        edge('o1', 'oi', 'oio', 'nested', 'ni_in2'),
        edge('o2', 'nested', 'ni_out', 'oo', 'ooi'),
      ],
    }
    const reg2 = new Map<TemplateDefId, TemplateDefinition>([[add_def.id, add_def], [outer_def.id, outer_def]])
    const r = flattenTemplateInstance(
      instanceNode('oinst', 'outer_def', [{ pin: 'P_in', dir: 'in', boundary: 'oi' }, { pin: 'P_out', dir: 'out', boundary: 'oo' }]),
      (id) => reg2.get(id),
      minters(),
    )!
    expect(r.nodes).toHaveLength(1)           // only the deeply-nested Add primitive survives
    expect(r.nodes[0]!.type).toBe('Add')
    const m = r.nodes[0]!
    expect(r.boundary.inputs['P_in']).toHaveLength(2) // outer input fans out to both Add inputs
    expect(r.boundary.inputs['P_in']!.every((ref) => ref.node === m.id)).toBe(true)
    expect(r.boundary.outputs['P_out']!.node).toBe(m.id)
  })

  it('returns null on a recursive (self-containing) definition', () => {
    const self_def: TemplateDefinition = {
      id: 'self_def' as TemplateDefId, title: 'Self',
      nodes: [
        tin('si', 'sio'),
        instanceNode('self_inst', 'self_def', [{ pin: 'x', dir: 'in', boundary: 'si' }]),
      ],
      edges: [edge('s0', 'si', 'sio', 'self_inst', 'x')],
    }
    const r = flattenTemplateInstance(
      instanceNode('si1', 'self_def', [{ pin: 'pi', dir: 'in', boundary: 'si' }]),
      (id) => (id === self_def.id ? self_def : undefined),
      minters(),
    )
    expect(r).toBeNull()
  })

  it('returns null when the definition is not registered', () => {
    const inst = instanceNode('x', 'missing_def', [])
    expect(flattenTemplateInstance(inst, () => undefined, minters())).toBeNull()
  })
})

describe('flattenAllTemplateInstances', () => {
  // Reuse: an Add definition (in A, in B → Add member → out Sum).
  const add_def: TemplateDefinition = {
    id: 'add_def' as TemplateDefId, title: 'Add',
    nodes: [
      tin('ti_a', 'tia_o'), tin('ti_b', 'tib_o'),
      member('m_add', 'Add', [dpin('ai', 'in'), dpin('bi', 'in'), dpin('ao', 'out')]),
      tout('to_sum', 'tos_i'),
    ],
    edges: [
      edge('de0', 'ti_a', 'tia_o', 'm_add', 'ai'),
      edge('de1', 'ti_b', 'tib_o', 'm_add', 'bi'),
      edge('de2', 'm_add', 'ao', 'to_sum', 'tos_i'),
    ],
  }
  const resolve = (id: TemplateDefId) => (id === add_def.id ? add_def : undefined)
  const mkInst = (id: string) => instanceNode(id, 'add_def', [
    { pin: `${id}_pin_a`, dir: 'in',  boundary: 'ti_a' },
    { pin: `${id}_pin_b`, dir: 'in',  boundary: 'ti_b' },
    { pin: `${id}_pin_o`, dir: 'out', boundary: 'to_sum' },
  ])

  it('replaces instances with primitives and rewires external edges to internal pins', () => {
    // External producers `src_a`, `src_b` feed instance `inst1`; consumer `dst` reads its output.
    const src_a = member('src_a', 'Src', [dpin('sa_o', 'out')])
    const src_b = member('src_b', 'Src', [dpin('sb_o', 'out')])
    const dst   = member('dst',   'Dst', [dpin('di', 'in')])
    const inst  = mkInst('inst1')
    const ext: Edge[] = [
      edge('ee0', 'src_a', 'sa_o', 'inst1', 'inst1_pin_a'),
      edge('ee1', 'src_b', 'sb_o', 'inst1', 'inst1_pin_b'),
      edge('ee2', 'inst1', 'inst1_pin_o', 'dst', 'di'),
    ]
    const r = flattenAllTemplateInstances([src_a, src_b, inst, dst], ext, resolve, minters())

    expect(r.nodes.map((n) => n.type).sort()).toEqual(['Add', 'Dst', 'Src', 'Src'])
    expect(r.nodes.some((n) => n.type === TEMPLATE_INSTANCE_TYPE)).toBe(false)
    const add = r.nodes.find((n) => n.type === 'Add')!
    const ai = add.pins.find((p) => p.id.toString().endsWith('') && p.direction === 'in')!  // any in
    // Every external edge must now land on `add` (no edge still references `inst1`).
    for (const e of r.edges) {
      expect(String(e.from.node)).not.toBe('inst1')
      expect(String(e.to.node)).not.toBe('inst1')
    }
    // src_a/src_b must each reach one of add's IN pins; add's OUT must reach dst.di.
    const intoAdd = r.edges.filter((e) => e.to.node === add.id).map((e) => e.from.node).sort()
    expect(intoAdd).toEqual(['src_a', 'src_b'])
    const fromAdd = r.edges.find((e) => e.from.node === add.id)!
    expect(fromAdd.to).toEqual({ node: 'dst', pin: 'di' })
    void ai
  })

  it('flattens multiple instances independently (fresh ids, no aliasing)', () => {
    const a = mkInst('A'); const b = mkInst('B')
    const r = flattenAllTemplateInstances([a, b], [], resolve, minters())
    const adds = r.nodes.filter((n) => n.type === 'Add')
    expect(adds).toHaveLength(2)
    expect(adds[0]!.id).not.toBe(adds[1]!.id)
  })

  it('passes through non-template nodes and untouched edges unchanged', () => {
    const plain = member('plain', 'Plain', [dpin('pi', 'in'), dpin('po', 'out')])
    const e: Edge = edge('plain_e', 'plain', 'po', 'plain', 'pi') // self-loop, structurally fine for the test
    const r = flattenAllTemplateInstances([plain], [e], resolve, minters())
    expect(r.nodes).toEqual([plain])
    expect(r.edges).toEqual([e])
  })

  it('leaves an unresolved instance in place (definition missing)', () => {
    const orphan = instanceNode('orph', 'missing_def', [{ pin: 'p', dir: 'in', boundary: 'x' }])
    const r = flattenAllTemplateInstances([orphan], [], () => undefined, minters())
    expect(r.nodes).toEqual([orphan])
  })
})
