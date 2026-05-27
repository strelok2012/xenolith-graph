// The simplest possible custom widget: a click/drag level bar. A CanvasWidgetController is just two
// functions — `draw` paints into a 2D canvas, `onPointer` returns the new value during a drag. No
// framework, no DOM. The node it lives on is DATA (canvas-widget.json).

import type { CanvasWidgetController, XenolithEditor, NodeId } from '@xenolith/editor'
import graph from './canvas-widget.json'

export const levelWidget: CanvasWidgetController = {
  draw(ctx, { value, width, height, accent, muted }) {
    const v = typeof value === 'number' ? value : 0
    ctx.fillStyle = muted                                    // readout (top-left, inside bounds)
    ctx.font = '11px Inter'
    ctx.textBaseline = 'top'
    ctx.fillText(`${Math.round(v * 100)}%`, 0, 0)
    const barY = height - 10                                 // bar along the bottom
    ctx.fillStyle = 'rgba(255,255,255,0.10)'                 // track
    ctx.fillRect(0, barY, width, 8)
    ctx.fillStyle = accent                                   // fill up to the value
    ctx.fillRect(0, barY, width * v, 8)
  },
  onPointer(phase, x, _y, { width }) {
    if (phase === 'up') return undefined
    return Math.max(0, Math.min(1, x / width))               // click/drag → new value
  },
}

/** Register the bar widget, load the one-node graph, frame it. Returns the node id so the host can
 *  read/write its value (e.g. mirror it into app state). */
export function buildCanvasWidget(editor: XenolithEditor): { nodeId: NodeId } {
  editor.registerWidget('level', levelWidget)
  editor.loadJSON(graph)
  editor.fitView({ padding: 90, maxZoom: 1 })
  const nodeId = [...editor.graph.nodes()][0]!.id
  return { nodeId }
}
