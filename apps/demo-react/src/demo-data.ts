import { demoGraph, demoSchemas, createCurveWidget, createXYPadWidget } from '@xenolith/demo'
import type { XenolithEditor } from '@xenolith/editor'

/** Register the canvas custom widgets + demo node schemas, load the shared demo graph, and frame it.
 *  Every page calls this in `onReady` so the registry has the schemas before `loadJSON`. */
export function loadDemo(editor: XenolithEditor): void {
  editor.registerWidget('curve', createCurveWidget())
  editor.registerWidget('xypad', createXYPadWidget())
  for (const schema of demoSchemas) editor.registry.register(schema)
  editor.loadJSON(demoGraph)
  editor.fitView({ padding: 48, maxZoom: 1 })
}

export { demoGraph, demoSchemas }
