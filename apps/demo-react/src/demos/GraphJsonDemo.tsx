import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useXenolithEditor, useGraphJSON } from '@xenolith/react'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

const SIDE_PANEL = { width: 380, height: 'calc(100% - 24px)', display: 'flex', flexDirection: 'column' as const, gap: 8 }

/** The WHOLE graph as state — driven by the `useGraphJSON()` hook. The hook re-emits the serialized
 *  xenolith.v1 on any canvas change (move, connect, widget edit, undo/redo); Apply feeds it back via
 *  loadJSON. No manual event wiring — that's the point of the hook. */
function JsonPanel() {
  const editor = useXenolithEditor()
  const json = useGraphJSON()
  const [text, setText] = useState('')
  const [err, setErr] = useState(false)
  const focused = useRef(false)

  // Mirror the live graph into the textarea — unless the user is mid-edit (don't clobber their typing).
  useEffect(() => {
    if (json && !focused.current) { setText(JSON.stringify(json, null, 2)); setErr(false) }
  }, [json])

  const apply = (): void => {
    if (!editor) return
    try {
      editor.loadJSON(JSON.parse(text))
      editor.fitView({ padding: 48, maxZoom: 1 })
      focused.current = false
      setErr(false)
    } catch { setErr(true) }
  }

  return (
    <XenolithPanel position="top-right" style={SIDE_PANEL}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <XenolithButton active onClick={apply}>Apply JSON →</XenolithButton>
        {err && <span style={{ color: '#e06c5b', fontSize: 12 }}>Invalid JSON</span>}
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Powered by <code>useGraphJSON()</code> — edits on the canvas refresh this live; hit Apply to rebuild.
      </p>
      <textarea
        className={`graph-json${err ? ' err' : ''}`}
        style={{ flex: 1 }}
        spellCheck={false}
        value={text}
        onFocus={() => { focused.current = true }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { focused.current = false }}
      />
    </XenolithPanel>
  )
}

/** Island: the whole graph as state via the `useGraphJSON()` hook (no hand-wired event callbacks). */
export function GraphJsonDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={loadDemo}>
        <JsonPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
