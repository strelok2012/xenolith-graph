import { describe, it, expect } from 'vitest'
import { createSim, step, type Agent, type GoodieSpec } from './fairqueue.js'

const agent = (id: string, priority: number, salary = 0, subscriptions: string[] = []): Agent => ({
  id,
  priority,
  salary,
  subscriptions,
})
const goodie = (type: string, cost: number, rate = 0): GoodieSpec => ({ type, cost, rate })

const byId = (agents: Agent[]) => Object.fromEntries(agents.map((a) => [a.id, a.priority]))

describe('salary', () => {
  it('adds each agent its OWN salary (additive), tax off', () => {
    const sim = createSim([agent('a', 1, 0.5), agent('b', 1, 0.2)], [], { taxAlpha: 0 })
    expect(byId(step(sim, []).state.agents)).toEqual({ a: 1.5, b: 1.2 })
  })
  it('advances the step counter', () => {
    expect(step(createSim([agent('a', 0)], [], { taxAlpha: 0 }), []).state.step).toBe(1)
  })
})

describe('goodie distribution', () => {
  it('awards a goodie to the highest-priority subscriber and subtracts its cost', () => {
    const sim = createSim(
      [agent('hi', 10, 0, ['gift']), agent('lo', 1, 0, ['gift'])],
      [goodie('gift', 4)],
      { taxAlpha: 0 },
    )
    const { state, awards } = step(sim, ['gift'])
    expect(awards).toEqual([{ type: 'gift', to: 'hi', cost: 4 }])
    expect(byId(state.agents)).toEqual({ hi: 6, lo: 1 })
  })

  it('only subscribers are eligible, even if a non-subscriber outranks them', () => {
    const sim = createSim(
      [agent('rich', 100, 0, []), agent('poor', 1, 0, ['gift'])],
      [goodie('gift', 1)],
      { taxAlpha: 0 },
    )
    expect(step(sim, ['gift']).awards).toEqual([{ type: 'gift', to: 'poor', cost: 1 }])
  })

  it('two units in one step spread to distinct recipients', () => {
    const sim = createSim(
      [agent('a', 10, 0, ['gift']), agent('b', 9, 0, ['gift'])],
      [goodie('gift', 5)],
      { taxAlpha: 0 },
    )
    expect(step(sim, ['gift', 'gift']).awards.map((x) => x.to)).toEqual(['a', 'b'])
  })

  it('ignores arrivals of unknown goodie types', () => {
    const sim = createSim([agent('a', 1, 0, ['known'])], [goodie('known', 1)], { taxAlpha: 0 })
    expect(step(sim, ['unknown']).awards).toEqual([])
  })

  it('reports unclaimed units (no subscriber) as leftovers for the warehouse', () => {
    const sim = createSim(
      [agent('a', 1, 0, ['wanted'])],
      [goodie('wanted', 1), goodie('orphan', 1)],
      { taxAlpha: 0 },
    )
    const { awards, leftovers } = step(sim, ['wanted', 'orphan', 'orphan'])
    expect(awards.map((x) => x.type)).toEqual(['wanted'])
    expect(leftovers).toEqual(['orphan', 'orphan']) // nobody subscribes to "orphan"
  })
})

describe('tax (multiply toward 0)', () => {
  it('multiplies every priority by (1 - alpha) — reference is 0, not 1', () => {
    const sim = createSim([agent('hi', 2), agent('lo', -2)], [], { taxAlpha: 0.25 })
    const p = byId(step(sim, []).state.agents)
    expect(p['hi']).toBeCloseTo(1.5) // 2 * 0.75
    expect(p['lo']).toBeCloseTo(-1.5) // negatives also pulled toward 0
  })

  it('pulls harder the farther from 0 (absolute change scales with |priority|)', () => {
    const sim = createSim([agent('near', 1), agent('far', 4)], [], { taxAlpha: 0.2 })
    const p = byId(step(sim, []).state.agents)
    expect(1 - p['near']!).toBeCloseTo(0.2) // 1*0.2
    expect(4 - p['far']!).toBeCloseTo(0.8) // 4*0.2 — 4× stronger
  })

  it('decays an unfed, unpaid agent toward the 0 reference over time', () => {
    let sim = createSim([agent('x', 5)], [], { taxAlpha: 0.3 })
    for (let i = 0; i < 50; i++) sim = step(sim, []).state
    expect(Math.abs(sim.agents[0]!.priority)).toBeLessThan(0.01)
  })
})

describe('purity', () => {
  it('does not mutate the input state', () => {
    const sim = createSim([agent('a', 5, 0.3, ['g'])], [goodie('g', 2)], { taxAlpha: 0.2 })
    const snap = JSON.parse(JSON.stringify(sim))
    step(sim, ['g'])
    expect(JSON.parse(JSON.stringify(sim))).toEqual(snap)
  })
})

describe('properties over many steps', () => {
  it('no starvation: with one scarce unit per step, every subscriber wins a fair share', () => {
    const ids = ['a', 'b', 'c', 'd']
    let sim = createSim(
      ids.map((id, i) => agent(id, i * 0.1, 0.5, ['g'])),
      [goodie('g', 2)],
      { taxAlpha: 0.1 },
    )
    const wins: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]))
    for (let i = 0; i < 400; i++) {
      const { state, awards } = step(sim, ['g'])
      for (const a of awards) wins[a.to]!++
      sim = state
    }
    const counts = Object.values(wins)
    expect(Math.min(...counts)).toBeGreaterThan(0)
    expect(Math.min(...counts)).toBeGreaterThan(Math.max(...counts) * 0.5)
  })

  it('priorities stay bounded (tax caps accumulation around 0)', () => {
    let sim = createSim(
      [agent('hoarder', 0, 1, []), agent('user', 0, 1, ['g'])],
      [goodie('g', 2)],
      { taxAlpha: 0.1 },
    )
    for (let i = 0; i < 500; i++) sim = step(sim, ['g']).state
    for (const a of sim.agents) expect(Math.abs(a.priority)).toBeLessThan(50)
  })
})
