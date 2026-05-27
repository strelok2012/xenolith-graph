// Showcase: connection rules. Pins are typed (Blueprint-style) so the built-in check refuses a
// string→float wire automatically. On top of that, a custom isValidConnection guard uses the core
// wouldCreateCycle() helper to forbid loops. The graph is DATA (connection-validation.json); the only
// host-specific piece is the `log` sink the guard + edge:connected event report attempts to.

import { wouldCreateCycle } from '@xenolith/core'
import type { XenolithEditor, NodeId } from '@xenolith/editor'
import graph from './connection-validation.json'

export interface Attempt { ok: boolean; text: string }

export function buildConnectionValidation(editor: XenolithEditor, log: (a: Attempt) => void): void {
  editor.loadJSON(graph)

  const name = (id: NodeId): string => editor.graph.getNode(id)?.type ?? '?'
  editor.setIsValidConnection((conn) => {
    if (wouldCreateCycle(editor.graph, conn.source, conn.target)) {
      log({ ok: false, text: `${name(conn.source)} → ${name(conn.target)} · would create a cycle` })
      return false
    }
    return true
  })
  editor.on('edge:connected', (e) => log({ ok: true, text: `${name(e.edge.from.node)} → ${name(e.edge.to.node)} · connected` }))

  editor.fitView({ padding: 64, maxZoom: 1 })
}
