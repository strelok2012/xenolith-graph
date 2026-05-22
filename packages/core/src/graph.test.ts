import { describe, it, expect } from 'vitest'
import { Graph } from './graph.js'
import type { Node, Edge } from './graph.js'
import { createNodeId, createEdgeId, createPinId } from './ids.js'

function makeNode(): Node {
  const id = createNodeId()
  return {
    id,
    type: 'Test',
    position: { x: 0, y: 0 },
    state: {},
    pins: [
      { id: createPinId(), kind: 'data', direction: 'in',  type: 'float', multiple: false },
      { id: createPinId(), kind: 'data', direction: 'out', type: 'float', multiple: true  },
    ],
  }
}

function makeEdge(fromNode: Node, toNode: Node): Edge {
  return {
    id: createEdgeId(),
    from: { node: fromNode.id, pin: fromNode.pins[1]!.id },
    to:   { node: toNode.id,   pin: toNode.pins[0]!.id },
  }
}

describe('Graph — construction', () => {
  it('starts empty', () => {
    const g = new Graph()
    expect(g.nodeCount).toBe(0)
    expect(g.edgeCount).toBe(0)
    expect(g.version).toBe(0)
  })
})

describe('Graph — nodes', () => {
  it('_addNode stores the node and is visible via getNode / hasNode / nodeCount', () => {
    const g = new Graph()
    const n = makeNode()
    g._addNode(n)
    expect(g.nodeCount).toBe(1)
    expect(g.hasNode(n.id)).toBe(true)
    expect(g.getNode(n.id)).toEqual(n)
  })

  it('getNode returns undefined for an unknown id', () => {
    const g = new Graph()
    expect(g.getNode(createNodeId())).toBeUndefined()
    expect(g.hasNode(createNodeId())).toBe(false)
  })

  it('nodes() iterates in insertion order', () => {
    const g = new Graph()
    const a = makeNode()
    const b = makeNode()
    const c = makeNode()
    g._addNode(a)
    g._addNode(b)
    g._addNode(c)
    expect([...g.nodes()].map((n) => n.id)).toEqual([a.id, b.id, c.id])
  })

  it('_addNode with a duplicate id throws', () => {
    const g = new Graph()
    const n = makeNode()
    g._addNode(n)
    expect(() => g._addNode(n)).toThrow(/duplicate/i)
  })

  it('_removeNode removes the node, returns it, and is no longer visible', () => {
    const g = new Graph()
    const n = makeNode()
    g._addNode(n)
    const removed = g._removeNode(n.id)
    expect(removed).toEqual(n)
    expect(g.hasNode(n.id)).toBe(false)
    expect(g.nodeCount).toBe(0)
  })

  it('_removeNode returns undefined for an unknown id and does not throw', () => {
    const g = new Graph()
    expect(g._removeNode(createNodeId())).toBeUndefined()
  })

  it('does not cascade-remove attached edges (cascade is a command-level concern)', () => {
    const g = new Graph()
    const a = makeNode()
    const b = makeNode()
    g._addNode(a)
    g._addNode(b)
    const e = makeEdge(a, b)
    g._addEdge(e)
    g._removeNode(a.id)
    expect(g.edgeCount).toBe(1)
    expect(g.hasEdge(e.id)).toBe(true)
  })
})

describe('Graph — edges', () => {
  it('_addEdge stores the edge', () => {
    const g = new Graph()
    const a = makeNode()
    const b = makeNode()
    g._addNode(a)
    g._addNode(b)
    const e = makeEdge(a, b)
    g._addEdge(e)
    expect(g.edgeCount).toBe(1)
    expect(g.hasEdge(e.id)).toBe(true)
    expect(g.getEdge(e.id)).toEqual(e)
  })

  it('edges() iterates in insertion order', () => {
    const g = new Graph()
    const a = makeNode()
    const b = makeNode()
    g._addNode(a)
    g._addNode(b)
    const e1 = makeEdge(a, b)
    const e2 = makeEdge(a, b)
    g._addEdge(e1)
    g._addEdge(e2)
    expect([...g.edges()].map((x) => x.id)).toEqual([e1.id, e2.id])
  })

  it('_addEdge with a duplicate id throws', () => {
    const g = new Graph()
    const a = makeNode()
    const b = makeNode()
    g._addNode(a)
    g._addNode(b)
    const e = makeEdge(a, b)
    g._addEdge(e)
    expect(() => g._addEdge(e)).toThrow(/duplicate/i)
  })

  it('_removeEdge returns the edge and removes it', () => {
    const g = new Graph()
    const a = makeNode()
    const b = makeNode()
    g._addNode(a)
    g._addNode(b)
    const e = makeEdge(a, b)
    g._addEdge(e)
    const removed = g._removeEdge(e.id)
    expect(removed).toEqual(e)
    expect(g.hasEdge(e.id)).toBe(false)
  })

  it('_removeEdge returns undefined for an unknown id', () => {
    const g = new Graph()
    expect(g._removeEdge(createEdgeId())).toBeUndefined()
  })
})

describe('Graph — version counter', () => {
  it('increments on every mutation', () => {
    const g = new Graph()
    const a = makeNode()
    const b = makeNode()
    expect(g.version).toBe(0)
    g._addNode(a)
    expect(g.version).toBe(1)
    g._addNode(b)
    expect(g.version).toBe(2)
    const e = makeEdge(a, b)
    g._addEdge(e)
    expect(g.version).toBe(3)
    g._removeEdge(e.id)
    expect(g.version).toBe(4)
    g._removeNode(a.id)
    expect(g.version).toBe(5)
  })

  it('does not increment on a no-op removal', () => {
    const g = new Graph()
    g._removeNode(createNodeId())
    g._removeEdge(createEdgeId())
    expect(g.version).toBe(0)
  })
})

describe('Graph — read isolation', () => {
  it('nodes() returns an iterator, not the underlying Map', () => {
    const g = new Graph()
    const n = makeNode()
    g._addNode(n)
    const iter = g.nodes()
    expect(iter).not.toBeInstanceOf(Map)
    expect(typeof iter[Symbol.iterator]).toBe('function')
    expect([...iter]).toHaveLength(1)
  })

  it('edges() returns an iterator, not the underlying Map', () => {
    const g = new Graph()
    const a = makeNode()
    const b = makeNode()
    g._addNode(a)
    g._addNode(b)
    g._addEdge(makeEdge(a, b))
    const iter = g.edges()
    expect(iter).not.toBeInstanceOf(Map)
    expect(typeof iter[Symbol.iterator]).toBe('function')
  })
})
