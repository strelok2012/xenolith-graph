import { useEffect, useRef, useState } from 'react'
import type { EngineBundle } from './engines.js'

interface Props {
  bundle: EngineBundle
  /** Controlled values map — owner (App) holds the source of truth so other UI (e.g. canvas)
   *  can read the same `max_iter` the user typed here. */
  values: Record<string, number>
  onChange: (next: Record<string, number>) => void
}

// Proves the graph is a real callable function: type values into the input fields, the WASM module
// runs synchronously on every change (debounced), output values show up below with the wall-clock
// time of the call. Shows the user "GraphInput is a function parameter, not magic".
export function InputsPanel({ bundle, values, onChange }: Props) {
  const [result, setResult] = useState<{ outputs: Record<string, number>; ms: number } | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setResult(bundle.runOnce(values)) }, 80)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [values, bundle])

  if (bundle.inputs.length === 0 && bundle.outputs.length === 0) {
    return <div style={{ fontSize: 11, color: '#888' }}>No GraphInput/GraphOutput nodes — add some to enable the inputs panel.</div>
  }

  const sigSrc = `tickArgs(${bundle.inputs.join(', ')}) → ${bundle.outputs[0] ?? '()'}`

  return (
    <fieldset style={fieldsetStyle}>
      <legend style={legendStyle}>call the graph as a function</legend>
      <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11, color: '#888', marginBottom: 8 }}>{sigSrc}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
        {bundle.inputs.map((name) => (
          <Row key={name} label={name}>
            <input
              type="number"
              step={name === 'max_iter' ? 10 : 0.05}
              value={values[name] ?? 0}
              onChange={(ev) => { const n = Number(ev.target.value); onChange({ ...values, [name]: Number.isFinite(n) ? n : 0 }) }}
              style={inputStyle}
            />
          </Row>
        ))}
      </div>

      <hr style={{ border: 0, borderTop: '1px dashed #2a2828', margin: '12px 0 10px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center' }}>
        {bundle.outputs.map((name) => (
          <Row key={name} label={name} accent>
            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13, color: '#e6c87a' }}>
              {result?.outputs[name] !== undefined ? fmtNum(result.outputs[name]!) : '—'}
            </span>
          </Row>
        ))}
      </div>

      <div style={{ fontSize: 10, color: '#666', marginTop: 8, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
        {result ? `1 call · ${result.ms.toFixed(3)} ms (host↔WASM round-trip)` : 'computing…'}
      </div>
    </fieldset>
  )
}

function Row({ label, accent, children }: { label: string; accent?: boolean; children: React.ReactNode }) {
  return (
    <>
      <label style={{ fontSize: 11, color: accent ? '#e6c87a' : '#cfcfcf', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{label}</label>
      <div>{children}</div>
    </>
  )
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return String(v)
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(6).replace(/\.?0+$/, '')
}

const fieldsetStyle: React.CSSProperties = { border: '1px solid #2a2828', borderRadius: 6, padding: 12, margin: 0 }
const legendStyle: React.CSSProperties   = { padding: '0 6px', fontSize: 11, color: '#888' }
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#0f0e0d', border: '1px solid #2a2828', borderRadius: 4,
  color: '#cfcfcf', padding: '5px 8px', fontSize: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
}
