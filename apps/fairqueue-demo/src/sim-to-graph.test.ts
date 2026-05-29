import { describe, it, expect } from 'vitest'
import { createSim, type Agent, type GoodieSpec } from './fairqueue.js'
import { simToGraph } from './sim-to-graph.js'

const agent = (id: string, priority: number, subscriptions: string[] = [], salary = 0): Agent => ({
  id,
  priority,
  salary,
  subscriptions,
})
const goodie = (type: string, cost: number, rate = 0): GoodieSpec => ({ type, cost, rate })

describe('simToGraph', () => {
  it('produces a xenolith.v1 graph', () => {
    const g = simToGraph(createSim([], []))
    expect(g.version).toBe('xenolith.v1')
  })

  it('declares the domain category palette in the graph data', () => {
    const g = simToGraph(createSim([], []))
    expect(g.categories).toMatchObject({
      agent: { color: expect.any(String) },
      goodie: { color: expect.any(String) },
      warehouse: { gradient: { start: expect.any(String), end: expect.any(String) } },
    })
  })

  it('emits one node per goodie type, one per agent, a Warehouse and a State', () => {
    const g = simToGraph(
      createSim([agent('a', 1, ['gift']), agent('b', 1, [])], [goodie('gift', 2), goodie('coin', 1)]),
    )
    const types = g.nodes.map((n) => n.type).sort()
    expect(types).toEqual(['Agent', 'Agent', 'Goodie', 'Goodie', 'State', 'Warehouse'])
    expect(g.nodes.filter((n) => n.type === 'Agent').map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('adds a Government (State) node holding the tax α, right of the agents, each agent wired to it', () => {
    const g = simToGraph(createSim([agent('a', 0, [], 0.5)], [], { taxAlpha: 0.2 }))
    const st = g.nodes.find((n) => n.type === 'State')!
    expect(st.id).toBe('state')
    expect(st.state).toMatchObject({ taxAlpha: 0.2 })
    expect(st.widgets?.[0]).toMatchObject({ type: 'slider', key: 'taxAlpha' })
    const agentX = g.nodes.find((n) => n.type === 'Agent')!.position.x
    expect(st.position.x).toBeGreaterThan(agentX) // to the right of the agents
    const taxEdge = g.edges.find((e) => e.to.node === 'state')!
    expect(taxEdge.from.node).toBe('a')
  })

  it('always includes a Warehouse node with a warehouse stock widget, placed top-centre', () => {
    const g = simToGraph(createSim([], []), { columnGap: 360, agentRowGap: 170 })
    const wh = g.nodes.find((n) => n.type === 'Warehouse')!
    expect(wh.id).toBe('warehouse')
    expect(wh.widgets).toEqual([
      expect.objectContaining({ type: 'custom', renderer: 'warehouse', key: 'stock' }),
    ])
    expect(wh.position.y).toBeLessThan(0) // above the two columns
    expect(wh.position.x).toBeGreaterThan(0)
    expect(wh.position.x).toBeLessThan(360) // between goodie (x=0) and agent (x=columnGap) columns
  })

  it('gives an agent priority + its own salary in state, a priority-bar and a salary slider', () => {
    const g = simToGraph(createSim([agent('a', 7.5, [], 0.4)], []))
    const node = g.nodes.find((n) => n.id === 'a')!
    expect(node.state).toMatchObject({ priority: 7.5, salary: 0.4 })
    expect(node.widgets).toEqual([
      expect.objectContaining({ type: 'custom', renderer: 'priorityBar', key: 'priority' }),
      expect.objectContaining({ type: 'slider', key: 'salary' }),
    ])
  })

  it('gives a goodie its own cost + spawn rate + gtype in state, with cost and rate widgets', () => {
    const g = simToGraph(createSim([], [goodie('gift', 3, 0.2)]))
    const node = g.nodes.find((n) => n.id === 'goodie:gift')!
    expect(node.state).toMatchObject({ cost: 3, rate: 0.2, gtype: 'gift' })
    expect(node.widgets?.map((w) => w.key)).toEqual(['cost', 'rate'])
  })

  it('uses the shared "goodie" pin type on both ends so connections type-check', () => {
    const g = simToGraph(createSim([agent('a', 1, [])], [goodie('gift', 2)]))
    const goodieOut = g.nodes.find((n) => n.id === 'goodie:gift')!.pins[0]!
    const agentIn = g.nodes.find((n) => n.id === 'a')!.pins[0]!
    expect(goodieOut.type).toBe(agentIn.type) // both 'goodie' → canConnect passes
  })

  it('turns a subscription into an edge from the goodie out-pin to the agent in-pin', () => {
    const g = simToGraph(createSim([agent('a', 1, ['gift'])], [goodie('gift', 2)]))
    const e = g.edges.find((x) => x.to.node === 'a')!
    expect(e.from.node).toBe('goodie:gift')
    const goodieNode = g.nodes.find((n) => n.id === 'goodie:gift')!
    const agentNode = g.nodes.find((n) => n.id === 'a')!
    expect(goodieNode.pins.some((p) => p.id === e.from.pin && p.direction === 'out')).toBe(true)
    expect(agentNode.pins.some((p) => p.id === e.to.pin && p.direction === 'in')).toBe(true)
    expect(e.opts?.sourceType).toBe('gift') // type-colour the wire by goodie
  })

  it('wires every goodie to the Warehouse as a static overflow edge', () => {
    const g = simToGraph(createSim([], [goodie('gift', 2), goodie('coin', 1)]))
    const whEdges = g.edges.filter((e) => e.to.node === 'warehouse')
    expect(whEdges.map((e) => e.from.node).sort()).toEqual(['goodie:coin', 'goodie:gift'])
    expect(whEdges.every((e) => e.opts?.animated === false)).toBe(true)
  })

  it('creates no subscription (agent-bound) edge for a non-existent goodie type', () => {
    const g = simToGraph(createSim([agent('a', 1, ['ghost'])], [goodie('gift', 2)]))
    expect(g.edges.filter((e) => e.to.node === 'a')).toEqual([])
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

  it('animates the subscription wire by default and can switch it off', () => {
    const sim = createSim([agent('a', 1, ['gift'])], [goodie('gift', 2)])
    const sub = (s = sim, o = {}) => simToGraph(s, o).edges.find((e) => e.to.node === 'a')!
    expect(sub().opts?.animated).toBe(true)
    expect(sub(sim, { animated: false }).opts?.animated).toBe(false)
  })

  it('is deterministic for the same state', () => {
    const sim = createSim([agent('a', 1, ['gift']), agent('b', 2, ['gift'])], [goodie('gift', 2)])
    expect(simToGraph(sim)).toEqual(simToGraph(sim))
  })
})
