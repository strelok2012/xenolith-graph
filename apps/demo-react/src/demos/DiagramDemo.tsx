import { useEffect, useState } from 'react'
import { XenolithGraph, XenolithControls, XenolithPanel, XenolithButton, useEditor } from '@xenolith/react'
import { buildDiagram } from '@xenolith/demo/diagram'
import { DemoStage } from '../Layout.js'

// Showcase: edges as a diagramming primitive. Text nodes wired with directional edges — arrowhead
// markers, edge labels (pass / fail / retry), and an animated flowing dash on the main path.
//
// Canon: state lives where it's used. The panel owns `animated` AND owns the side-effect that
// pushes it into the editor, because the panel IS inside <XenolithGraph> — `useEditor()` gives
// it the editor directly. No state hoisting, no render-less sync component, no ref dance.

function DiagramPanel() {
  const editor = useEditor()
  const [animated, setAnimated] = useState(true)
  useEffect(() => {
    for (const e of editor.graph.edges()) editor.setEdgeOptions(e.id, { animated })
  }, [editor, animated])
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 200 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Diagram edges</p>
      <XenolithButton active={animated} style={{ width: '100%' }} onClick={() => setAnimated(!animated)}>
        {animated ? '⏸ Stop flow' : '▶ Animate flow'}
      </XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.45 }}>
        Directional edges with arrowheads + labels. The main path animates a flowing dash.
      </span>
    </XenolithPanel>
  )
}

/** Showcase: flowchart-style directional edges (markers, labels, animation). */
export function DiagramDemo(): React.ReactElement {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={buildDiagram}>
        <XenolithControls position="bottom-left" />
        <DiagramPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
