import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import type { XenolithEditor, WidgetSpec } from '@xenolith/editor'
import type { NodeId } from '@xenolith/core'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

const SIDE_PANEL = { width: 260, maxHeight: 'calc(100% - 24px)', overflowY: 'auto' as const }

/** Island: two-way binding. An in-editor inspector panel edits the selected node's widget values via
 *  editor.setWidgetValue; editing inside the editor fires widget:changed and updates the form. */
export function BindingDemo() {
  const editorRef = useRef<XenolithEditor | null>(null)
  const [nodeId, setNodeId] = useState<NodeId | null>(null)
  const [, bump] = useState(0) // re-read editor values when they change

  const ed = editorRef.current
  const node = ed && nodeId ? ed.graph.getNode(nodeId) : undefined
  // Canvas/custom widgets are bindable too — their value lives in node.state[key].
  const widgets = (node?.widgets ?? []).filter((w) => w.key !== undefined)

  const set = (w: WidgetSpec, value: unknown): void => { ed?.setWidgetValue(nodeId!, w.id, value); bump((n) => n + 1) }

  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={(e) => { editorRef.current = e; loadDemo(e) }}
        onSelectionChange={(e) => setNodeId(e.nodeIds[0] ?? null)}
        onWidgetChange={() => bump((n) => n + 1)}
      >
        <XenolithPanel position="top-right" style={SIDE_PANEL}>
          <h3>Inspector</h3>
          {!node && <p className="muted">Select a node to edit its widgets.</p>}
          {node && widgets.length === 0 && <p className="muted">This node has no editable widgets.</p>}
          {node && widgets.map((w) => {
            const v = ed!.getWidgetValue(nodeId!, w.id)
            return (
              <label key={w.id} className="field">
                <span>{w.label}</span>
                {(w.type === 'slider' || w.type === 'number') && (
                  <input type="range" min={'min' in w ? w.min : 0} max={'max' in w ? w.max : 1}
                    step={w.type === 'slider' ? (w.step ?? 0.01) : (w.step ?? 1)}
                    value={Number(v) || 0} onChange={(e) => set(w, e.target.valueAsNumber)} />
                )}
                {w.type === 'text' && (
                  <input type="text" value={String(v ?? '')} onChange={(e) => set(w, e.target.value)} />
                )}
                {w.type === 'toggle' && (
                  <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(w, e.target.checked)} />
                )}
                {w.type === 'color' && (
                  <input type="color" value={String(v ?? '#000000')} onChange={(e) => set(w, e.target.value)} />
                )}
                {w.type === 'combo' && (
                  <select value={String(v)} onChange={(e) => set(w, e.target.value)}>
                    {w.values.map((o) => {
                      const val = typeof o === 'string' ? o : o.value
                      const lab = typeof o === 'string' ? o : o.label
                      return <option key={String(val)} value={String(val)}>{lab}</option>
                    })}
                  </select>
                )}
                {w.type === 'custom' && (
                  typeof v === 'number'
                    ? <input type="number" step={0.01} value={v} onChange={(e) => set(w, e.target.valueAsNumber)} />
                    : <JsonField value={v} onCommit={(parsed) => set(w, parsed)} />
                )}
                {(w.type === 'slider' || w.type === 'number') && <em>{String(v)}</em>}
              </label>
            )
          })}
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}

/** Editable JSON for a custom widget's value — proves two-way binding works for ANY shape (curve
 *  points, an {x,y} pad, …). Type valid JSON and blur to commit via setWidgetValue; the canvas
 *  widget updates live. While the field is focused, external editor edits don't clobber your text. */
function JsonField({ value, onCommit }: { value: unknown; onCommit: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null))
  const [err, setErr] = useState(false)
  const focused = useRef(false)
  useEffect(() => { if (!focused.current) { setText(JSON.stringify(value ?? null)); setErr(false) } }, [value])
  return (
    <textarea
      className={`json-edit${err ? ' err' : ''}`}
      rows={2}
      spellCheck={false}
      value={text}
      onFocus={() => { focused.current = true }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { focused.current = false; try { onCommit(JSON.parse(text)); setErr(false) } catch { setErr(true) } }}
    />
  )
}
