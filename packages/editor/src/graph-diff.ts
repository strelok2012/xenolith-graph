// Pure diff of two xenolith.v1 graph payloads. Returns sets of node/edge ids that were added,
// removed, or whose state/type changed. Position changes are IGNORED by default — they're
// cosmetic in a PR-review context. Host code colours rings / draws badges based on this.

export interface DiffSnapshotNode {
  id: string
  type: string
  position: { x: number; y: number }
  state?: Record<string, unknown>
  size?: { x: number; y: number } | undefined
}
export interface DiffSnapshotEdge {
  id: string
  from: { node: string; pin: string }
  to:   { node: string; pin: string }
}
export interface DiffSnapshot {
  nodes: ReadonlyArray<DiffSnapshotNode>
  edges: ReadonlyArray<DiffSnapshotEdge>
}

export interface GraphDiff {
  addedNodes:    Set<string>
  removedNodes:  Set<string>
  /** Nodes present in both but with different state or type. (Position is excluded by default —
   *  pass `comparePosition: true` to include it.) */
  modifiedNodes: Set<string>
  addedEdges:    Set<string>
  removedEdges:  Set<string>
}

export interface DiffOptions {
  /** Treat node moves as modifications. Off by default. */
  comparePosition?: boolean
}

function nodeFingerprint(n: DiffSnapshotNode, opts: DiffOptions): string {
  const fp: Record<string, unknown> = { type: n.type, state: n.state ?? {} }
  if (opts.comparePosition) {
    fp['position'] = { x: Math.round(n.position.x * 1000) / 1000, y: Math.round(n.position.y * 1000) / 1000 }
  }
  return JSON.stringify(fp)
}

export function diffGraphs(prev: DiffSnapshot, next: DiffSnapshot, opts: DiffOptions = {}): GraphDiff {
  const out: GraphDiff = {
    addedNodes: new Set(), removedNodes: new Set(), modifiedNodes: new Set(),
    addedEdges: new Set(), removedEdges: new Set(),
  }
  const prevNodes = new Map(prev.nodes.map((n) => [n.id, n]))
  const nextNodes = new Map(next.nodes.map((n) => [n.id, n]))
  for (const [id, n] of nextNodes) {
    const prior = prevNodes.get(id)
    if (!prior) { out.addedNodes.add(id); continue }
    if (nodeFingerprint(prior, opts) !== nodeFingerprint(n, opts)) out.modifiedNodes.add(id)
  }
  for (const id of prevNodes.keys()) if (!nextNodes.has(id)) out.removedNodes.add(id)
  const prevEdges = new Set(prev.edges.map((e) => e.id))
  const nextEdges = new Set(next.edges.map((e) => e.id))
  for (const id of nextEdges) if (!prevEdges.has(id)) out.addedEdges.add(id)
  for (const id of prevEdges) if (!nextEdges.has(id)) out.removedEdges.add(id)
  return out
}
