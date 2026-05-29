import { describe, it, expect } from 'vitest'
import { Runtime } from '@xenolith/plugin-runtime'
import { createSim, step, type Agent, type GoodieSpec } from './fairqueue.js'
import { fairqueueStepGraph, FAIRQUEUE_DEFS } from './runtime-graph.js'

// The de-risk milestone: the runtime GRAPH (generic primitives + Allocate) must reproduce the
// native hard-coded step() bit-for-bit — not an inline reimplementation, the actual shipped step.

const seed = (rt: Runtime, agents: Agent[], goodies: GoodieSpec[], arrivals: string[], alpha: number): void => {
  rt.setVar('priorities', agents.map((a) => a.priority))
  rt.setVar('salaries', agents.map((a) => a.salary))
  rt.setVar('subs', agents.map((a) => a.subscriptions))
  rt.setVar('costs', Object.fromEntries(goodies.map((g) => [g.type, g.cost])))
  rt.setVar('arrivals', arrivals)
  rt.setVar('alpha', alpha)
}
const closeArr = (a: number[], b: number[]): void => {
  expect(a.length).toBe(b.length)
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9))
}

const agents: Agent[] = [
  { id: 'Ada', priority: 0, salary: 0.5, subscriptions: ['gift', 'coin'] },
  { id: 'Boris', priority: 0, salary: 0.4, subscriptions: ['coin'] },
  { id: 'Cleo', priority: 0, salary: 0.6, subscriptions: ['gift', 'star'] },
]
const goodies: GoodieSpec[] = [
  { type: 'gift', cost: 2, rate: 0 },
  { type: 'coin', cost: 1.5, rate: 0 },
  { type: 'star', cost: 4, rate: 0 },
  { type: 'junk', cost: 1, rate: 0 }, // no subscriber → leftover
]
const ALPHA = 0.1

describe('runtime graph == native step()', () => {
  it('one tick: priorities, awards (by id) and leftovers all match', () => {
    const arrivals = ['gift', 'coin', 'junk']
    const res = step(createSim(agents, goodies, { taxAlpha: ALPHA }), arrivals)

    const rt = new Runtime(FAIRQUEUE_DEFS)
    seed(rt, agents, goodies, arrivals, ALPHA)
    rt.tick(fairqueueStepGraph())

    closeArr(rt.getVar('priorities') as number[], res.state.agents.map((a) => a.priority))
    const vmAwards = (rt.getVar('awards') as { type: string; to: number }[]).map((a) => ({ type: a.type, to: agents[a.to]!.id }))
    expect(vmAwards).toEqual(res.awards.map((a) => ({ type: a.type, to: a.to })))
    expect(rt.getVar('leftovers')).toEqual(res.leftovers)
  })

  it('spreads two same-type units to distinct recipients like the native step', () => {
    const arrivals = ['coin', 'coin']
    const res = step(createSim(agents, goodies, { taxAlpha: 0 }), arrivals)
    const rt = new Runtime(FAIRQUEUE_DEFS)
    seed(rt, agents, goodies, arrivals, 0)
    rt.tick(fairqueueStepGraph())
    const vmTo = (rt.getVar('awards') as { to: number }[]).map((a) => agents[a.to]!.id)
    expect(vmTo).toEqual(res.awards.map((a) => a.to))
  })

  it('matches over many ticks (cross-tick feedback on the array state)', () => {
    const arrivals = ['gift', 'coin', 'junk']
    let sim = createSim(agents, goodies, { taxAlpha: ALPHA })
    for (let i = 0; i < 30; i++) sim = step(sim, arrivals).state

    const rt = new Runtime(FAIRQUEUE_DEFS)
    seed(rt, agents, goodies, arrivals, ALPHA)
    const graph = fairqueueStepGraph()
    for (let i = 0; i < 30; i++) rt.tick(graph)

    closeArr(rt.getVar('priorities') as number[], sim.agents.map((a) => a.priority))
  })
})
