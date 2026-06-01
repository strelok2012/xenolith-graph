import { useState } from 'react'
import { XenolithGraph, XenolithPanel, useEditor } from '@xenolith/react'
import { setupEdgePaths, setAllEdgePaths, EDGE_PATH_STYLES } from '@xenolith/demo/edge-paths'
import type { EdgePathStyle } from '@xenolith/render-pixi'
import { DemoStage } from '../Layout.js'

// Canon: active style lives in the panel; flipping it dispatches through the editor directly.
// The initial 'each' view (per-row distinct styles) is what `setupEdgePaths` lays down — once
// the user picks a single style there's no going back without a re-mount, by design.

function EdgePathsPanel() {
  const editor = useEditor()
  const [active, setActive] = useState<EdgePathStyle | 'each'>('each')
  const flip = (s: EdgePathStyle): void => {
    setActive(s)
    setAllEdgePaths(editor, s)
  }
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, minWidth: 200 }}>
      <div style={{ fontSize: 11, color: 'var(--xeno-muted, #999)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Apply to all</div>
      {EDGE_PATH_STYLES.map((s) => (
        <button key={s} onClick={() => flip(s)} style={btn(active === s)}>{s}</button>
      ))}
    </XenolithPanel>
  )
}

/** Island: G9 — edge path styles. */
export function EdgePathsDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupEdgePaths}>
        <EdgePathsPanel />
      </XenolithGraph>
    </DemoStage>
  )
}

const btn = (on: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${on ? 'var(--xeno-accent, #FCB400)' : 'var(--xeno-border, #333)'}`,
  background: on ? 'var(--xeno-accent, #FCB400)' : 'transparent',
  color: on ? 'var(--xeno-canvas, #111)' : 'var(--xeno-text, #cfcfcf)',
  cursor: 'pointer',
  textAlign: 'left',
})
