import { describe, it, expect } from 'vitest'
import { createSim, type Agent, type GoodieSpec } from './fairqueue.js'
import { simToGraph } from './sim-to-graph.js'

const agent = (id: string, priority: number, subscriptions: string[] = []): Agent => ({
  id,
  priority,
  subscriptions,
})
const goodie = (type: string, cost: number): GoodieSpec => ({ type, cost })

describe('simToGraph', () => {
  it('produces a xenolith.v1 graph', () => {
    const g = simToGraph(createSim([], []))
    expect(g.version).toBe('xenolith.v1')
  })

  it('emits one node per goodie type and one per agent', () => {
    const g = simToGraph(
      createSim([agent('a', 1, ['gift']), agent('b', 1, [])], [goodie('gift', 2), goodie('coin', 1)]),
    )
    const types = g.nodes.map((n) => n.type).sort()
    expect(types).toEqual(['Agent', 'Agent', 'Goodie', 'Goodie'])
    expect(g.nodes.filter((n) => n.type === 'Agent').map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('carries the agent priority in state and a custom priority-bar widget', () => {
    const g = simToGraph(createSim([agent('a', 7.5, [])], []))
    const node = g.nodes.find((n) => n.id === 'a')!
    expect(node.state).toMatchObject({ priority: 7.5 })
    expect(node.widgets).toEqual([
      expect.objectContaining({ type: 'custom', renderer: 'priorityBar', key: 'priority' }),
    ])
  })

  it('turns a subscription into an edge from the goodie out-pin to the agent in-pin', () => {
    const g = simToGraph(createSim([agent('a', 1, ['gift'])], [goodie('gift', 2)]))
    expect(g.edges).toHaveLength(1)
    const e = g.edges[0]!
    expect(e.from.node).toBe('goodie:gift')
    expect(e.to.node).toBe('a')
    const goodieNode = g.nodes.find((n) => n.id === 'goodie:gift')!
    const agentNode = g.nodes.find((n) => n.id === 'a')!
    expect(goodieNode.pins.some((p) => p.id === e.from.pin && p.direction === 'out')).toBe(true)
    expect(agentNode.pins.some((p) => p.id === e.to.pin && p.direction === 'in')).toBe(true)
    expect(e.opts?.sourceType).toBe('gift') // type-colour the wire by goodie
  })

  it('ignores subscriptions to goodie types that do not exist', () => {
    const g = simToGraph(createSim([agent('a', 1, ['ghost'])], [goodie('gift', 2)]))
    expect(g.edges).toEqual([])
  })

  it('lays goodies left of agents (distinct columns)', () => {
    const g = simToGraph(createSim([agent('a', 1, [])], [goodie('gift', 2)]))
    const goodieX = g.nodes.find((n) => n.type === 'Goodie')!.position.x
    const agentX = g.nodes.find((n) => n.type === 'Agent')!.position.x
    expect(goodieX).toBeLessThan(agentX)
  })

  it('spaces agent nodes by agentRowGap', () => {
    const g = simToGraph(createSim([agent('a', 1), agent('b', 1)], []), { agentRowGap: 200 })
    const ys = g.nodes.filter((n) => n.type === 'Agent').map((n) => n.position.y)
    expect(ys[1]! - ys[0]!).toBe(200)
  })

  it('animates wires by default and can switch animation off', () => {
    const sim = createSim([agent('a', 1, ['gift'])], [goodie('gift', 2)])
    expect(simToGraph(sim).edges[0]!.opts?.animated).toBe(true)
    expect(simToGraph(sim, { animated: false }).edges[0]!.opts?.animated).toBe(false)
  })

  it('is deterministic for the same state', () => {
    const sim = createSim([agent('a', 1, ['gift']), agent('b', 2, ['gift'])], [goodie('gift', 2)])
    expect(simToGraph(sim)).toEqual(simToGraph(sim))
  })
})
