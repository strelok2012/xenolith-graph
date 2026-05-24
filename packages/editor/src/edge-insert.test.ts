import { describe, it, expect } from 'vitest'
import type { NodeSchema } from '@xenolith/core'
import { spliceCompatible } from './edge-insert.js'

const schema = (pins: NodeSchema['pins']): NodeSchema => ({ type: 'X', title: 'X', pins })

describe('spliceCompatible', () => {
  it('accepts a node that can receive the source type and emit the target type', () => {
    const s = schema([
      { kind: 'data', direction: 'in',  type: 'object' },
      { kind: 'data', direction: 'out', type: 'object' },
    ])
    expect(spliceCompatible(s, 'object', 'object')).toBe(true)
  })

  it('accepts via an "any" pin on either side', () => {
    const s = schema([
      { kind: 'data', direction: 'in',  type: 'any' },
      { kind: 'data', direction: 'out', type: 'any' },
    ])
    expect(spliceCompatible(s, 'float', 'string')).toBe(true)
  })

  it('rejects when the node has no compatible input', () => {
    const s = schema([
      { kind: 'data', direction: 'in',  type: 'string' },
      { kind: 'data', direction: 'out', type: 'object' },
    ])
    expect(spliceCompatible(s, 'object', 'object')).toBe(false)
  })

  it('rejects when the node has no compatible output', () => {
    const s = schema([
      { kind: 'data', direction: 'in',  type: 'object' },
      { kind: 'data', direction: 'out', type: 'string' },
    ])
    expect(spliceCompatible(s, 'object', 'object')).toBe(false)
  })

  it('rejects exec pins for a data wire', () => {
    const s = schema([
      { kind: 'exec', direction: 'in',  type: 'exec' },
      { kind: 'exec', direction: 'out', type: 'exec' },
    ])
    expect(spliceCompatible(s, 'object', 'object')).toBe(false)
  })
})

import type { Edge, NodeId, EdgeId, PinId } from '@xenolith/core'
import { danglingRerouteRemovalPlan } from './edge-insert.js'

const nid = (s: string): NodeId => s as unknown as NodeId
const e = (id: string, fromNode: string, toNode: string): Edge => ({
  id: id as unknown as EdgeId,
  from: { node: nid(fromNode), pin: `${fromNode}:o` as unknown as PinId },
  to:   { node: nid(toNode),   pin: `${toNode}:i` as unknown as PinId },
})

describe('danglingRerouteRemovalPlan', () => {
  const isReroute = (id: NodeId) => String(id).startsWith('R')

  it('plain edge between real nodes removes only that edge', () => {
    const edges = [e('e1', 'A', 'B')]
    const plan = danglingRerouteRemovalPlan(edges, isReroute, edges[0]!.id)
    expect([...plan.edgeIds]).toEqual([edges[0]!.id])
    expect(plan.rerouteIds).toEqual([])
  })

  it('deleting the only feed of a reroute removes the reroute and its remaining edge', () => {
    // A -e1-> R -e2-> B ; delete e1 → R loses its input → dangling → R and e2 also go
    const edges = [e('e1', 'A', 'R'), e('e2', 'R', 'B')]
    const plan = danglingRerouteRemovalPlan(edges, isReroute, edges[0]!.id)
    expect(plan.rerouteIds).toEqual([nid('R')])
    expect(plan.edgeIds.has(edges[0]!.id)).toBe(true)
    expect(plan.edgeIds.has(edges[1]!.id)).toBe(true)
  })

  it('cascades through a chain of reroutes but never touches real nodes', () => {
    // A -e1-> R1 -e2-> R2 -e3-> B ; delete e1 → whole reroute chain collapses, A & B remain
    const edges = [e('e1', 'A', 'R1'), e('e2', 'R1', 'R2'), e('e3', 'R2', 'B')]
    const plan = danglingRerouteRemovalPlan(edges, isReroute, edges[0]!.id)
    expect(plan.rerouteIds.sort()).toEqual([nid('R1'), nid('R2')])
    expect(plan.edgeIds.size).toBe(3)
  })

  it('keeps a reroute that still has an input and at least one output (fan-out survives)', () => {
    // A -e1-> R ; R -e2-> B ; R -e3-> C. Delete e2 → R still has e1 (in) and e3 (out) → survives
    const edges = [e('e1', 'A', 'R'), e('e2', 'R', 'B'), e('e3', 'R', 'C')]
    const plan = danglingRerouteRemovalPlan(edges, isReroute, edges[1]!.id)
    expect(plan.rerouteIds).toEqual([])
    expect([...plan.edgeIds]).toEqual([edges[1]!.id])
  })

  it('never removes a real (non-reroute) node', () => {
    const edges = [e('e1', 'A', 'B')]
    const plan = danglingRerouteRemovalPlan(edges, () => false, edges[0]!.id)
    expect(plan.rerouteIds).toEqual([])
  })
})
