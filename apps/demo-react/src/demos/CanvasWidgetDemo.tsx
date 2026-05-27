import { useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import type { XenolithEditor, NodeId } from '@xenolith/editor'
import { buildCanvasWidget } from '@xenolith/demo/canvas-widget'
import { DemoStage } from '../Layout.js'

// The simplest custom widget — a click/drag level bar — lives in the framework-agnostic core
// (@xenolith/demo/canvas-widget): two functions, no DOM. This React file registers it via the core,
// then catches the value through onWidgetChange and shows it (and a slider that writes it back).
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
          nodeIdRef.current = buildCanvasWidget(editor).nodeId
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
