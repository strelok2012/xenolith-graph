import type { Edge, Node, NodeId } from '@xenolith/core'
import { isReroute } from '@xenolith/core'

/** An inline `$reroute` is a pure wire relay — it only means something with BOTH a feed (an edge
 *  into it) and an outgoing edge. Copying a fragment that severs either side would paste a dangling
 *  dot, so this drops such knots from a clipboard snapshot before cloning. Iterates so that pruning
 *  one reroute can cascade into a chained neighbour that's now orphaned too.
 *
 *  Pure: returns the surviving nodes/edges, leaving inputs untouched. */
export function pruneOrphanInlineReroutes(
  nodes: ReadonlyArray<Node>,
  edges: ReadonlyArray<Edge>,
): { nodes: Node[]; edges: Edge[] } {
  const kept = new Set<NodeId>(nodes.map((n) => n.id))
  let liveEdges = edges.slice()
  for (;;) {
    const drop = new Set<NodeId>()
    for (const n of nodes) {
      if (!kept.has(n.id) || !isReroute(n)) continue
      const hasIn  = liveEdges.some((e) => e.to.node === n.id)
      const hasOut = liveEdges.some((e) => e.from.node === n.id)
      if (!hasIn || !hasOut) drop.add(n.id)
    }
    if (drop.size === 0) break
    for (const id of drop) kept.delete(id)
    liveEdges = liveEdges.filter((e) => kept.has(e.from.node) && kept.has(e.to.node))
  }
  return { nodes: nodes.filter((n) => kept.has(n.id)), edges: liveEdges }
}
