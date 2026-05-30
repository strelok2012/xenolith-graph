// Subscription topology — wires are the source of truth. Each Agent Struct has an in-pin `subscribe`
// (multi, type `goodie-rec`); a wire from a Goodie Struct's `self` pin to that in-pin = subscription.
// This pure helper distills the wire set into per-agent goodie-type arrays the algorithm consumes via
// `state.data.subs`. The build-merged host calls it on every edge add/remove to keep `subs` in sync.

export interface SubEdge {
  from: { node: string; pin: string }
  to:   { node: string; pin: string }
}

/** Per-agent subscribed goodie types, derived from the edge set.
 *  - One entry per `agentIds` member (empty array when no wires touch its `subscribe` pin).
 *  - Order matches edge order in the input (stable across rebuilds).
 *  - Duplicate edges to the same (agent, goodie) pair collapse to one entry.
 *  - Edges to/from unknown nodes are silently ignored. */
export function subscriptionsFromWires(
  agentIds: ReadonlyArray<string>,
  edges: ReadonlyArray<SubEdge>,
  goodieTypeByNodeId: ReadonlyMap<string, string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const seen = new Map<string, Set<string>>()
  for (const id of agentIds) { out.set(id, []); seen.set(id, new Set()) }

  for (const e of edges) {
    const agentId = e.to.node
    // Subscribe pin is the schema-extra pin `extra:subscribe` (synthesized by the plugin from the
    // agent Schema's `extraPins`). Goodie's `self` pin is hand-authored with id `${id}:self`.
    if (e.to.pin !== 'extra:subscribe') continue
    if (!out.has(agentId)) continue
    const goodieType = goodieTypeByNodeId.get(e.from.node)
    if (goodieType === undefined) continue
    if (e.from.pin !== `${e.from.node}:self`) continue
    const set = seen.get(agentId)!
    if (set.has(goodieType)) continue
    set.add(goodieType)
    out.get(agentId)!.push(goodieType)
  }
  return out
}
