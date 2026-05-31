import { describe, it, expect } from 'vitest'
import { MACRO_TYPE, isMacro, createMacro, boundaryEdges, macroMembers, macroProxyPins } from './macro.js'
import type { Edge, Node } from './graph.js'
import type { NodeId, EdgeId, PinId } from './ids.js'

const edge = (id: string, fromN: string, toN: string): Edge => ({
  id: id as EdgeId,
  from: { node: fromN as NodeId, pin: `${fromN}.out` as unknown as PinId },
  to:   { node: toN as NodeId,   pin: `${toN}.in` as unknown as PinId },
})

describe('Macro node type', () => {
  it('isMacro recognises the reserved type only', () => {
    expect(isMacro({ type: MACRO_TYPE })).toBe(true)
    expect(isMacro({ type: 'KSampler' })).toBe(false)
  })

  it('createMacro mints a Macro node carrying its members + collapsed flag', () => {
    const m = createMacro({ x: 10, y: 20 }, ['a', 'b'] as NodeId[])
    expect(m.type).toBe(MACRO_TYPE)
    expect(m.position).toEqual({ x: 10, y: 20 })
    expect(macroMembers(m)).toEqual(['a', 'b'])
    expect(m.state['collapsed']).toBe(true)
    expect(m.pins).toEqual([])
  })

  it('macroMembers returns [] for a non-macro or memberless node', () => {
    const n: Node = { id: 'n' as NodeId, type: 'Op', position: { x: 0, y: 0 }, pins: [], state: {} }
    expect(macroMembers(n)).toEqual([])
  })
})

describe('boundaryEdges', () => {
  const members = new Set<NodeId>(['b', 'c'] as NodeId[])

  it('classifies an edge entering the group as an input', () => {
    const { inputs, outputs, internal } = boundaryEdges(members, [edge('e', 'a', 'b')])
    expect(inputs).toHaveLength(1)
    expect(outputs).toHaveLength(0)
    expect(internal).toHaveLength(0)
    expect(inputs[0]!.id).toBe('e')
  })

  it('classifies an edge leaving the group as an output', () => {
    const { inputs, outputs } = boundaryEdges(members, [edge('e', 'c', 'd')])
    expect(outputs).toHaveLength(1)
    expect(inputs).toHaveLength(0)
    expect(outputs[0]!.id).toBe('e')
  })

  it('classifies an edge fully inside the group as internal', () => {
    const { internal, inputs, outputs } = boundaryEdges(members, [edge('e', 'b', 'c')])
    expect(internal).toHaveLength(1)
    expect(inputs).toHaveLength(0)
    expect(outputs).toHaveLength(0)
  })

  it('ignores an edge fully outside the group', () => {
    const { inputs, outputs, internal } = boundaryEdges(members, [edge('e', 'a', 'd')])
    expect(inputs).toHaveLength(0)
    expect(outputs).toHaveLength(0)
    expect(internal).toHaveLength(0)
  })

  it('proxy pins group boundary edges by the member pin they cross at', () => {
    const edges = [
      edge('in1', 'a', 'b'),   // a.out → b.in
      edge('in2', 'x', 'b'),   // x.out → b.in  (same member pin → ONE input proxy, two edges)
      edge('out1', 'c', 'd'),  // c.out → d.in
      edge('out2', 'c', 'e'),  // c.out → e.in  (same member out pin → ONE output proxy, two edges)
      edge('int', 'b', 'c'),
    ]
    const proxies = macroProxyPins(boundaryEdges(members, edges))
    const ins = proxies.filter((p) => p.direction === 'in')
    const outs = proxies.filter((p) => p.direction === 'out')
    expect(ins).toHaveLength(1)
    expect(ins[0]!.memberNode).toBe('b')
    expect(ins[0]!.edges.sort()).toEqual(['in1', 'in2'])
    expect(outs).toHaveLength(1)
    expect(outs[0]!.memberNode).toBe('c')
    expect(outs[0]!.edges.sort()).toEqual(['out1', 'out2'])
  })

  it('partitions a mixed edge set deterministically', () => {
    const edges = [
      edge('in1', 'a', 'b'),
      edge('in2', 'x', 'c'),
      edge('out1', 'b', 'd'),
      edge('int1', 'b', 'c'),
      edge('ext1', 'a', 'd'),
    ]
    const { inputs, outputs, internal } = boundaryEdges(members, edges)
    expect(inputs.map((e) => e.id)).toEqual(['in1', 'in2'])
    expect(outputs.map((e) => e.id)).toEqual(['out1'])
    expect(internal.map((e) => e.id)).toEqual(['int1'])
  })
})

