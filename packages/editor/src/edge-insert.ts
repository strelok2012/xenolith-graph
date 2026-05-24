import type { Edge, NodeId, NodeSchema, Pin } from '@xenolith/core'
import { canConnect } from './pin-compat.js'

/** Build a throwaway Pin from a schema pin for compatibility checks (id/label are irrelevant). */
function pinOf(p: NodeSchema['pins'][number]): Pin {
  return {
    id: '' as Pin['id'],
    kind: p.kind,
    direction: p.direction,
    type: p.type,
    multiple: p.multiple ?? false,
  }
}

/** Can this node type be spliced into a data wire of (sourceType → targetType)? It must have at
 *  least one input pin able to accept the source's output and one output pin able to feed the
 *  target's input. Used to filter the "Add Node" palette opened from an edge's context menu. */
export function spliceCompatible(schema: NodeSchema, sourceType: string, targetType: string): boolean {
  const source: Pin = { id: '' as Pin['id'], kind: 'data', direction: 'out', type: sourceType, multiple: true }
  const target: Pin = { id: '' as Pin['id'], kind: 'data', direction: 'in',  type: targetType, multiple: false }
  const pins = schema.pins.map(pinOf)
  const hasIn = pins.some((p) => p.direction === 'in' && canConnect(source, p, false))
  const hasOut = pins.some((p) => p.direction === 'out' && canConnect(p, target, false))
  return hasIn && hasOut
}

export interface EdgeDeletionPlan {
  edgeIds: Set<unknown>
  rerouteIds: NodeId[]
}

/** Plan the removal triggered by deleting `removedEdgeId`. An inline reroute cannot dangle — it
 *  must have at least one incoming AND one outgoing connection. Removing the edge can leave a
 *  reroute one-sided; such reroutes (and their remaining edges) are removed too, cascading through
 *  reroute chains until the dangling stops. Real (non-reroute) nodes are never removed — only the
 *  reroute knots disappear, leaving the real endpoints disconnected. */
export function danglingRerouteRemovalPlan(
  edges: ReadonlyArray<Edge>,
  isReroute: (nodeId: NodeId) => boolean,
  removedEdgeId: Edge['id'],
): EdgeDeletionPlan {
  const removedEdges = new Set<unknown>([removedEdgeId])
  const removedReroutes = new Set<NodeId>()

  let changed = true
  while (changed) {
    changed = false
    const rerouteIds = new Set<NodeId>()
    for (const e of edges) {
      if (removedEdges.has(e.id)) continue
      if (isReroute(e.from.node) && !removedReroutes.has(e.from.node)) rerouteIds.add(e.from.node)
      if (isReroute(e.to.node) && !removedReroutes.has(e.to.node)) rerouteIds.add(e.to.node)
    }
    for (const r of rerouteIds) {
      const incident = edges.filter((e) => !removedEdges.has(e.id) && (e.from.node === r || e.to.node === r))
      const hasIn = incident.some((e) => e.to.node === r)
      const hasOut = incident.some((e) => e.from.node === r)
      if (!hasIn || !hasOut) {
        removedReroutes.add(r)
        for (const e of incident) removedEdges.add(e.id)
        changed = true
      }
    }
  }
  return { edgeIds: removedEdges, rerouteIds: [...removedReroutes] }
}
