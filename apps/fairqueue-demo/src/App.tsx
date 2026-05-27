import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, XenolithControls, XenolithMiniMap } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { buildFairqueue, type FairqueueHandle, type Metrics } from './build-fairqueue.js'

function Slider(props: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'block', fontSize: 11, color: 'var(--xeno-muted)' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{props.label}</span>
        <span style={{ color: 'var(--xeno-text)' }}>{props.value}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        style={{ width: '100%' }}
        onChange={(e) => props.onChange(e.target.valueAsNumber)}
      />
    </label>
  )
}

export function App() {
  const handle = useRef<FairqueueHandle | null>(null)
  const [m, setM] = useState<Metrics | null>(null)
  const [salary, setSalary] = useState(1)
  const [alpha, setAlpha] = useState(0.12)
  const [cost, setCost] = useState(3)
  const [rate, setRate] = useState(2)

  const onReady = (editor: XenolithEditor): void => {
    const h = buildFairqueue(editor)
    handle.current = h
    h.onMetrics(setM)
  }
  useEffect(() => () => handle.current?.dispose(), [])

  const running = m?.running ?? true

  return (
    <XenolithGraph className="xeno-host" resizeToWindow minimap onReady={onReady}>
      <XenolithControls position="bottom-left" />
      <XenolithMiniMap position="bottom-right" />

      <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
        <strong style={{ fontSize: 13 }}>Priority queue · ништяки</strong>
        <Slider label="Salary / step" min={0} max={4} step={0.1} value={salary}
          onChange={(v) => { setSalary(v); handle.current?.setSalary(v) }} />
        <Slider label="Tax α (mean-reversion)" min={0} max={0.6} step={0.01} value={alpha}
          onChange={(v) => { setAlpha(v); handle.current?.setTaxAlpha(v) }} />
        <Slider label="Goodie cost" min={1} max={10} step={0.5} value={cost}
          onChange={(v) => { setCost(v); handle.current?.setCost(v) }} />
        <Slider label="Goodies / step" min={0} max={6} step={1} value={rate}
          onChange={(v) => { setRate(v); handle.current?.setRate(v) }} />
        <div style={{ display: 'flex', gap: 6 }}>
          <XenolithButton active={running} style={{ flex: 1 }}
            onClick={() => { running ? handle.current?.pause() : handle.current?.resume() }}>
            {running ? '■ Pause' : '▶ Run'}
          </XenolithButton>
          <XenolithButton disabled={running} style={{ flex: 1 }} onClick={() => handle.current?.stepOnce()}>
            Step ›
          </XenolithButton>
        </div>
        <span style={{ fontSize: 11, color: 'var(--xeno-muted)', lineHeight: 1.4 }}>
          Drag any agent's bar up or down — the log-tax relaxes it back toward 1.0× equilibrium.
        </span>
      </XenolithPanel>

      <XenolithPanel position="top-right" style={{ width: 170 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Live metrics</h3>
        <Metric label="Step" value={m ? String(m.step) : '—'} />
        <Metric label="Mean priority" value={m ? m.meanPriority.toFixed(2) : '—'} />
        <Metric label="Fairness (Gini)" value={m ? m.gini.toFixed(3) : '—'} hint="0 = perfectly fair" />
      </XenolithPanel>
    </XenolithGraph>
  )
}

function Metric(props: { label: string; value: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: 'var(--xeno-muted)' }}>{props.label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--xeno-accent)' }}>{props.value}</div>
      {props.hint && <div style={{ fontSize: 10, color: 'var(--xeno-muted)' }}>{props.hint}</div>}
    </div>
  )
}
