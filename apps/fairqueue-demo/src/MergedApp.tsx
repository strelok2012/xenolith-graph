import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, XenolithControls, XenolithMiniMap } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { buildMerged, type MergedHandle, type MergedMetrics } from './build-merged.js'
import { EngineSwitch } from './EngineSwitch.js'

// `?engine=merged` — the two demos as one: Agents/Goodies are real editable nodes inside the
// algorithm graph. Add one with Tab, drag its slider, watch the sim react.
export function MergedApp() {
  const handle = useRef<MergedHandle | null>(null)
  const [m, setM] = useState<MergedMetrics | null>(null)

  const onReady = (editor: XenolithEditor): void => {
    const h = buildMerged(editor)
    handle.current = h
    h.onMetrics(setM)
    ;(window as unknown as { __fqEditor: XenolithEditor }).__fqEditor = editor
  }
  useEffect(() => () => handle.current?.dispose(), [])

  const running = m?.running ?? true

  return (
    <XenolithGraph className="xeno-host" resizeToWindow minimap onReady={onReady}>
      <XenolithControls position="bottom-left" />
      <XenolithMiniMap position="bottom-right" />

      <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 250 }}>
        <strong style={{ fontSize: 13 }}>Merged · agents are nodes</strong>
        <EngineSwitch current="merged" />
        <XenolithButton active={running} style={{ width: '100%' }}
          onClick={() => { if (running) handle.current?.pause(); else handle.current?.resume() }}>
          {running ? '■ Pause' : '▶ Run'}
        </XenolithButton>
        <div style={{ display: 'flex', gap: 16 }}>
          <Metric label="Step" value={m ? String(m.step) : '—'} />
          <Metric label="Mean priority" value={m ? m.meanPriority.toFixed(2) : '—'} />
          <Metric label="Warehouse" value={m ? String(m.warehouse) : '—'} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--xeno-muted)', lineHeight: 1.4 }}>
          Each <b>Agent</b>/<b>Goodie</b> is a real node — <b>Gather</b> scans them by type, so press <b>Tab</b> to add one and it joins the sim; drag its Salary/Cost slider to change the model live.
        </span>
      </XenolithPanel>
    </XenolithGraph>
  )
}

function Metric(props: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--xeno-muted)' }}>{props.label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--xeno-accent)' }}>{props.value}</div>
    </div>
  )
}
