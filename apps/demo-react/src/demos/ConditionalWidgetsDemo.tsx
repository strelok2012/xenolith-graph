import { useState } from 'react'
import { XenolithGraph, XenolithPanel, useEditor } from '@xenolith/react'
import { setupConditionalWidgets, CONDITIONAL_WIDGETS_NODE_ID } from '@xenolith/demo/conditional-widgets'
import { DemoStage } from '../Layout.js'

type Method = 'GET' | 'POST' | 'PUT'
type Auth = 'none' | 'basic' | 'bearer'

// Canon: method/auth are panel-local state. The panel writes them directly to the editor's
// widget values via `useEditor()` — no scene plumbing, no setNodeWidgets gymnastics. The node's
// `displayOptions.show` predicates re-evaluate after every setWidgetValue.

function ConditionalPanel() {
  const editor = useEditor()
  const [method, setMethod] = useState<Method>('GET')
  const [auth, setAuth] = useState<Auth>('none')

  const onMethod = (m: Method): void => {
    setMethod(m)
    editor.setWidgetValue(CONDITIONAL_WIDGETS_NODE_ID, 'method', m)
  }
  const onAuth = (a: Auth): void => {
    setAuth(a)
    editor.setWidgetValue(CONDITIONAL_WIDGETS_NODE_ID, 'auth', a)
  }

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--xeno-text, #cfcfcf)' }}>method</span>
      <select value={method} onChange={(e) => onMethod(e.target.value as Method)} style={sel}>
        <option>GET</option><option>POST</option><option>PUT</option>
      </select>
      <span style={{ fontSize: 12, color: 'var(--xeno-text, #cfcfcf)', marginLeft: 8 }}>auth</span>
      <select value={auth} onChange={(e) => onAuth(e.target.value as Auth)} style={sel}>
        <option>none</option><option>basic</option><option>bearer</option>
      </select>
    </XenolithPanel>
  )
}

/** A1 — declarative conditional widgets (n8n parity). */
export function ConditionalWidgetsDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupConditionalWidgets}>
        <ConditionalPanel />
      </XenolithGraph>
    </DemoStage>
  )
}

const sel: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--xeno-text, #cfcfcf)',
  border: '1px solid var(--xeno-border, #333)',
  borderRadius: 4,
  padding: '3px 6px',
  fontSize: 12,
}
