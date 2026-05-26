import { useState } from 'react'
import {
  XenolithGraph, XenolithControls, XenolithPanel, XenolithButton, XenolithMiniMap,
  useNodes, useEdges, useViewport,
} from '@xenolith/react'
import type { MinimapPosition } from '@xenolith/editor'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

// Live readout driven by the reactive hooks — counts re-render on add/remove, zoom on pan/zoom.
function Stats() {
  const nodes = useNodes()
  const edges = useEdges()
  const vp = useViewport()
  return (
    <XenolithPanel position="bottom-left" style={{ padding: '6px 10px', fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: 'var(--xeno-accent)' }}>{nodes.length}</span> nodes ·{' '}
      <span style={{ color: 'var(--xeno-accent)' }}>{edges.length}</span> edges ·{' '}
      <span style={{ color: 'var(--xeno-accent)' }}>{Math.round(vp.zoom * 100)}%</span>
    </XenolithPanel>
  )
}

// 3×3 grid of minimap anchors (centre toggles visibility).
const GRID: (MinimapPosition | 'center')[] = [
  'top-left', 'top', 'top-right',
  'left', 'center', 'right',
  'bottom-left', 'bottom', 'bottom-right',
]
const ARROW: Record<string, string> = {
  'top-left': '↖', top: '↑', 'top-right': '↗', left: '←', right: '→',
  'bottom-left': '↙', bottom: '↓', 'bottom-right': '↘',
}
const label: React.CSSProperties = {
  margin: '0 0 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)',
}
const cellBtn: React.CSSProperties = { width: 34, height: 30, padding: 0, display: 'grid', placeItems: 'center', fontSize: 14 }

// Everything — controls and the minimap panel — lives *inside* the editor as overlay panels. Buttons
// inherit the active theme through the editor's --xeno-* CSS vars (gold in Xen, cyan in Liquid Glass).
export function ViewportDemo() {
  const [on, setOn] = useState(true)
  const [pos, setPos] = useState<MinimapPosition>('bottom-right')

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={(e) => loadDemo(e)}>
        <XenolithControls position="top-right" orientation="horizontal" />

        <XenolithPanel position="top-left" style={{ minWidth: 150 }}>
          <p style={label}>Minimap</p>
          <XenolithButton active={on} onClick={() => setOn((v) => !v)} style={{ width: '100%' }}>
            {on ? 'Visible' : 'Hidden'}
          </XenolithButton>

          <p style={{ ...label, marginTop: 14 }}>Position</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 6 }}>
            {GRID.map((cell) =>
              cell === 'center' ? (
                <XenolithButton key="c" title="toggle" style={{ ...cellBtn, color: 'var(--xeno-muted)' }} onClick={() => setOn((v) => !v)}>⊙</XenolithButton>
              ) : (
                <XenolithButton
                  key={cell as string}
                  active={on && pos === cell}
                  disabled={!on}
                  title={cell as string}
                  style={{ ...cellBtn, opacity: on ? 1 : 0.35 }}
                  onClick={() => setPos(cell)}
                >{ARROW[cell as string]}</XenolithButton>
              ),
            )}
          </div>
        </XenolithPanel>

        {on && <XenolithMiniMap position={pos} />}
        <Stats />
      </XenolithGraph>
    </DemoStage>
  )
}
