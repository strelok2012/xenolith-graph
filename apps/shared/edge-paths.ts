// G9 showcase — pluggable edge path styles. Same graph (4 source→sink pairs) rendered with each
// style at once, plus a "set all to X" panel that flips every wire in place via
// `editor.setEdgeOptions(id, { pathStyle })`. No render hacks; uses the public per-edge option.

import type { XenolithEditor } from '@xenolith/editor'
import type { EdgeId } from '@xenolith/core'
import type { EdgePathStyle } from '@xenolith/render-pixi'

const STYLES: EdgePathStyle[] = ['bezier', 'smoothstep', 'step', 'linear']

export interface EdgePathsScene {
  /** Set every edge in the demo to the chosen style. */
  setAll: (style: EdgePathStyle) => void
  /** Current per-edge styles (id → style). */
  styles: () => Map<EdgeId, EdgePathStyle>
}

export function buildEdgePaths(editor: XenolithEditor): EdgePathsScene {
  const nodes: Parameters<XenolithEditor['loadJSON']>[0]['nodes'] = []
  const edges: Parameters<XenolithEditor['loadJSON']>[0]['edges'] = []
  const edgeStyle = new Map<EdgeId, EdgePathStyle>()
  const colW = 360
  for (let i = 0; i < STYLES.length; i++) {
    const style = STYLES[i]!
    const y = 60 + i * 130
    const srcId = `src_${style}`
    const sinkId = `sink_${style}`
    nodes.push({
      id: srcId, type: 'Src', position: { x: 60, y }, size: { x: 140, y: 60 },
      state: {}, render: { title: 'Source', category: 'data' },
      pins: [{ id: `${srcId}_o`, kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'out' }],
    })
    nodes.push({
      id: sinkId, type: 'Sink', position: { x: 60 + colW, y }, size: { x: 140, y: 60 },
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
