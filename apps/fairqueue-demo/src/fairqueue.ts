// Headless engine for Рома's "priority-queue + goodies + tax" model. Per step:
//   1. each agent gets its own additive salary (in 0..1),
//   2. arriving goodies fall to the highest-priority subscriber of each type (receiving one
//      subtracts that goodie's cost),
//   3. a "tax" multiplies every priority by (1 - taxAlpha), pulling it toward the 0 reference —
//      and because it is a plain multiply, the absolute pull-back is proportionally stronger the
//      farther |priority| is from 0 (anti-monopoly above 0, anti-starvation below).
//
// Priorities are centred at 0 and may go negative (a recently-served agent dips below 0, then
// climbs back on salary). Pure and zero-dep: `step` is a referentially-transparent
// (state, arrivals) -> result. Per-goodie cost/rate and per-agent salary all live on the data.

export type AgentId = string
export type GoodieType = string

export interface Agent {
  id: AgentId
  priority: number // centred at 0; positive = ahead in the queue, negative = recently served
  salary: number // additive income per step, in 0..1
  subscriptions: GoodieType[]
}

export interface GoodieSpec {
  type: GoodieType
  cost: number // priority subtracted from the recipient
  rate: number // fractional units spawned per step (0.1 = one every ~10 steps); used by the host
}

export interface SimParams {
  taxAlpha: number // 0..1 — priority *= (1 - taxAlpha) each step, pulling toward 0
}

export interface SimState {
  agents: Agent[]
  goodies: Record<GoodieType, GoodieSpec>
  params: SimParams
  step: number
}

export interface GoodieAward {
  type: GoodieType
  to: AgentId
  cost: number
}

export interface StepResult {
  state: SimState
  awards: GoodieAward[]
  leftovers: GoodieType[] // units that found no subscriber this step → go to the warehouse
}

export const DEFAULT_PARAMS: SimParams = { taxAlpha: 0.1 }

export function createSim(
  agents: Agent[],
  goodies: GoodieSpec[],
  params: Partial<SimParams> = {},
): SimState {
  return {
    agents: agents.map((a) => ({ ...a, subscriptions: [...a.subscriptions] })),
    goodies: Object.fromEntries(goodies.map((g) => [g.type, g])),
    params: { ...DEFAULT_PARAMS, ...params },
    step: 0,
  }
}

// `arrivals` is the list of goodie units that fall this step (the host derives it from each goodie's
// fractional `rate`). Multiple units of the same type spread across distinct recipients, because
// each award lowers the recipient's priority below the next-highest subscriber within the step.
export function step(state: SimState, arrivals: GoodieType[]): StepResult {
  const priority = new Map<AgentId, number>()
  for (const a of state.agents) priority.set(a.id, a.priority + a.salary) // 1. salary (additive)

  const awards: GoodieAward[] = [] // 2. goodies
  const leftovers: GoodieType[] = []
  for (const type of arrivals) {
    const spec = state.goodies[type]
    if (!spec) continue
    const recipient = topSubscriber(state.agents, type, priority)
    if (!recipient) {
      leftovers.push(type) // nobody subscribes → unclaimed, goes to the warehouse
      continue
    }
    priority.set(recipient.id, priority.get(recipient.id)! - spec.cost)
    awards.push({ type, to: recipient.id, cost: spec.cost })
  }

  const k = 1 - state.params.taxAlpha // 3. tax: multiply toward the 0 reference
  if (k !== 1) for (const a of state.agents) priority.set(a.id, priority.get(a.id)! * k)

  const agents = state.agents.map((a) => ({ ...a, priority: priority.get(a.id)! }))
  return { state: { ...state, agents, step: state.step + 1 }, awards, leftovers }
}

function topSubscriber(
  agents: Agent[],
  type: GoodieType,
  priority: Map<AgentId, number>,
): Agent | undefined {
  let best: Agent | undefined
  let bestP = -Infinity
  for (const a of agents) {
    if (!a.subscriptions.includes(type)) continue
    const p = priority.get(a.id)!
    if (p > bestP) {
      bestP = p
      best = a
    }
  }
  return best
}
