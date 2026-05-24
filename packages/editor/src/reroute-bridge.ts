import type { Edge, NodeId } from '@xenolith/core'

/** When a reroute knot is deleted its wire shouldn't be severed — the nodes it merely relayed
 *  stay connected. For the reroute being removed, pair each incoming edge (upstream → reroute.in)
 *  with each outgoing edge (reroute.out → downstream) into a direct bridge. Bridges whose endpoint
 *  is itself being removed in the same batch are dropped (no point reconnecting to a doomed node).
 *
 *  Returns the endpoint pairs only; the caller mints edge ids, carries over wire opts, and applies
 *  the connect command. */
export function computeRerouteBridges(
  edges: ReadonlyArray<Edge>,
  rerouteId: NodeId,
  removing: ReadonlySet<NodeId>,
): { from: Edge['from']; to: Edge['to'] }[] {
  const incoming = edges.filter((e) => e.to.node === rerouteId)
  const outgoing = edges.filter((e) => e.from.node === rerouteId)
  const bridges: { from: Edge['from']; to: Edge['to'] }[] = []
  for (const inc of incoming) {
    if (removing.has(inc.from.node)) continue
    for (const out of outgoing) {
      if (removing.has(out.to.node)) continue
      bridges.push({ from: { ...inc.from }, to: { ...out.to } })
    }
  }
  return bridges
}
