import { useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, XenolithControls, useEditor } from '@xenolith/react'
import { loadDemo } from '@xenolith/demo/scene'
import { exportGraphImage } from '@xenolith/demo/export-image'
import { DemoStage } from '../Layout.js'

// Showcase: render the whole graph to an image. The export + download logic lives in the
// framework-agnostic core (@xenolith/demo/export-image); this React file is just the button panel.

function ExportPanel(): React.ReactElement {
  const editor = useEditor()
  const [busy, setBusy] = useState(false)
  const exportAs = async (format: 'png' | 'jpeg', scale: number): Promise<void> => {
    if (busy) return
    setBusy(true)
    try { await exportGraphImage(editor, format, scale) } finally { setBusy(false) }
  }
  const full = { width: '100%' }
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 190 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Export image</p>
      <XenolithButton style={full} disabled={busy} onClick={() => void exportAs('png', 1)}>↓ PNG · 1×</XenolithButton>
      <XenolithButton style={full} disabled={busy} onClick={() => void exportAs('png', 2)}>↓ PNG · 2× (retina)</XenolithButton>
      <XenolithButton style={full} disabled={busy} onClick={() => void exportAs('jpeg', 2)}>↓ JPG · 2×</XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.45 }}>
        Exports the entire graph, not just what’s on screen.
      </span>
    </XenolithPanel>
  )
}

/** Showcase: full-graph image export at any scale. */
export function ExportImageDemo(): React.ReactElement {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={loadDemo}>
        <XenolithControls position="bottom-left" />
        <ExportPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
