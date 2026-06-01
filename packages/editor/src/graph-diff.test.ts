import { describe, it, expect } from 'vitest'
import { diffGraphs, type DiffSnapshot } from './graph-diff.js'

const node = (id: string, x: number, state: Record<string, unknown> = {}): DiffSnapshot['nodes'][number] => ({
  id, type: 'T', position: { x, y: 0 }, state,
})
const edge = (id: string, from: string, to: string): DiffSnapshot['edges'][number] => ({
  id, from: { node: from, pin: 'p' }, to: { node: to, pin: 'p' },
})

describe('diffGraphs', () => {
  it('marks added/removed nodes', () => {
    const a: DiffSnapshot = { nodes: [node('a', 0), node('b', 100)], edges: [] }
    const b: DiffSnapshot = { nodes: [node('a', 0), node('c', 200)], edges: [] }
    const d = diffGraphs(a, b)
    expect([...d.addedNodes]).toEqual(['c'])
    expect([...d.removedNodes]).toEqual(['b'])
    expect(d.modifiedNodes.size).toBe(0)
  })

  it('marks modified nodes when state changes', () => {
    const a: DiffSnapshot = { nodes: [node('a', 0, { v: 1 })], edges: [] }
    const b: DiffSnapshot = { nodes: [node('a', 0, { v: 2 })], edges: [] }
    expect([...diffGraphs(a, b).modifiedNodes]).toEqual(['a'])
  })

  it('does NOT mark position-only changes by default (cosmetic, not structural)', () => {
    const a: DiffSnapshot = { nodes: [node('a', 0)], edges: [] }
    const b: DiffSnapshot = { nodes: [node('a', 50)], edges: [] }
    expect(diffGraphs(a, b).modifiedNodes.size).toBe(0)
  })

  it('opt-in: comparePosition=true marks moves as modifications', () => {
    const a: DiffSnapshot = { nodes: [node('a', 0)], edges: [] }
    const b: DiffSnapshot = { nodes: [node('a', 50)], edges: [] }
    expect([...diffGraphs(a, b, { comparePosition: true }).modifiedNodes]).toEqual(['a'])
  })

  it('does not mark unchanged nodes', () => {
    const a: DiffSnapshot = { nodes: [node('a', 0, { v: 1 })], edges: [] }
    expect(diffGraphs(a, a).modifiedNodes.size).toBe(0)
  })

  it('diffs edges by id', () => {
    const a: DiffSnapshot = { nodes: [node('x', 0), node('y', 0)], edges: [edge('e1', 'x', 'y')] }
    const b: DiffSnapshot = { nodes: [node('x', 0), node('y', 0)], edges: [edge('e2', 'x', 'y')] }
    const d = diffGraphs(a, b)
    expect([...d.addedEdges]).toEqual(['e2'])
    expect([...d.removedEdges]).toEqual(['e1'])
  })
})