// Below: tests for lifted widget pins on collapse (the "Convert to Macro drops widget pins" bug
// from 2026-05-30 — Template did it right, Macro didn't). When the user converts a group of nodes
// to a Macro, every widget-bound IN-pin of a member that ISN'T fed by an external edge must
// surface on the macro as a proxy IN-pin (so the user can wire to it later, exactly like Template
// exposes its open boundary pins). Without this, the pin is invisible the moment the group is
// collapsed — losing UX parity with Convert to Template.
import { planMacroCollapse, disconnectedWidgetBoundPins } from './macro.js'
import type { Pin } from './graph.js'
import type { WidgetSpec } from './widget.js'

const idGen = (prefix: string): (() => string) => { let n = 0; return () => `${prefix}${n++}` }
const minters = () => ({ pin: idGen('p') as unknown as () => PinId, edge: idGen('e') as unknown as () => EdgeId })

function mkNode(id: string, pins: Array<{ label: string; dir: 'in' | 'out' }>, widgets?: WidgetSpec[]): Node {
  return {
    id: id as NodeId, type: 'X', position: { x: 0, y: 0 },
    state: {},
    pins: pins.map((p) => ({
      id: `${id}:${p.label}` as PinId,
      kind: 'data', direction: p.dir, type: 'float', multiple: p.dir === 'out',
      label: p.label,
    } satisfies Pin)),
    ...(widgets ? { widgets } : {}),
  } as Node
}

describe('disconnectedWidgetBoundPins', () => {
  it('returns every widget-bound IN-pin that has no incoming edge', () => {
    const node = mkNode('n', [{ label: 'in', dir: 'in' }, { label: 'amount', dir: 'in' }, { label: 'out', dir: 'out' }], [
      { id: 'w_amount', type: 'slider', key: 'amount', label: '', min: 0, max: 1, step: 0.01 },     // bound to "amount" pin
    ])
    const result = disconnectedWidgetBoundPins(node, () => false)                  // nothing is connected
    expect(result).toHaveLength(1)
    expect(String(result[0]!.pin)).toBe('n:amount')
  })

  it('skips widget-bound pins that ARE connected (boundary already handles them)', () => {
    const node = mkNode('n', [{ label: 'amount', dir: 'in' }], [
      { id: 'w', type: 'slider', key: 'amount', label: '', min: 0, max: 1, step: 0.01 },
    ])
    const result = disconnectedWidgetBoundPins(node, (pinId) => String(pinId) === 'n:amount')
    expect(result).toHaveLength(0)
  })

  it('skips button widgets (they do not bind a pin)', () => {
    const node = mkNode('n', [{ label: 'in', dir: 'in' }], [
      { id: 'btn', type: 'button', label: 'Go', action: 'foo' } as WidgetSpec,
    ])
    expect(disconnectedWidgetBoundPins(node, () => false)).toHaveLength(0)
  })

  it('skips OUT-direction pins even if widget-bound (display widgets) — macros lift inputs, not outputs', () => {
    const node = mkNode('n', [{ label: 'out', dir: 'out' }], [
      { id: 'shown', type: 'text', key: 'out', visibility: 'always', label: '' },
    ])
    expect(disconnectedWidgetBoundPins(node, () => false)).toHaveLength(0)
  })

  it('returns empty when the node has no widgets', () => {
    const node = mkNode('n', [{ label: 'in', dir: 'in' }])
    expect(disconnectedWidgetBoundPins(node, () => false)).toHaveLength(0)
  })
})

