// G9 showcase — pluggable edge path styles. Same graph (4 source→sink pairs) rendered with each
// style at once, plus a "set all to X" panel that flips every wire in place via
// `editor.setEdgeOptions(id, { pathStyle })`. No render hacks; uses the public per-edge option.

import type { XenolithEditor, XenolithGraphV1 } from '@xenolith/editor'
import type { EdgeId } from '@xenolith/core'
import type { EdgePathStyle } from '@xenolith/render-pixi'

const STYLES: EdgePathStyle[] = ['bezier', 'smoothstep', 'step', 'linear']

export interface EdgePathsScene {
  /** Set every edge in the demo to the chosen style. */
  setAll: (style: EdgePathStyle) => void
  /** Current per-edge styles (id → style). */
  styles: () => Map<EdgeId, EdgePathStyle>
}

/** Edge path styles this demo wires (one row per style). */
export const EDGE_PATH_STYLES: readonly EdgePathStyle[] = STYLES

/** Idempotent setup: load the source/sink rows + apply the per-row pathStyle. */
export function setupEdgePaths(editor: XenolithEditor): void { void buildEdgePaths(editor) }

/** Flip every edge in the loaded demo graph to the same style. */
export function setAllEdgePaths(editor: XenolithEditor, style: EdgePathStyle): void {
  for (const s of STYLES) editor.setEdgeOptions(`e_${s}` as EdgeId, { pathStyle: style })
}

/** @deprecated Prefer `setupEdgePaths` + `setAllEdgePaths`. Kept for vanilla examples. */
export function buildEdgePaths(editor: XenolithEditor): EdgePathsScene {
  const nodes: XenolithGraphV1['nodes'] = []
  const edges: XenolithGraphV1['edges'] = []
  const edgeStyle = new Map<EdgeId, EdgePathStyle>()
  const colW = 360
  // Sink is offset vertically from its source so every style's signature shape actually shows up:
  // a horizontal pair makes bezier/smoothstep/step/linear all look like the same flat wire. Half
  // the sinks dip down, the other half rise — alternating directions surfaces the curves AND
  // keeps each row visually separated from its neighbours.
  const ROW_SPACING = 200
  const SINK_OFFSET_Y = 90
  for (let i = 0; i < STYLES.length; i++) {
    const style = STYLES[i]!
    const srcY = 60 + i * ROW_SPACING
    const sinkY = srcY + (i % 2 === 0 ? SINK_OFFSET_Y : -SINK_OFFSET_Y)
    const srcId = `src_${style}`
    const sinkId = `sink_${style}`
    nodes.push({
      id: srcId, type: 'Src', position: { x: 60, y: srcY }, size: { x: 140, y: 60 },
      state: {}, render: { title: 'Source', category: 'data' },
      pins: [{ id: `${srcId}_o`, kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'out' }],
    })
    nodes.push({
      id: sinkId, type: 'Sink', position: { x: 60 + colW, y: sinkY }, size: { x: 140, y: 60 },
      state: {}, render: { title: style, category: 'utility' },
      pins: [{ id: `${sinkId}_i`, kind: 'data', direction: 'in', type: 'float', multiple: false, label: 'in' }],
    })
    const eId = `e_${style}`
    edges.push({ id: eId, from: { node: srcId, pin: `${srcId}_o` }, to: { node: sinkId, pin: `${sinkId}_i` } })
    edgeStyle.set(eId as EdgeId, style)
  }
  editor.loadJSON({ version: 'xenolith.v1', nodes, edges })
  // Apply per-edge pathStyle AFTER load so each wire takes its row's style. setEdgeOptions
  // preserves the existing options (sourceType, label, etc.) — only the listed keys change.
  for (const [id, style] of edgeStyle) editor.setEdgeOptions(id, { pathStyle: style })
  editor.fitView({ padding: 56, maxZoom: 1 })

  return {
    setAll: (style) => {
      for (const id of edgeStyle.keys()) {
        edgeStyle.set(id, style)
        editor.setEdgeOptions(id, { pathStyle: style })
      }
    },
    styles: () => new Map(edgeStyle),
  }
}
