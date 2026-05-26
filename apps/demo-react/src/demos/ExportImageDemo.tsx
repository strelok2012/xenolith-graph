import { useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, XenolithControls, useXenolithEditor } from '@xenolith/react'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

// Showcase: render the whole graph to an image. editor.exportImage() draws every node (not just the
// visible viewport) into an offscreen canvas at any scale and hands back a Blob — PNG for crisp UI,
// JPG for smaller files, 2× for retina. Download it straight from the panel.

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function ExportPanel(): React.ReactElement {
  const editor = useXenolithEditor()
  const [busy, setBusy] = useState(false)
  const exportAs = async (format: 'png' | 'jpeg', scale: number): Promise<void> => {
    if (!editor || busy) return
    setBusy(true)
    try {
      const blob = await editor.exportImage({ format, scale, padding: 48 })
      download(blob, `graph@${scale}x.${format === 'jpeg' ? 'jpg' : 'png'}`)
    } finally { setBusy(false) }
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
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={(editor) => loadDemo(editor)}>
        <XenolithControls position="bottom-left" />
        <ExportPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
