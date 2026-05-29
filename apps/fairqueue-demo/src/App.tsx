import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, XenolithControls, XenolithMiniMap } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { buildFairqueue, type FairqueueHandle, type Metrics } from './build-fairqueue.js'
import { buildFairqueueRuntime } from './build-fairqueue-runtime.js'
import { SaveMenu } from './SaveMenu.js'

// Two engines compute the SAME demo: the native step() reference, or the plugin-runtime VM. They
// behave identically; this lets you eyeball-compare them. Pick via `?engine=js` (default) or
// `?engine=runtime`. The third top-level view, `?engine=merged`, is handled in main.tsx.
const USE_RUNTIME = new URLSearchParams(globalThis.location?.search ?? '').get('engine') === 'runtime'

import { EngineSwitch } from './EngineSwitch.js'

export function App() {
  const handle = useRef<FairqueueHandle | null>(null)
  const [m, setM] = useState<Metrics | null>(null)

  const onReady = (editor: XenolithEditor): void => {
    const h = (USE_RUNTIME ? buildFairqueueRuntime : buildFairqueue)(editor)
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

      <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 220 }}>
        <strong style={{ fontSize: 13 }}>Priority queue · ништяки</strong>
        <EngineSwitch current={USE_RUNTIME ? 'runtime' : 'js'} />
        <div style={{ display: 'flex', gap: 6 }}>
          <XenolithButton active={running} style={{ flex: 1 }}
            onClick={() => { running ? handle.current?.pause() : handle.current?.resume() }}>
            {running ? '■ Pause' : '▶ Run'}
          </XenolithButton>
          <XenolithButton disabled={running} style={{ flex: 1 }} onClick={() => handle.current?.stepOnce()}>
            Step ›
          </XenolithButton>
        </div>
        <SaveMenu />
        <span style={{ fontSize: 11, color: 'var(--xeno-muted)', lineHeight: 1.4 }}>
          Press <b>Tab</b> to add an Agent or Goodie. Wire a <b>goodie → agent</b> to subscribe it; remove the wire to unsubscribe. A goodie with no subscriber piles up in the <b>Warehouse</b>. Salary (per agent), Cost / Spawn (per goodie) and the tax <b>α</b> (in the <b>Government</b> node) are all edited in the nodes. Drag an agent's bar to perturb it — the Government relaxes it back toward 0.
        </span>
      </XenolithPanel>

      <XenolithPanel position="top-right" style={{ width: 170 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Live metrics</h3>
        <Metric label="Step" value={m ? String(m.step) : '—'} />
        <Metric label="Mean priority" value={m ? m.meanPriority.toFixed(2) : '—'} />
        <Metric label="Fairness (Gini)" value={m ? m.gini.toFixed(3) : '—'} hint="0 = perfectly fair" />
        <Metric label="Warehouse" value={m ? String(m.warehouse) : '—'} hint="unclaimed goodies" />
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
