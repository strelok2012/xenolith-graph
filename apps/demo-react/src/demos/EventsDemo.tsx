import { useState } from 'react'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

const SIDE_PANEL = { width: 280, maxHeight: 'calc(100% - 24px)', overflowY: 'auto' as const }

/** Island: typed event callbacks wired to React state — a live log + selection inspector, all in an
 *  in-editor panel. */
export function EventsDemo() {
  const [log, setLog] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [widgets, setWidgets] = useState<Record<string, unknown>>({})
  const push = (line: string): void => setLog((l) => [line, ...l].slice(0, 40))

  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={loadDemo}
        onNodeClick={(e) => push(`node:click ${e.nodeId}`)}
        onSelectionChange={(e) => { setSelected([...e.nodeIds].map(String)); push(`selection:changed (${e.nodeIds.length})`) }}
        onNodeMoved={(e) => push(`node:moved ${e.nodeId} → ${Math.round(e.position.x)},${Math.round(e.position.y)}`)}
        onEdgeConnected={(e) => push(`edge:connected ${e.edge.id}`)}
        onEdgeDisconnected={(e) => push(`edge:disconnected ${e.edgeId}`)}
        onWidgetChange={(e) => { setWidgets((w) => ({ ...w, [`${e.nodeId}.${e.widgetId}`]: e.value })); push(`widget:changed ${e.widgetId} = ${JSON.stringify(e.value)}`) }}
        onHistoryChange={(e) => push(`history undo=${e.canUndo} redo=${e.canRedo}`)}
      >
        <XenolithPanel position="top-right" style={SIDE_PANEL}>
          <h3>Selection</h3>
          {selected.length === 0 ? <p className="muted">Nothing selected.</p> : selected.map((id) => (
            <div className="row" key={id}><span>{id}</span></div>
          ))}
          <h3 style={{ marginTop: 16 }}>Widget values</h3>
          {Object.keys(widgets).length === 0
            ? <p className="muted">Drag a slider, type in a field, toggle a switch…</p>
            : Object.entries(widgets).map(([id, v]) => (
              <div className="row" key={id}><span className="muted">{id}</span><span>{JSON.stringify(v)}</span></div>
            ))}
          <h3 style={{ marginTop: 16 }}>Event log</h3>
          <div className="log">
            {log.length === 0 && <p className="muted">Interact with the graph…</p>}
            {log.map((line, i) => <div key={i}>{line}</div>)}
          </div>
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}
