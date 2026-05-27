// Headless engine for the "priority-queue + goodies + log-tax" model (Рома's spec).
//
// Each step: (1) every agent gets `salary` priority, (2) arriving goodies fall to the
// highest-priority subscriber of each type (receiving one subtracts its cost), (3) a
// log-space mean-reverting "tax" pulls everyone toward the shared equilibrium — agents
// above it decay, agents below it are restored (anti-monopoly + anti-starvation).
//
// Pure and zero-dep: `step` is a referentially-transparent (state, arrivals) -> result.
// The four open design choices are parameters, not hard-coded: per-goodie `cost`, salary
// (uniform here, weights are a future param), single-recipient-per-unit distribution, and
// the tax shape (log-space OU). Defaults below are the simplest sane choices.

export type AgentId = string
export type GoodieType = string

export interface Agent {
  id: AgentId
  priority: number
  subscriptions: GoodieType[]
}

export interface GoodieSpec {
  type: GoodieType
  cost: number
}

export interface SimParams {
  salary: number
  taxAlpha: number // 0..1 — strength of pull toward the geometric mean (0 = no tax)
  minPriority: number // floor so ln() stays defined after costs are subtracted
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
}

export const DEFAULT_PARAMS: SimParams = {
  salary: 1,
  taxAlpha: 0.1,
  minPriority: 0.01,
}

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

// `arrivals` is the list of goodie units that fall this step (caller decides the rate).
// Multiple units of the same type spread across distinct recipients, because each award
// lowers the recipient's priority below the next-highest subscriber within the same step.
export function step(state: SimState, arrivals: GoodieType[]): StepResult {
  const { salary, taxAlpha, minPriority } = state.params

  const priority = new Map<AgentId, number>()
  for (const a of state.agents) priority.set(a.id, a.priority + salary)

  const awards: GoodieAward[] = []
  for (const type of arrivals) {
    const spec = state.goodies[type]
    if (!spec) continue
    const recipient = topSubscriber(state.agents, type, priority)
    if (!recipient) continue
    priority.set(recipient.id, priority.get(recipient.id)! - spec.cost)
    awards.push({ type, to: recipient.id, cost: spec.cost })
  }

  if (taxAlpha > 0) applyLogTax(state.agents, priority, taxAlpha, minPriority)

  const agents = state.agents.map((a) => ({ ...a, priority: priority.get(a.id)! }))
  return { state: { ...state, agents, step: state.step + 1 }, awards }
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

// Ornstein–Uhlenbeck in log space: x <- x - α(x - x̄). The geometric mean is the attractor;
// distances from it shrink by (1-α) each step, symmetric for over- and under-shooters.
function applyLogTax(
  agents: Agent[],
  priority: Map<AgentId, number>,
  alpha: number,
  floor: number,
): void {
  const logs = agents.map((a) => Math.log(Math.max(priority.get(a.id)!, floor)))
  const mean = logs.reduce((s, x) => s + x, 0) / logs.length
  agents.forEach((a, i) => {
    const x = logs[i]! - alpha * (logs[i]! - mean)
    priority.set(a.id, Math.exp(x))
  })
}
