import { useState } from 'react'
import { XenolithGraph, XenolithPanel, useEditor } from '@xenolith/react'
import { setupAutoLayout, runAutoLayout } from '@xenolith/demo/auto-layout'
import { DemoStage } from '../Layout.js'

type Direction = 'LR' | 'TB'

// Canon: direction lives in the panel (only the panel needs it), the panel calls runAutoLayout
// against `useEditor()` directly. No scene handle, no lifted state, no refs.

function AutoLayoutPanel() {
  const editor = useEditor()
  const [dir, setDir] = useState<Direction>('LR')
  const [busy, setBusy] = useState(false)

  const arrange = async (next: Direction = dir): Promise<void> => {
    if (busy) return
    setBusy(true)
    try { await runAutoLayout(editor, { direction: next }) } finally { setBusy(false) }
  }
  const flip = async (next: Direction): Promise<void> => {
    setDir(next)
    await arrange(next)
  }

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', gap: 6, padding: 6 }}>
      <button onClick={() => arrange()} disabled={busy} style={btnStyle(true)}>
        {busy ? 'Arranging…' : 'Auto-arrange'}
      </button>
      <button onClick={() => flip('LR')} disabled={busy} style={btnStyle(dir === 'LR')}>LR</button>
      <button onClick={() => flip('TB')} disabled={busy} style={btnStyle(dir === 'TB')}>TB</button>
    </XenolithPanel>
  )
}

/** Island: Auto-Layout. */
export function AutoLayoutDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupAutoLayout}>
        <AutoLayoutPanel />
      </XenolithGraph>
    </DemoStage>
  )
}

const btnStyle = (primary: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${primary ? 'var(--xeno-accent, #FCB400)' : 'var(--xeno-border, #333)'}`,
  background: primary ? 'var(--xeno-accent, #FCB400)' : 'var(--xeno-panel, #1d1d1d)',
  color: primary ? 'var(--xeno-canvas, #111)' : 'var(--xeno-text, #cfcfcf)',
  cursor: 'pointer',
})
