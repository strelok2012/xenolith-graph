// Derive a SimState from the live editor graph — the graph is the source of truth for topology, so
// connecting/disconnecting an edge subscribes/unsubscribes an agent, and per-node widget values
// (salary, cost, rate, priority) ride in node.state. Pure: it reads plain node/edge shapes, so it
// unit-tests without the editor. The builder feeds it [...editor.graph.nodes()] / .edges() each tick.

import { createSim, type SimState, type SimParams } from './fairqueue.js'

export interface NodeLike {
  id: string
  type: string
  state: Readonly<Record<string, unknown>>
}
export interface EdgeLike {
  from: { node: string }
  to: { node: string }
}

export const GOODIE_PREFIX = 'goodie:'

/** A Goodie node's stable model type: its `state.gtype` if set (short, friendly — palette nodes get
 *  one), else the id minus the `goodie:` prefix, else the raw id. */
export function goodieTypeOf(node: NodeLike): string {
  const g = node.state['gtype']
  if (typeof g === 'string' && g.length > 0) return g
  return node.id.startsWith(GOODIE_PREFIX) ? node.id.slice(GOODIE_PREFIX.length) : node.id
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

export function graphToSim(
  nodes: ReadonlyArray<NodeLike>,
  edges: ReadonlyArray<EdgeLike>,
  params: Partial<SimParams> = {},
): SimState {
  const goodieTypeByNode = new Map<string, string>()
  const goodies = nodes
    .filter((n) => n.type === 'Goodie')
    .map((n) => {
      const type = goodieTypeOf(n)
      goodieTypeByNode.set(n.id, type)
      return { type, cost: num(n.state['cost'], 0), rate: num(n.state['rate'], 0) }
    })

  const subsByAgent = new Map<string, Set<string>>()
  for (const e of edges) {
    const type = goodieTypeByNode.get(e.from.node)
    if (!type) continue // only Goodie → Agent edges are subscriptions
    let set = subsByAgent.get(e.to.node)
    if (!set) subsByAgent.set(e.to.node, (set = new Set()))
    set.add(type)
  }

  const agents = nodes
    .filter((n) => n.type === 'Agent')
    .map((n) => ({
      id: n.id,
      priority: num(n.state['priority'], 0),
      salary: num(n.state['salary'], 0),
      subscriptions: [...(subsByAgent.get(n.id) ?? [])],
    }))

  // The tax coefficient α lives in the Government node's widget — the graph owns it.
  const stateNode = nodes.find((n) => n.type === 'State')
  const resolved: Partial<SimParams> =
    stateNode && typeof stateNode.state['taxAlpha'] === 'number'
      ? { ...params, taxAlpha: stateNode.state['taxAlpha'] as number }
      : params

  return createSim(agents, goodies, resolved)
}