describe('planMacroCollapse — liftPins (G: macro UX parity with Template)', () => {
  // Two members: `transform` with two widget-bound IN-pins (scale, mode), one wire-fed IN (in),
  // and one OUT (out). `validate` with one widget-bound IN (response). All widget pins
  // disconnected. The macro should expose ALL of them as proxy IN-pins on top of the wire-fed
  // boundary, plus the OUT proxy.
  const transform = mkNode('transform', [
    { label: 'in',    dir: 'in' },
    { label: 'scale', dir: 'in' },
    { label: 'mode',  dir: 'in' },
    { label: 'out',   dir: 'out' },
  ], [
    { id: 'w_scale', type: 'slider', key: 'scale', label: '', min: 0, max: 1, step: 0.01 },
    { id: 'w_mode',  type: 'combo',  key: 'mode',  label: '', values: ['fit', 'fill'] },
  ])
  const validate = mkNode('validate', [
    { label: 'in', dir: 'in' },
    { label: 'response', dir: 'in' },
    { label: 'out', dir: 'out' },
  ], [
    { id: 'w_resp', type: 'custom', renderer: 'curve', key: 'response', label: '' } as WidgetSpec,
  ])
  // One real boundary input on transform.in (a.out → transform.in) and one boundary output
  // on validate.out (validate.out → b.in). All widget pins remain free.
  const edges = [
    { id: 'eIn' as EdgeId, from: { node: 'a' as NodeId, pin: 'a:o' as PinId }, to: { node: 'transform' as NodeId, pin: 'transform:in' as PinId } },
    { id: 'eOut' as EdgeId, from: { node: 'validate' as NodeId, pin: 'validate:out' as PinId }, to: { node: 'b' as NodeId, pin: 'b:i' as PinId } },
  ]
  const memberIds = ['transform', 'validate'] as NodeId[]
  const pinInfo = (node: NodeId, pin: PinId): { type: string; label?: string } => {
    const owner = node === 'transform' ? transform : validate
    const p = owner.pins.find((x) => String(x.id) === String(pin))!
    return p.label !== undefined ? { type: String(p.type), label: p.label } : { type: String(p.type) }
  }

  it('without liftPins (default), only wire-fed boundary pins are exposed (current behaviour preserved)', () => {
    const plan = planMacroCollapse('M' as NodeId, memberIds, edges, pinInfo, minters())
    const labels = plan.pins.map((p) => `${p.direction}:${p.label}`).sort()
    expect(labels).toEqual(['in:in', 'out:out'])                                   // only wire-fed boundary
  })

  it('with liftPins, each free widget-bound IN-pin gets its own macro IN proxy', () => {
    const lift = [
      { node: 'transform' as NodeId, pin: 'transform:scale' as PinId },
      { node: 'transform' as NodeId, pin: 'transform:mode'  as PinId },
      { node: 'validate'  as NodeId, pin: 'validate:response' as PinId },
    ]
    const plan = planMacroCollapse('M' as NodeId, memberIds, edges, pinInfo, minters(), { liftPins: lift })
    const labels = plan.pins.map((p) => `${p.direction}:${p.label}`).sort()
    expect(labels).toEqual(['in:in', 'in:mode', 'in:response', 'in:scale', 'out:out'])
    // Lifted pins MUST NOT introduce any disconnect/connect (no external edge exists for them yet).
    expect(plan.disconnect).toHaveLength(2)                                        // unchanged — wire-fed only
    expect(plan.connect).toHaveLength(2)                                           // unchanged — wire-fed only
    // proxyMap gets a NULL-edge sentinel per lifted pin so future external wires can finalise the
    // bridge while collapsed, and expand can drop them cleanly if nothing connected.
    const lifted = plan.proxyMap.filter((r) => r.edgeId === null)
    expect(lifted).toHaveLength(3)
    expect(lifted.map((r) => String(r.memberPin)).sort()).toEqual(['transform:mode', 'transform:scale', 'validate:response'])
  })

  it('lifted pins de-duplicate against wire-fed boundary (a widget pin that IS connected is NOT lifted twice)', () => {
    // transform:scale is also fed by a real external edge — it must appear ONCE (as the boundary
    // proxy), not duplicated by the lift list.
    const wired = [
      ...edges,
      { id: 'eScale' as EdgeId, from: { node: 'x' as NodeId, pin: 'x:o' as PinId }, to: { node: 'transform' as NodeId, pin: 'transform:scale' as PinId } },
    ]
    const lift = [{ node: 'transform' as NodeId, pin: 'transform:scale' as PinId }]
    const plan = planMacroCollapse('M' as NodeId, memberIds, wired, pinInfo, minters(), { liftPins: lift })
    const inPins = plan.pins.filter((p) => p.direction === 'in' && p.label === 'scale')
    expect(inPins).toHaveLength(1)                                                 // de-duped
  })
})
