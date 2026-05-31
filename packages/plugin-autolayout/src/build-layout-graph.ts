import type { Graph, Node, NodeId, Edge } from '@xenolith/core'
import { isMacro, macroMembers } from '@xenolith/core'
import type { LayoutGraph } from './engine.js'

/** Pull an engine-neutral `LayoutGraph` out of the editor's live graph. Pure — never mutates.
 *  Nodes without an explicit `size` get a sane default so dagre/elk don't pack overlapping rects.
 *  Macro membership is surfaced as `node.parent` so hierarchical engines (ELK) lay out children
 *  inside their parent; flat engines (dagre) just ignore the field. No coordinate data is
 *  included — that's the engine's output, not its input. */
export function buildLayoutGraph(graph: Graph): LayoutGraph {
  const nodes = [...graph.nodes()] as Node[]
  const edges = [...graph.edges()] as Edge[]
  const parentOf = new Map<string, string>()
  for (const n of nodes) {
    if (!isMacro(n)) continue
    for (const m of macroMembers(n) as NodeId[]) parentOf.set(String(m), String(n.id))
  }
  return {
    nodes: nodes.map((n) => {
      const parent = parentOf.get(String(n.id))
      return {
        id: String(n.id),
        width:  Math.max(1, n.size?.x ?? DEFAULT_W),
        height: Math.max(1, n.size?.y ?? DEFAULT_H),
        ...(parent !== undefined ? { parent } : {}),
        ports: n.pins.map((p) => ({ id: String(p.id), side: p.direction === 'in' ? 'in' : 'out' as const })),
      }
    }),
    edges: edges.map((e) => ({
      id: String(e.id),
      from: { node: String(e.from.node), port: String(e.from.pin) },
      to:   { node: String(e.to.node),   port: String(e.to.pin)   },
    })),
  }
}

const DEFAULT_W = 180
const DEFAULT_H = 80
