import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, XenolithControls, XenolithMiniMap } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { buildCompute, type ComputeHandle, type ComputeMetrics } from './build-compute.js'

// `?engine=compute` — the fairqueue model as a VISIBLE node program (the runtime plugin's
// primitives). Kept apart from the domain demo (App.tsx) so neither pollutes the other.
export function ComputeApp() {
  const handle = useRef<ComputeHandle | null>(null)
  const [m, setM] = useState<ComputeMetrics | null>(null)

  const onReady = (editor: XenolithEditor): void => {
    const h = buildCompute(editor)
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
        <strong style={{ fontSize: 13 }}>Runtime · model as nodes</strong>
        <span style={{ fontSize: 10, color: 'var(--xeno-muted)', marginTop: -6 }}>fairqueue built from @xenolith/plugin-runtime primitives</span>
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
          The VM runs the graph on screen — salary → Allocate → tax, feeding back through Set/Get variables. Press <b>Tab</b> to add primitives; rewire to change the model live.
        </span>
      </XenolithPanel>

      <XenolithPanel position="top-right" style={{ width: 210 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 13 }}>VM variables</h3>
        <p style={{ margin: '0 0 8px', fontSize: 10, color: 'var(--xeno-muted)', lineHeight: 1.4 }}>
          What <b>Get</b> reads / <b>Set</b> writes (seeded by the host; <code>priorities</code> feeds back each tick).
        </p>
        <div style={{ fontSize: 11, color: 'var(--xeno-muted)' }}>priorities</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 }}>
          {(m?.vars.priorities ?? []).map((v, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--xeno-muted)' }}>p[{i}]</span>
              <span style={{ color: 'var(--xeno-text)' }}>{v >= 0 ? '+' : ''}{v.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <VarRow label="awards (last tick)" value={m ? String(m.vars.lastAwards) : '—'} />
        <VarRow label="leftovers (last tick)" value={m ? String(m.vars.lastLeftovers) : '—'} />
      </XenolithPanel>
    </XenolithGraph>
  )
}

function VarRow(props: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 2 }}>
      <span style={{ color: 'var(--xeno-muted)' }}>{props.label}</span>
      <span style={{ color: 'var(--xeno-accent)' }}>{props.value}</span>
    </div>
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
