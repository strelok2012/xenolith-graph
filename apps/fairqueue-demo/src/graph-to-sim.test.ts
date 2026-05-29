import { describe, it, expect } from 'vitest'
import { graphToSim, goodieTypeOf, type NodeLike, type EdgeLike } from './graph-to-sim.js'

const goodieNode = (type: string, cost: number, rate: number): NodeLike => ({
  id: `goodie:${type}`,
  type: 'Goodie',
  state: { cost, rate },
})
const agentNode = (id: string, priority: number, salary: number): NodeLike => ({
  id,
  type: 'Agent',
  state: { priority, salary },
})
const edge = (fromNode: string, toNode: string): EdgeLike => ({ from: { node: fromNode }, to: { node: toNode } })

describe('goodieTypeOf', () => {
  it('strips the goodie: prefix', () => {
    expect(goodieTypeOf({ id: 'goodie:gift', type: 'Goodie', state: {} })).toBe('gift')
  })
  it('uses the raw id for palette-added goodies (no prefix) — its own unique type', () => {
    expect(goodieTypeOf({ id: 'uuid-abc', type: 'Goodie', state: {} })).toBe('uuid-abc')
  })
  it('prefers state.gtype (short friendly type) over the id', () => {
    expect(goodieTypeOf({ id: 'uuid-abc', type: 'Goodie', state: { gtype: 'good-3' } })).toBe('good-3')
  })
})

describe('graphToSim', () => {
  it('reads agents and goodies with their per-node state', () => {
    const sim = graphToSim([agentNode('a', 1.5, 0.4), goodieNode('gift', 3, 0.2)], [])
    expect(sim.agents).toEqual([{ id: 'a', priority: 1.5, salary: 0.4, subscriptions: [] }])
    expect(sim.goodies['gift']).toEqual({ type: 'gift', cost: 3, rate: 0.2 })
  })

  it('derives subscriptions from Goodie→Agent edges', () => {
    const sim = graphToSim(
      [agentNode('a', 0, 0.5), goodieNode('gift', 1, 0.1), goodieNode('coin', 1, 0.1)],
      [edge('goodie:gift', 'a'), edge('goodie:coin', 'a')],
    )
    expect(sim.agents[0]!.subscriptions.sort()).toEqual(['coin', 'gift'])
  })

  it('ignores non-subscription edges (e.g. to a Warehouse) and dedupes', () => {
    const sim = graphToSim(
      [agentNode('a', 0, 0.5), goodieNode('gift', 1, 0.1), { id: 'warehouse', type: 'Warehouse', state: {} }],
      [edge('goodie:gift', 'a'), edge('goodie:gift', 'a'), edge('goodie:gift', 'warehouse')],
    )
    expect(sim.agents[0]!.subscriptions).toEqual(['gift']) // deduped; warehouse edge ignored
  })

  it('defaults missing state numbers to 0 and passes params through', () => {
    const sim = graphToSim([{ id: 'a', type: 'Agent', state: {} }], [], { taxAlpha: 0.3 })
    expect(sim.agents[0]).toEqual({ id: 'a', priority: 0, salary: 0, subscriptions: [] })
    expect(sim.params.taxAlpha).toBe(0.3)
  })

  it('reads the tax α from the State node, overriding the passed param', () => {
    const nodes: NodeLike[] = [
      { id: 'a', type: 'Agent', state: {} },
      { id: 'state', type: 'State', state: { taxAlpha: 0.42 } },
    ]
    expect(graphToSim(nodes, [], { taxAlpha: 0.1 }).params.taxAlpha).toBe(0.42)
  })
})
