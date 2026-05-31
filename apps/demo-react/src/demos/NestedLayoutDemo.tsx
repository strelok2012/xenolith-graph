import { useState } from 'react'
import type { XenolithEditor } from '@xenolith/editor'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import { buildNestedLayout, type LayoutEngineId, type NestedLayoutScene } from '@xenolith/demo/nested-layout'
import { DemoStage } from '../Layout.js'

/** Island: Nested Auto-Layout. Same graph, two engines: ELK (hierarchical, keeps children inside
 *  their parent macro) vs dagre (flat, ignores `parent` — visibly worse on nested graphs). */
export function NestedLayoutDemo() {
  const [scene, setScene] = useState<NestedLayoutScene | null>(null)
  const [engine, setEngineState] = useState<LayoutEngineId>('elk')
  const [busy, setBusy] = useState(false)

  const onReady = (editor: XenolithEditor): void => { setScene(buildNestedLayout(editor)) }

  const run = async (): Promise<void> => {
    if (!scene || busy) return
    setBusy(true)
    try { await scene.arrange() } finally { setBusy(false) }
  }
  const flip = async (next: LayoutEngineId): Promise<void> => {
    if (!scene) return
    setEngineState(next)
    scene.setEngine(next)
    await run()
  }

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', gap: 6, padding: 6 }}>
          <button onClick={() => run()} disabled={busy || !scene} style={btn(true)}>
            {busy ? 'Arranging…' : 'Auto-arrange'}
          </button>
          <button onClick={() => flip('elk')}   disabled={busy || !scene} style={btn(engine === 'elk')}>ELK</button>
          <button onClick={() => flip('dagre')} disabled={busy || !scene} style={btn(engine === 'dagre')}>dagre</button>
        </XenolithPanel>
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
