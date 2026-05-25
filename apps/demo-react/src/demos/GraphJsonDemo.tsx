import { useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

const SIDE_PANEL = { width: 380, height: 'calc(100% - 24px)', display: 'flex', flexDirection: 'column' as const, gap: 8 }

/** Island: the WHOLE graph as state, in an in-editor panel. editor.toJSON() ⇄ editor.loadJSON() —
 *  edit the serialized xenolith.v1 JSON and Apply to rebuild the canvas; any canvas change refreshes
 *  the JSON live. */
export function GraphJsonDemo() {
  const editorRef = useRef<XenolithEditor | null>(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState(false)
  const focused = useRef(false)

  const refresh = (): void => {
    const e = editorRef.current
    if (e && !focused.current) { setText(JSON.stringify(e.toJSON(), null, 2)); setErr(false) }
  }
  const apply = (): void => {
    const e = editorRef.current
    if (!e) return
    try {
      e.loadJSON(JSON.parse(text))
      e.fitView({ padding: 48, maxZoom: 1 })
      focused.current = false
      setText(JSON.stringify(e.toJSON(), null, 2))
      setErr(false)
    } catch { setErr(true) }
  }

  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={(e) => { editorRef.current = e; loadDemo(e); refresh() }}
        onGraphLoad={refresh}
        onNodeAdded={refresh}
        onNodeRemoved={refresh}
        onNodeMoved={refresh}
        onEdgeConnected={refresh}
        onEdgeDisconnected={refresh}
        onWidgetChange={refresh}
      >
        <XenolithPanel position="top-right" style={SIDE_PANEL}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <XenolithButton active onClick={apply}>Apply JSON →</XenolithButton>
            {err && <span style={{ color: '#e06c5b', fontSize: 12 }}>Invalid JSON</span>}
          </div>
          <p className="muted" style={{ margin: 0 }}>Edit and hit Apply — the canvas rebuilds. Canvas edits (move, connect, widgets) refresh this live.</p>
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
      </XenolithGraph>
    </DemoStage>
  )
}
