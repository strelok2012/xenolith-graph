// Every built-in widget type on one node — slider, number, toggle, combo, color, text — rendered in
// WebGL and editable inline. No custom code: just a node with a `widgets` array, defined as DATA in
// builtin-widgets.json and loaded with editor.loadJSON.

import type { XenolithEditor } from '@xenolith/editor'
import graph from './builtin-widgets.json'

export function buildBuiltinWidgets(editor: XenolithEditor): void {
  editor.loadJSON(graph)
  editor.fitView({ padding: 90, maxZoom: 1 })
}
