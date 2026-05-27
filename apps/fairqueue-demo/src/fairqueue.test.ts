import { describe, it, expect } from 'vitest'
import { createSim, step, type Agent, type GoodieSpec } from './fairqueue.js'

const agent = (id: string, priority: number, subscriptions: string[] = []): Agent => ({
  id,
  priority,
  subscriptions,
})
const goodie = (type: string, cost: number): GoodieSpec => ({ type, cost })

const byId = (agents: Agent[]) => Object.fromEntries(agents.map((a) => [a.id, a.priority]))

describe('salary', () => {
  it('adds salary to every agent each step (tax off isolates it)', () => {
    const sim = createSim([agent('a', 5), agent('b', 2)], [], { salary: 3, taxAlpha: 0 })
    const { state } = step(sim, [])
    expect(byId(state.agents)).toEqual({ a: 8, b: 5 })
  })
  it('advances the step counter', () => {
    const sim = createSim([agent('a', 0)], [], { taxAlpha: 0 })
    expect(step(sim, []).state.step).toBe(1)
  })
})

describe('goodie distribution', () => {
  it('awards a goodie to the highest-priority subscriber and subtracts its cost', () => {
    const sim = createSim(
      [agent('hi', 10, ['gift']), agent('lo', 1, ['gift'])],
      [goodie('gift', 4)],
      { salary: 0, taxAlpha: 0 },
    )
    const { state, awards } = step(sim, ['gift'])
    expect(awards).toEqual([{ type: 'gift', to: 'hi', cost: 4 }])
    expect(byId(state.agents)).toEqual({ hi: 6, lo: 1 })
  })

  it('only subscribers are eligible, even if a non-subscriber outranks them', () => {
    const sim = createSim(
      [agent('rich', 100, []), agent('poor', 1, ['gift'])],
      [goodie('gift', 1)],
      { salary: 0, taxAlpha: 0 },
    )
    const { awards } = step(sim, ['gift'])
    expect(awards).toEqual([{ type: 'gift', to: 'poor', cost: 1 }])
  })

  it('two units in one step spread to distinct recipients (award lowers priority mid-step)', () => {
    const sim = createSim(
      [agent('a', 10, ['gift']), agent('b', 9, ['gift'])],
      [goodie('gift', 5)],
      { salary: 0, taxAlpha: 0 },
    )
    const { awards } = step(sim, ['gift', 'gift'])
    expect(awards.map((x) => x.to)).toEqual(['a', 'b'])
  })

  it('ignores arrivals of unknown goodie types', () => {
    const sim = createSim([agent('a', 1, ['known'])], [goodie('known', 1)], { taxAlpha: 0 })
    expect(step(sim, ['unknown']).awards).toEqual([])
  })
})

describe('log tax', () => {
  it('pulls an above-mean agent down and a below-mean agent up', () => {
    const sim = createSim([agent('hi', 10), agent('lo', 1)], [], { salary: 0, taxAlpha: 0.5 })
    const { state } = step(sim, [])
    const p = byId(state.agents)
    expect(p['hi']).toBeLessThan(10)
    expect(p['lo']).toBeGreaterThan(1)
    expect(p['hi']).toBeGreaterThan(p['lo']!) // ordering preserved
  })

  it('preserves the geometric mean of priorities', () => {
    const sim = createSim([agent('hi', 8), agent('lo', 2)], [], { salary: 0, taxAlpha: 0.3 })
    const { state } = step(sim, [])
    const p = byId(state.agents)
    const before = Math.sqrt(8 * 2)
    const after = Math.sqrt(p['hi']! * p['lo']!)
    expect(after).toBeCloseTo(before, 6)
  })
})

describe('purity', () => {
  it('does not mutate the input state', () => {
    const sim = createSim([agent('a', 5, ['g'])], [goodie('g', 2)], { salary: 1, taxAlpha: 0.2 })
    const snapshot = JSON.parse(JSON.stringify(sim))
    step(sim, ['g'])
    expect(JSON.parse(JSON.stringify(sim))).toEqual(snapshot)
  })
})

describe('properties over many steps', () => {
  it('no starvation: with one scarce unit per step, every subscriber wins a fair share', () => {
    // Balanced flow (inflow = N·salary, outflow = one cost): nobody is permanently outranked,
    // because losing rounds accrue salary until the laggard climbs to the front of the queue.
    const ids = ['a', 'b', 'c', 'd']
    let sim = createSim(
      ids.map((id, i) => agent(id, 1 + i * 0.1, ['g'])),
      [goodie('g', 4)],
      { salary: 1, taxAlpha: 0.1 },
    )
    const wins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
    for (let i = 0; i < 400; i++) {
      const { state, awards } = step(sim, ['g'])
      for (const a of awards) wins[a.to]!++
      sim = state
    }
    const counts = Object.values(wins)
    expect(Math.min(...counts)).toBeGreaterThan(0) // nobody starved
    expect(Math.min(...counts)).toBeGreaterThan(Math.max(...counts) * 0.5) // roughly fair
  })

  it('priorities stay bounded (no runaway accumulation)', () => {
    let sim = createSim(
      [agent('hoarder', 1, []), agent('user', 1, ['g'])],
      [goodie('g', 2)],
      { salary: 1, taxAlpha: 0.1 },
    )
    for (let i = 0; i < 500; i++) sim = step(sim, ['g']).state
    for (const a of sim.agents) expect(a.priority).toBeLessThan(100)
  })
})
