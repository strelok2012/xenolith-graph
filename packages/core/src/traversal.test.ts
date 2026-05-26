import { describe, it, expect } from 'vitest'
import { Graph } from './graph.js'
import type { Node, Edge } from './graph.js'
import { createNodeId, createEdgeId, createPinId } from './ids.js'
import { incomers, outgoers, connectedEdges, roots, leaves, topoOrder, wouldCreateCycle, reachableFrom } from './traversal.js'

function node(): Node {
  const out = createPinId(), inp = createPinId()
  return { id: createNodeId(), type: 'T', position: { x: 0, y: 0 }, state: {},
    pins: [{ id: out, kind: 'data', direction: 'out', type: 'any', multiple: false }, { id: inp, kind: 'data', direction: 'in', type: 'any', multiple: false }] }
}
function edge(from: Node, to: Node): Edge {
  return { id: createEdgeId(), from: { node: from.id, pin: from.pins[0]!.id }, to: { node: to.id, pin: to.pins[1]!.id } }
}

/** Diamond: A→B, A→C, B→D, C→D. */
function diamond() {
  const g = new Graph()
  const a = node(), b = node(), c = node(), d = node()
  for (const n of [a, b, c, d]) g._addNode(n)
  g._addEdge(edge(a, b)); g._addEdge(edge(a, c)); g._addEdge(edge(b, d)); g._addEdge(edge(c, d))
  return { g, a, b, c, d }
}

describe('graph traversal', () => {
  it('incomers / outgoers return neighbour nodes', () => {
    const { g, a, b, c, d } = diamond()
    expect(outgoers(g, a.id).map((n) => n.id).sort()).toEqual([b.id, c.id].sort())
    expect(incomers(g, d.id).map((n) => n.id).sort()).toEqual([b.id, c.id].sort())
    expect(incomers(g, a.id)).toEqual([])
    expect(outgoers(g, d.id)).toEqual([])
  })

  it('connectedEdges respects direction', () => {
    const { g, a, d } = diamond()
    expect(connectedEdges(g, a.id, 'out')).toHaveLength(2)
    expect(connectedEdges(g, a.id, 'in')).toHaveLength(0)
    expect(connectedEdges(g, d.id, 'in')).toHaveLength(2)
    expect(connectedEdges(g, d.id)).toHaveLength(2)
  })

  it('roots / leaves', () => {
    const { g, a, d } = diamond()
    expect(roots(g).map((n) => n.id)).toEqual([a.id])
    expect(leaves(g).map((n) => n.id)).toEqual([d.id])
  })

  it('topoOrder respects dependencies (sources before targets)', () => {
    const { g, a, b, c, d } = diamond()
    const { order, cyclic } = topoOrder(g)
    expect(cyclic).toEqual([])
    expect(order).toHaveLength(4)
    const pos = (id: typeof a.id): number => order.indexOf(id)
    expect(pos(a.id)).toBeLessThan(pos(b.id))
    expect(pos(a.id)).toBeLessThan(pos(c.id))
    expect(pos(b.id)).toBeLessThan(pos(d.id))
    expect(pos(c.id)).toBeLessThan(pos(d.id))
  })

  it('wouldCreateCycle detects back-edges and self-loops', () => {
    const { g, a, b, d } = diamond()
    expect(wouldCreateCycle(g, d.id, a.id)).toBe(true)   // D→A closes A→B→D→A
    expect(wouldCreateCycle(g, a.id, d.id)).toBe(false)  // A→D stays acyclic
    expect(wouldCreateCycle(g, b.id, a.id)).toBe(true)   // B→A closes A→B→A
    expect(wouldCreateCycle(g, a.id, a.id)).toBe(true)   // self-loop
  })

  it('topoOrder reports nodes stuck in a cycle', () => {
    const g = new Graph()
    const a = node(), b = node()
    g._addNode(a); g._addNode(b)
    g._addEdge(edge(a, b)); g._addEdge(edge(b, a))
    const { order, cyclic } = topoOrder(g)
    expect(order).toEqual([])
    expect(cyclic.sort()).toEqual([a.id, b.id].sort())
  })
})

describe('reachableFrom (active downstream chain)', () => {
  it('includes the start and every downstream node', () => {
    const { g, a, b, c, d } = diamond()
    expect([...reachableFrom(g, a.id)].sort()).toEqual([a.id, b.id, c.id, d.id].sort())
  })

  it('stops at a node with no outgoing edges', () => {
    const { g, d } = diamond()
    expect([...reachableFrom(g, d.id)]).toEqual([d.id])
  })

  // The audio/LLM showcase bug: cutting an edge mid-chain must drop everything past the break from
  // the active set (so downstream nodes stop playing / stop lighting up).
  it('drops nodes past a removed edge', () => {
    const g = new Graph()
    const osc = node(), filter = node(), gain = node(), out = node()
    for (const n of [osc, filter, gain, out]) g._addNode(n)
    const e1 = edge(osc, filter), e2 = edge(filter, gain), e3 = edge(gain, out)
    g._addEdge(e1); g._addEdge(e2); g._addEdge(e3)
    expect([...reachableFrom(g, osc.id)].sort()).toEqual([osc.id, filter.id, gain.id, out.id].sort())
    // Break Filter → Gain: gain and out are no longer reachable from the oscillator.
    g._removeEdge(e2.id)
    expect([...reachableFrom(g, osc.id)].sort()).toEqual([osc.id, filter.id].sort())
  })

  it('does not include a deleted node', () => {
    const g = new Graph()
    const a = node(), b = node()
    g._addNode(a); g._addNode(b)
    const e1 = edge(a, b)
    g._addEdge(e1)
    g._removeEdge(e1.id); g._removeNode(b.id)
    expect([...reachableFrom(g, a.id)]).toEqual([a.id])
  })

  it('terminates on a cyclic graph', () => {
    const g = new Graph()
    const a = node(), b = node()
    g._addNode(a); g._addNode(b)
    g._addEdge(edge(a, b)); g._addEdge(edge(b, a))
    expect([...reachableFrom(g, a.id)].sort()).toEqual([a.id, b.id].sort())
  })
})
