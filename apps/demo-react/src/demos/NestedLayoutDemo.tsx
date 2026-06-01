import { useState } from 'react'
import { XenolithGraph, XenolithPanel, useEditor } from '@xenolith/react'
import { setupNestedLayout, runNestedLayout, type LayoutEngineId } from '@xenolith/demo/nested-layout'
import { DemoStage } from '../Layout.js'

// Canon: engine + busy state live in the panel; arrange dispatches against the editor returned
// by `useEditor()`. Two plugins (ELK + dagre) are installed in `onReady`; `runNestedLayout` picks
// the right one each call.

function NestedLayoutPanel() {
  const editor = useEditor()
  const [engine, setEngine] = useState<LayoutEngineId>('elk')
  const [busy, setBusy] = useState(false)

  const arrange = async (next: LayoutEngineId = engine): Promise<void> => {
    if (busy) return
    setBusy(true)
    try { await runNestedLayout(editor, next) } finally { setBusy(false) }
  }
  const flip = async (next: LayoutEngineId): Promise<void> => {
    setEngine(next)
    await arrange(next)
  }

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', gap: 6, padding: 6 }}>
      <button onClick={() => arrange()} disabled={busy} style={btn(true)}>
        {busy ? 'Arranging…' : 'Auto-arrange'}
      </button>
      <button onClick={() => flip('elk')}   disabled={busy} style={btn(engine === 'elk')}>ELK</button>
      <button onClick={() => flip('dagre')} disabled={busy} style={btn(engine === 'dagre')}>dagre</button>
    </XenolithPanel>
  )
}

/** Island: Nested Auto-Layout. ELK vs dagre on the same graph. */
export function NestedLayoutDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupNestedLayout}>
        <NestedLayoutPanel />
      </XenolithGraph>
    </DemoStage>
  )
}

const btn = (primary: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${primary ? 'var(--xeno-accent, #FCB400)' : 'var(--xeno-border, #333)'}`,
  background: primary ? 'var(--xeno-accent, #FCB400)' : 'var(--xeno-panel, #1d1d1d)',
  color: primary ? 'var(--xeno-canvas, #111)' : 'var(--xeno-text, #cfcfcf)',
  cursor: 'pointer',
})
