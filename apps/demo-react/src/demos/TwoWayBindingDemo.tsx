import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useEditor, useSelection, useGraphJSON } from '@xenolith/react'
import type { WidgetSpec } from '@xenolith/editor'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

const note: React.CSSProperties = { margin: 0, fontSize: 11.5, color: 'var(--xeno-muted)' }

/** Widget-level binding via `useSelection`: edit the selected node's widgets; canvas edits flow back
 *  (widget:changed re-renders). */
function Inspector() {
  const editor = useEditor()
  const selection = useSelection()
  const [, bump] = useState(0)
  useEffect(() => editor.on('widget:changed', () => bump((n) => n + 1)), [editor])
  const nodeId = selection[0] ?? null
  const node = nodeId ? editor.graph.getNode(nodeId) : undefined
  const widgets = (node?.widgets ?? []).filter((w) => w.key !== undefined)
  const set = (w: WidgetSpec, value: unknown): void => { editor.setWidgetValue(nodeId!, w.id, value); bump((n) => n + 1) }

  return (
    <XenolithPanel position="top-right" style={{ width: 232, maxHeight: 'calc(100% - 24px)', overflowY: 'auto' }}>
      <h3>Inspector</h3>
      <p style={note}>useSelection() → widgets</p>
      {!node && <p className="muted">Select a node.</p>}
      {node && widgets.length === 0 && <p className="muted">No editable widgets.</p>}
      {node && widgets.map((w) => {
        const v = editor.getWidgetValue(nodeId!, w.id)
        return (
          <label key={w.id} className="field">
            <span>{w.label}</span>
            {(w.type === 'slider' || w.type === 'number') && (
              <input type="range" min={'min' in w ? w.min : 0} max={'max' in w ? w.max : 1}
                step={w.type === 'slider' ? (w.step ?? 0.01) : (w.step ?? 1)}
                value={Number(v) || 0} onChange={(e) => set(w, e.target.valueAsNumber)} />
            )}
            {w.type === 'text' && <input type="text" value={String(v ?? '')} onChange={(e) => set(w, e.target.value)} />}
            {w.type === 'toggle' && <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(w, e.target.checked)} />}
            {w.type === 'color' && <input type="color" value={String(v ?? '#000000')} onChange={(e) => set(w, e.target.value)} />}
            {w.type === 'combo' && (
              <select value={String(v)} onChange={(e) => set(w, e.target.value)}>
                {w.values.map((o) => {
                  const val = typeof o === 'string' ? o : o.value
                  const lab = typeof o === 'string' ? o : o.label
                  return <option key={String(val)} value={String(val)}>{lab}</option>
                })}
              </select>
            )}
            {(w.type === 'slider' || w.type === 'number') && <em>{String(v)}</em>}
          </label>
        )
      })}
    </XenolithPanel>
  )
}

/** Graph-level binding via `useGraphJSON`: the whole graph ⇄ xenolith.v1 JSON; Apply rebuilds it. */
function JsonPanel() {
  const editor = useEditor()
  const json = useGraphJSON()
  const [text, setText] = useState('')
  const [err, setErr] = useState(false)
  const focused = useRef(false)
  useEffect(() => { if (json && !focused.current) { setText(JSON.stringify(json, null, 2)); setErr(false) } }, [json])
  const apply = (): void => {
    try { editor.loadJSON(JSON.parse(text)); editor.fitView({ padding: 48, maxZoom: 1 }); focused.current = false; setErr(false) }
    catch { setErr(true) }
  }
  return (
    <XenolithPanel position="top-left" style={{ width: 340, height: 'calc(100% - 24px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <XenolithButton active onClick={apply}>Apply JSON →</XenolithButton>
        {err && <span style={{ color: '#e06c5b', fontSize: 12 }}>Invalid JSON</span>}
      </div>
      <p style={note}>useGraphJSON() → the whole graph as state</p>
      <textarea className={`graph-json${err ? ' err' : ''}`} style={{ flex: 1 }} spellCheck={false}
        value={text} onFocus={() => { focused.current = true }} onChange={(e) => setText(e.target.value)} onBlur={() => { focused.current = false }} />
    </XenolithPanel>
  )
}

/** Island: BOTH binding levels via hooks — widgets (useSelection) and the whole graph (useGraphJSON).
 *  No hand-wired event plumbing; the editor stays the single source of truth. */
export function TwoWayBindingDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={loadDemo}>
        <JsonPanel />
        <Inspector />
      </XenolithGraph>
    </DemoStage>
  )
}
