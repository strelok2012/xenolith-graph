import { useState } from 'react'
import type { XenolithEditor } from '@xenolith/editor'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import { buildAutoLayout, type AutoLayoutScene } from '@xenolith/demo/auto-layout'
import { DemoStage } from '../Layout.js'

type Direction = 'LR' | 'TB'

/** Island: Auto-Layout. Buttons in an in-editor panel re-arrange the messy DAG via the dagre
 *  engine; the LR/TB toggle re-runs the layout in the chosen direction. */
export function AutoLayoutDemo() {
  const [scene, setScene] = useState<AutoLayoutScene | null>(null)
  const [dir, setDir] = useState<Direction>('LR')
  const [busy, setBusy] = useState(false)

  const onReady = (editor: XenolithEditor): void => {
    setScene(buildAutoLayout(editor))
  }

  const run = async (next: Direction = dir): Promise<void> => {
    if (!scene || busy) return
    setBusy(true)
    try { await scene.arrange({ direction: next }) } finally { setBusy(false) }
  }

  const flip = async (next: Direction): Promise<void> => {
    setDir(next)
    await run(next)
  }

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', gap: 6, padding: 6 }}>
          <button onClick={() => run()} disabled={busy || !scene} style={btnStyle(true)}>
            {busy ? 'Arranging…' : 'Auto-arrange'}
          </button>
          <button onClick={() => flip('LR')} disabled={busy || !scene} style={btnStyle(dir === 'LR')}>LR</button>
          <button onClick={() => flip('TB')} disabled={busy || !scene} style={btnStyle(dir === 'TB')}>TB</button>
        </XenolithPanel>
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
