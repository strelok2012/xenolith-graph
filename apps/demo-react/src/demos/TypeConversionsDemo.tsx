import { useEffect, useState } from 'react'
import type { XenolithEditor } from '@xenolith/editor'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import { buildTypeConversions, type TypeConversionsScene } from '@xenolith/demo/type-conversions'
import { DemoStage } from '../Layout.js'

/** Island: Type Conversions (G2 — Baklava parity). Drag from NumberSource.out → TextSink.in:
 *  without the cast registered the connection refuses; click "Enable cast" and it forms, with
 *  the converted value displayed live on the sink's IN pin via the pin-live-value provider. */
export function TypeConversionsDemo() {
  const [scene, setScene] = useState<TypeConversionsScene | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [, force] = useState(0)

  useEffect(() => {
    if (!scene) return
    return scene.onLogChange(() => force((n) => n + 1))
  }, [scene])

  const onReady = (editor: XenolithEditor): void => { setScene(buildTypeConversions(editor)) }

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, minWidth: 280 }}>
          <button
            onClick={() => scene && setEnabled(scene.toggleConversion())}
            disabled={!scene}
            style={btn(enabled)}
          >
            {enabled ? '✓ Conversion enabled' : 'Enable number → text cast'}
          </button>
          <div style={{ font: '11px/1.4 Menlo,monospace', maxHeight: 120, overflow: 'auto', padding: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}>
            {scene?.log().slice(-6).map((l, i) => (
              <div key={i} style={{ color: l.startsWith('[') && l.includes('✗') ? '#f88' : l.includes('✓') ? '#9f9' : '#cfcfcf' }}>{l}</div>
            ))}
          </div>
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}

const btn = (on: boolean): React.CSSProperties => ({
  padding: '8px 12px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${on ? 'var(--xeno-accent, #FCB400)' : 'var(--xeno-border, #333)'}`,
  background: on ? 'var(--xeno-accent, #FCB400)' : 'var(--xeno-panel, #1d1d1d)',
  color: on ? 'var(--xeno-canvas, #111)' : 'var(--xeno-text, #cfcfcf)',
  cursor: 'pointer',
})
