// The honest minimum: no theme (Xen is the default), one node, framed. The node is DATA (mount.json)
// loaded with editor.loadJSON — the smallest possible xenolith.v1 graph.

import type { XenolithEditor } from '@xenolith/editor'
import graph from './mount.json'

export function buildMount(editor: XenolithEditor): void {
  editor.loadJSON(graph)
  editor.fitView({ padding: 80, maxZoom: 1 })
}
