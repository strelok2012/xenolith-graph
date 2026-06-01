import { useEffect, useState } from 'react'
import { XenolithGraph, XenolithPanel, useEditor } from '@xenolith/react'
import { setupTypeConversions, setConversionEnabled } from '@xenolith/demo/type-conversions'
import { DemoStage } from '../Layout.js'

// Canon: toggle + log live in the panel. `setupTypeConversions` runs in `onReady` (loads nodes,
// registers types, installs the pin-live-value provider). The panel owns:
//   • the boolean toggle state,
//   • the rolling event log (subscribed to `edge:connected` on the editor),
//   • the side-effecting call to `setConversionEnabled` that prepends a status line.

const STAMP = (): string => new Date().toISOString().slice(11, 19)

function TypeConversionsPanel() {
  const editor = useEditor()
  const [enabled, setEnabled] = useState(false)
  const [log, setLog] = useState<string[]>([
    `[${STAMP()}] No conversion registered. Try dragging from NumberSource.out to TextSink.in — refused.`,
  ])

  const append = (line: string): void => setLog((prev) => [...prev.slice(-39), `[${STAMP()}] ${line}`])

  useEffect(() => {
    return editor.on('edge:connected', (e) => {
      append(`✓ connected ${String(e.edge.id).slice(0, 6)} (number → text via cast)`)
    })
    // `editor` is stable for the lifetime of the panel (provider gates children on it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const toggle = (): void => {
    const next = !enabled
    const result = setConversionEnabled(editor, next)
    setEnabled(result.enabled)
    if (result.enabled) {
      append('✓ conversion number → text registered — try connecting the pins now')
    } else {
      const tail = result.droppedEdges > 0
        ? ` (dropped ${result.droppedEdges} stale edge${result.droppedEdges === 1 ? '' : 's'})`
        : ''
      append(`✗ conversion removed${tail} — try connecting again, it refuses`)
    }
  }

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, minWidth: 280 }}>
      <button onClick={toggle} style={btn(enabled)}>
        {enabled ? '✓ Conversion enabled' : 'Enable number → text cast'}
      </button>
      <div style={{ font: '11px/1.4 Menlo,monospace', maxHeight: 120, overflow: 'auto', padding: 6, background: 'rgba(0,0,0,0.3)', borderRadius: 4 }}>
        {log.slice(-6).map((l, i) => (
          <div key={i} style={{ color: l.includes('✗') ? '#f88' : l.includes('✓') ? '#9f9' : '#cfcfcf' }}>{l}</div>
        ))}
      </div>
    </XenolithPanel>
  )
}

/** Island: Type Conversions (G2 — Baklava parity). */
export function TypeConversionsDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupTypeConversions}>
        <TypeConversionsPanel />
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
