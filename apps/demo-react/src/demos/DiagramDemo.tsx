import { useRef, useState } from 'react'
import { XenolithGraph, XenolithControls, XenolithPanel, XenolithButton, useXenolithEditor } from '@xenolith/react'
import { buildDiagram, type DiagramHandle } from '@xenolith/demo/diagram'
import { DemoStage } from '../Layout.js'

// Showcase: edges as a diagramming primitive. Text nodes wired with directional edges — arrowhead
// markers, edge labels (pass / fail / retry), and an animated flowing dash on the main path. All the
// graph wiring lives in @xenolith/demo/diagram; React only adds the toggle panel.

function DiagramPanel({ handle }: { handle: React.RefObject<DiagramHandle | null> }): React.ReactElement {
  useXenolithEditor()
  const [animated, setAnimated] = useState(true)
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 200 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Diagram edges</p>
      <XenolithButton
        active={animated}
        style={{ width: '100%' }}
        onClick={() => { const next = !animated; setAnimated(next); handle.current?.setAnimated(next) }}
      >
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
  const handle = useRef<DiagramHandle | null>(null)
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={(editor) => { handle.current = buildDiagram(editor) }}>
        <XenolithControls position="bottom-left" />
        <DiagramPanel handle={handle} />
      </XenolithGraph>
    </DemoStage>
  )
}
