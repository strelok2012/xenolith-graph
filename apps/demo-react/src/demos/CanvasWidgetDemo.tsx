import { useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import type { CanvasWidgetController, XenolithEditor } from '@xenolith/editor'
import type { NodeId } from '@xenolith/core'
import { DemoStage } from '../Layout.js'

/**
 * The simplest possible custom widget: a click/drag level bar. A CanvasWidgetController is just two
 * functions — `draw` paints into a 2D canvas, `onPointer` returns the new value during a drag. No
 * framework, no DOM. This is the whole thing:
 */
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

/** Island: register the bar widget, drop one node, and catch its value in React via onWidgetChange —
 *  shown in an in-editor panel. */
export function CanvasWidgetDemo() {
  const [gain, setGain] = useState(0.6)
  const editorRef = useRef<XenolithEditor | null>(null)
  const nodeIdRef = useRef<NodeId | null>(null)
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onWidgetChange={(e) => { if (e.widgetId === 'gain') setGain(Number(e.value)) }}
        onReady={(editor) => {
          editorRef.current = editor
          editor.registerWidget('level', levelWidget)
          editor.registry.register({
            type: 'Mixer',
            title: 'Mixer',
            pins: [{ kind: 'data', direction: 'out', type: 'float', label: 'Out' }],
            widgets: [{ id: 'gain', label: 'Gain', type: 'custom', renderer: 'level', key: 'gain', height: 30 }],
          })
          const node = editor.registry.instantiate('Mixer', { x: 0, y: 0 })
          node.state['gain'] = 0.6
          editor.addNode(node)
          nodeIdRef.current = node.id
          editor.fitView({ padding: 90, maxZoom: 1 })
        }}
      >
        <XenolithPanel position="top-right" style={{ width: 220 }}>
          <h3>Live value (in React)</h3>
          <p className="muted">The canvas widget commits through the editor; <code>onWidgetChange</code> hands the value back to React.</p>
          <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--xeno-accent)' }}>{Math.round(gain * 100)}%</div>
          <input type="range" min={0} max={1} step={0.01} value={gain} style={{ width: '100%' }}
            onChange={(e) => editorRef.current?.setWidgetValue(nodeIdRef.current!, 'gain', e.target.valueAsNumber)} />
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}
