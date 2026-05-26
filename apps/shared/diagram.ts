// The flowchart showcase is just DATA: a xenolith.v1 file loaded with editor.loadJSON. No imperative
// node/edge wiring — the same JSON round-trips through serialization and loads on any host. Edges
// carry the render opts (arrowhead marker, animated flow, label) right in the file.

import type { XenolithEditor, EdgeId } from '@xenolith/editor'
import diagram from './diagram.json'

export interface DiagramHandle {
  /** Toggle the flowing-dash animation on every edge. */
  setAnimated(on: boolean): void
}

export function buildDiagram(editor: XenolithEditor): DiagramHandle {
  editor.loadJSON(diagram)
  editor.fitView({ padding: 72, maxZoom: 1 })
  const edgeIds = diagram.edges.map((e) => e.id as unknown as EdgeId)
  return { setAnimated: (on) => { for (const id of edgeIds) editor.setEdgeOptions(id, { animated: on }) } }
}
