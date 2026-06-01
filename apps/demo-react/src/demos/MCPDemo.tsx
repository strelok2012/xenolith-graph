import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useEditor } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { demoSchemas, createCurveWidget, createXYPadWidget } from '@xenolith/demo'
import { DemoStage } from '../Layout.js'

// MCP live demo: connect this editor to a running @xenolith/mcp-server, then watch Claude/Cursor
// build the graph for you. The editor starts EMPTY — schemas are registered (Source/Filter/Cache/
// Transform/Validate/...) so the LLM has real types to pick from via list_node_types.
//
// Canon: graph SETUP lives in onReady (setupMCP). The connection lifecycle (status / url / log /
// disconnect handle) lives in MCPPanel via useEditor() — state where it's used, ref for the
// imperative disconnect fn, effect for unmount cleanup.

type Status = 'idle' | 'connecting' | 'open' | 'closed' | 'error'

const SAMPLE_PROMPTS = [
  'Build a simple linear pipeline: Source → Sample → Filter → Cache → Transform → Resolve. Use list_node_types first, then add_node without coordinates, connect pins by label, finally call auto_layout.',
  'Show me every available node type, one of each, fan them out from a single Source. End with auto_layout LR.',
  'Make a branching pipeline: Source feeds two parallel branches (Filter + Sample), both converge into Validate, then Resolve. Call auto_layout when done.',
  'First call list_node_types to see what is available, then design something that uses at least 8 node types and looks visually interesting after auto_layout.',
]

const URL_KEY = 'xeno.mcp.url'
const DEFAULT_URL = 'ws://127.0.0.1:7777?token=devtoken'

function setupMCP(editor: XenolithEditor): void {
  editor.registerWidget('curve', createCurveWidget())
  editor.registerWidget('xypad', createXYPadWidget())
  for (const s of demoSchemas) editor.registry.register(s)
  editor.fitView()
}

function MCPPanel() {
  const editor = useEditor()
  const disconnectRef = useRef<(() => void) | null>(null)
  const [url, setUrl] = useState<string>(() => localStorage.getItem(URL_KEY) ?? DEFAULT_URL)
  const [status, setStatus] = useState<Status>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [log, setLog] = useState<string[]>([])

  // Unmount cleanup — make sure we drop any live MCP connection when leaving the demo.
  useEffect(() => () => { disconnectRef.current?.(); disconnectRef.current = null }, [])

  const append = (line: string): void => setLog((prev) => [...prev.slice(-29), `${stamp()} ${line}`])

  const connect = async (): Promise<void> => {
    localStorage.setItem(URL_KEY, url)
    setErr(null); setStatus('connecting'); append(`connect ${url}`)
    try {
      disconnectRef.current = await editor.connectMCP(url, {
        onStatus: (s) => { setStatus(s); append(`status: ${s}`) },
      })
    } catch (e) {
      setStatus('error'); setErr(e instanceof Error ? e.message : String(e))
      append(`error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const disconnect = (): void => {
    disconnectRef.current?.()
    disconnectRef.current = null
    setStatus('closed'); append('disconnected')
  }

  const clearGraph = (): void => {
    editor.loadJSON({ version: 'xenolith.v1', nodes: [], edges: [] })
    append('graph cleared')
  }

  const connected = status === 'open'

  return (
    <>
      <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360, padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={dotStyle(status)} />
          <strong style={{ fontSize: 12, color: 'var(--xeno-text)' }}>MCP {labelFor(status)}</strong>
        </div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={connected || status === 'connecting'}
          placeholder="ws://127.0.0.1:7777?token=…"
          style={inputStyle}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {!connected
            ? <XenolithButton active onClick={() => void connect()} disabled={status === 'connecting'} style={{ flex: 1 }}>
                {status === 'connecting' ? 'Connecting…' : 'Connect'}
              </XenolithButton>
            : <XenolithButton onClick={disconnect} style={{ flex: 1 }}>Disconnect</XenolithButton>}
          <XenolithButton onClick={clearGraph} style={{ flex: '0 0 auto' }}>Clear graph</XenolithButton>
        </div>
        {err && <div style={errStyle}>{err}</div>}
        <details style={{ fontSize: 11, color: 'var(--xeno-muted)' }}>
          <summary style={{ cursor: 'pointer' }}>Sample prompts (click to copy)</summary>
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {SAMPLE_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => void navigator.clipboard.writeText(p)} style={promptBtnStyle} title="Copy">
                {p}
              </button>
            ))}
            <em style={{ color: 'var(--xeno-muted)' }}>Click to copy, then paste into Claude / Cursor chat.</em>
          </div>
        </details>
      </XenolithPanel>

      <XenolithPanel position="bottom-left" style={{ minWidth: 280, maxWidth: 360, maxHeight: 200, padding: 8, overflow: 'auto' }}>
        <div style={{ fontSize: 10, color: 'var(--xeno-muted)', marginBottom: 4 }}>Log</div>
        {log.length === 0
          ? <div style={{ fontSize: 11, color: 'var(--xeno-muted)' }}>Empty — connect and ask the AI to build something.</div>
          : log.map((l, i) => <div key={i} style={logRowStyle}>{l}</div>)}
      </XenolithPanel>
    </>
  )
}

export function MCPDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupMCP}>
        <MCPPanel />
      </XenolithGraph>
    </DemoStage>
  )
}

const dotStyle = (s: Status): React.CSSProperties => ({
  width: 8, height: 8, borderRadius: 8,
  background: s === 'open' ? '#3ddc97' : s === 'connecting' ? '#fcb400' : s === 'error' ? '#e25b5b' : '#666',
  boxShadow: s === 'open' ? '0 0 8px #3ddc9788' : undefined,
})
const labelFor = (s: Status): string => ({ idle: 'idle', connecting: 'connecting…', open: 'connected', closed: 'closed', error: 'error' })[s]
const inputStyle: React.CSSProperties = {
  font: 'inherit', fontSize: 11, padding: '6px 8px', borderRadius: 6,
  background: 'var(--xeno-bg)', color: 'var(--xeno-text)', border: '1px solid var(--xeno-border)',
}
const errStyle: React.CSSProperties = { fontSize: 11, color: '#e25b5b', whiteSpace: 'pre-wrap' }
const promptBtnStyle: React.CSSProperties = {
  textAlign: 'left', font: 'inherit', fontSize: 11, lineHeight: 1.35,
  padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
  background: 'var(--xeno-bg)', color: 'var(--xeno-text)', border: '1px solid var(--xeno-border)',
}
const logRowStyle: React.CSSProperties = { fontFamily: 'ui-monospace, monospace', fontSize: 10, color: 'var(--xeno-text)' }
const stamp = (): string => new Date().toLocaleTimeString()
