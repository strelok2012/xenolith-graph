// Pure graph-query helpers — neighbours, connected edges, roots/leaves, topological order. The host
// builds graph EXECUTION (running an LLM flow, an audio patch, …) on top of these; the editor stays
// "not a runtime" (per the project non-goals). Zero-dep, like the rest of core.
import type { Graph, Node, Edge } from './graph.js'
import type { NodeId } from './ids.js'

/** Nodes with an edge INTO `id` (its upstream dependencies). De-duplicated. */
export function incomers(graph: Graph, id: NodeId): Node[] {
  return neighbours(graph, id, 'in')
}

/** Nodes with an edge OUT of `id` (its downstream consumers). De-duplicated. */
export function outgoers(graph: Graph, id: NodeId): Node[] {
  return neighbours(graph, id, 'out')
}

function neighbours(graph: Graph, id: NodeId, dir: 'in' | 'out'): Node[] {
  const seen = new Set<NodeId>()
  const out: Node[] = []
  for (const e of graph.edges()) {
    const hit = dir === 'in' ? e.to.node === id : e.from.node === id
    if (!hit) continue
    const otherId = dir === 'in' ? e.from.node : e.to.node
    if (seen.has(otherId)) continue
    const n = graph.getNode(otherId)
    if (n) { seen.add(otherId); out.push(n as Node) }
  }
  return out
}

/** Edges touching `id`. `direction` filters to incoming (`in`) or outgoing (`out`); omit for both. */
export function connectedEdges(graph: Graph, id: NodeId, direction?: 'in' | 'out'): Edge[] {
  const out: Edge[] = []
  for (const e of graph.edges()) {
    const isIn = e.to.node === id, isOut = e.from.node === id
    if ((direction === 'in' && isIn) || (direction === 'out' && isOut) || (!direction && (isIn || isOut))) {
      out.push(e as Edge)
    }
  }
  return out
}

/** Nodes with no incoming edges (sources). */
export function roots(graph: Graph): Node[] {
  return [...graph.nodes()].filter((n) => connectedEdges(graph, n.id, 'in').length === 0) as Node[]
}

/** Nodes with no outgoing edges (sinks). */
export function leaves(graph: Graph): Node[] {
  return [...graph.nodes()].filter((n) => connectedEdges(graph, n.id, 'out').length === 0) as Node[]
}

/** The set of node ids reachable from `start` by following outgoing edges (the active downstream
 *  chain), including `start` itself. Cycle-safe. A host runtime uses this to decide which nodes are
 *  actually "live": when an edge is cut or a node deleted, everything past the break drops out of
 *  the set, so downstream nodes can stop playing / stop showing as running. */
export function reachableFrom(graph: Graph, start: NodeId): Set<NodeId> {
  const seen = new Set<NodeId>()
  if (!graph.hasNode(start)) return seen
  const stack: NodeId[] = [start]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    for (const n of outgoers(graph, id)) if (!seen.has(n.id)) stack.push(n.id)
  }
  return seen
}

/** Kahn topological sort. `order` lists node ids so every edge goes earlier→later; `cyclic` holds
 *  the ids that couldn't be ordered because they sit in (or downstream of) a cycle. */
export function topoOrder(graph: Graph): { order: NodeId[]; cyclic: NodeId[] } {
  const indegree = new Map<NodeId, number>()
  const outAdj = new Map<NodeId, NodeId[]>()
  for (const n of graph.nodes()) { indegree.set(n.id, 0); outAdj.set(n.id, []) }
  for (const e of graph.edges()) {
    if (!indegree.has(e.from.node) || !indegree.has(e.to.node)) continue
    indegree.set(e.to.node, (indegree.get(e.to.node) ?? 0) + 1)
    outAdj.get(e.from.node)!.push(e.to.node)
  }
  const queue: NodeId[] = []
  for (const [id, deg] of indegree) if (deg === 0) queue.push(id)
  const order: NodeId[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const next of outAdj.get(id)!) {
      const d = (indegree.get(next) ?? 0) - 1
      indegree.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  const cyclic = [...indegree].filter(([, d]) => d > 0).map(([id]) => id)
  return { order, cyclic }
}

/** Would adding an edge `from → to` introduce a cycle? True if `from === to`, or a path already
 *  leads from `to` back to `from`. Handy for an `isValidConnection` rule that forbids cycles. */
export function wouldCreateCycle(graph: Graph, from: NodeId, to: NodeId): boolean {
  if (from === to) return true
  const stack: NodeId[] = [to]
  const seen = new Set<NodeId>()
  while (stack.length) {
    const id = stack.pop()!
    if (id === from) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const e of graph.edges()) if (e.from.node === id) stack.push(e.to.node)
  }
  return false
}
