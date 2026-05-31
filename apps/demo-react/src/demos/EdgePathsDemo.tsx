import { useState } from 'react'
import type { XenolithEditor } from '@xenolith/editor'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import { buildEdgePaths, type EdgePathsScene } from '@xenolith/demo/edge-paths'
import type { EdgePathStyle } from '@xenolith/render-pixi'
import { DemoStage } from '../Layout.js'

const STYLES: EdgePathStyle[] = ['bezier', 'smoothstep', 'step', 'linear']

/** Island: G9 — edge path styles. The default Xenolith bezier still ships untouched; new styles
 *  (step / smoothstep / linear) opt in via `editor.setEdgeOptions(id, { pathStyle })`. */
export function EdgePathsDemo() {
  const [scene, setScene] = useState<EdgePathsScene | null>(null)
  const [active, setActive] = useState<EdgePathStyle | 'each'>('each')
  const onReady = (editor: XenolithEditor): void => { setScene(buildEdgePaths(editor)) }
  const flip = (s: EdgePathStyle | 'each'): void => {
    if (!scene) return
    setActive(s)
    if (s === 'each') { for (const style of STYLES) scene.setAll(style); /* visual: rebuild per-row */ }
    else scene.setAll(s)
  }
  // 'each' is the initial view (per-row distinct styles). After clicking a single-style button,
  // re-clicking 'each' would need a re-mount to restore the per-row palette — keep it simple
  // and rebuild via the reset button instead.
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--xeno-muted, #999)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Apply to all</div>
          {STYLES.map((s) => (
            <button key={s} onClick={() => flip(s)} disabled={!scene} style={btn(active === s)}>{s}</button>
          ))}
        </XenolithPanel>
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
