import { describe, it, expect } from 'vitest'
import { createReroute, createEdgeId, type Node, type Edge, type NodeId, type PinId } from '@xenolith/core'
import { pruneOrphanInlineReroutes } from './clipboard-prune.js'

const plainNode = (id: string): Node => ({
  id: id as NodeId,
  type: 'Op',
  position: { x: 0, y: 0 },
  pins: [],
  state: {},
})
const edge = (from: string, to: string): Edge => ({
  id: createEdgeId(),
  from: { node: from as NodeId, pin: `${from}.out` as unknown as PinId },
  to:   { node: to as NodeId,   pin: `${to}.in` as unknown as PinId },
})

describe('pruneOrphanInlineReroutes', () => {
  it('keeps an inline reroute that has both a feed and an outgoing edge', () => {
    const r = createReroute({ x: 0, y: 0 }); r.id = 'r' as NodeId
    const nodes = [plainNode('a'), r, plainNode('b')]
    const edges = [edge('a', 'r'), edge('r', 'b')]
    const out = pruneOrphanInlineReroutes(nodes, edges)
    expect(out.nodes.map((n) => n.id)).toContain('r')
    expect(out.edges).toHaveLength(2)
  })

  it('drops an inline reroute missing its feed (copying only the downstream half)', () => {
    const r = createReroute({ x: 0, y: 0 }); r.id = 'r' as NodeId
    const nodes = [r, plainNode('b')]
    const edges = [edge('r', 'b')] // feed (a→r) was outside the selection
    const out = pruneOrphanInlineReroutes(nodes, edges)
    expect(out.nodes.map((n) => n.id)).not.toContain('r')
    expect(out.edges).toHaveLength(0)
  })

  it('drops an inline reroute missing its outgoing edge', () => {
    const r = createReroute({ x: 0, y: 0 }); r.id = 'r' as NodeId
    const nodes = [plainNode('a'), r]
    const edges = [edge('a', 'r')]
    const out = pruneOrphanInlineReroutes(nodes, edges)
    expect(out.nodes.map((n) => n.id)).not.toContain('r')
    expect(out.edges).toHaveLength(0)
  })

  it('cascades: a chain of reroutes orphaned by a missing feed all drop', () => {
    const r1 = createReroute({ x: 0, y: 0 }); r1.id = 'r1' as NodeId
    const r2 = createReroute({ x: 0, y: 0 }); r2.id = 'r2' as NodeId
    const nodes = [r1, r2, plainNode('b')]
    const edges = [edge('r1', 'r2'), edge('r2', 'b')] // r1 has no feed
    const out = pruneOrphanInlineReroutes(nodes, edges)
    expect(out.nodes.map((n) => n.id)).toEqual(['b'])
    expect(out.edges).toHaveLength(0)
  })

  it('leaves plain nodes and their edges untouched', () => {
    const nodes = [plainNode('a'), plainNode('b')]
    const edges = [edge('a', 'b')]
    const out = pruneOrphanInlineReroutes(nodes, edges)
    expect(out.nodes).toHaveLength(2)
    expect(out.edges).toHaveLength(1)
  })
})
