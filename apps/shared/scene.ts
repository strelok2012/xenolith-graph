// The canonical shared demo scene: register the canvas custom widgets + demo node schemas, load the
// shared demo graph (xenolith.v1), and frame it. Framework-agnostic — every host (React/Vue/Svelte)
// calls this in its onReady so the registry has the schemas before loadJSON.

import { demoGraph, demoSchemas, createCurveWidget, createXYPadWidget } from './demo-graph.js'
import type { XenolithEditor } from '@xenolith/editor'

export function loadDemo(editor: XenolithEditor): void {
  editor.registerWidget('curve', createCurveWidget())
  editor.registerWidget('xypad', createXYPadWidget())
  for (const schema of demoSchemas) editor.registry.register(schema)
  editor.loadJSON(demoGraph)
  editor.fitView({ padding: 48, maxZoom: 1 })
}
