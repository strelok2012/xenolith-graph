import { XenolithGraph, XenolithPanel, XenolithButton, useEditor, useNodes } from '@xenolith/react'
import { setupStressTest, addStressNodes } from '@xenolith/demo/stress-test'
import { DemoStage } from '../Layout.js'

// Perf flex: hundreds–thousands of WebGL nodes, pan/zoom at 60fps. The count is just
// `useNodes().length` — no handle, no manual setCount. Zoom floor is dropped so 10k+ nodes
// fit in view; minimap helps navigate when zoomed in.

function StressPanel() {
  const editor = useEditor()
  const nodes = useNodes()
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 168 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Stress test</p>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--xeno-accent)', fontVariantNumeric: 'tabular-nums' }}>
        {nodes.length}<span style={{ fontSize: 12, color: 'var(--xeno-muted)', fontWeight: 400 }}> nodes</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <XenolithButton onClick={() => addStressNodes(editor, 500)} style={{ flex: 1 }}>+500</XenolithButton>
        <XenolithButton onClick={() => addStressNodes(editor, 1000)} style={{ flex: 1 }}>+1000</XenolithButton>
      </div>
      <XenolithButton onClick={() => addStressNodes(editor, 5000)} style={{ width: '100%' }}>+5000</XenolithButton>
      <XenolithButton onClick={() => editor.clear()} style={{ width: '100%' }}>Reset</XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
        WebGL, render-on-demand. Live stats top-right.
      </span>
    </XenolithPanel>
  )
}

export function StressTestDemo() {
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        zoomBounds={[0.05, 2]}
        onReady={setupStressTest}
      >
        <StressPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
