import { useState } from 'react'
import type { XenolithEditor } from '@xenolith/editor'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import { buildConditionalWidgets, type ConditionalWidgetsScene } from '@xenolith/demo/conditional-widgets'
import { DemoStage } from '../Layout.js'

/** A1 — declarative conditional widgets (n8n parity). One HTTP Request node hides `body` until
 *  the method needs one, and `token` until auth is `bearer`. Pure schema (`displayOptions.show`),
 *  no `setNodeWidgets` plumbing here — the node re-layouts itself on every state change. */
export function ConditionalWidgetsDemo() {
  const [scene, setScene] = useState<ConditionalWidgetsScene | null>(null)
  const onReady = (editor: XenolithEditor): void => { setScene(buildConditionalWidgets(editor)) }

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--xeno-text, #cfcfcf)' }}>method</span>
          <select disabled={!scene} onChange={(e) => scene?.setMethod(e.target.value as 'GET' | 'POST' | 'PUT')} style={sel}>
            <option>GET</option><option>POST</option><option>PUT</option>
          </select>
          <span style={{ fontSize: 12, color: 'var(--xeno-text, #cfcfcf)', marginLeft: 8 }}>auth</span>
          <select disabled={!scene} onChange={(e) => scene?.setAuth(e.target.value as 'none' | 'basic' | 'bearer')} style={sel}>
            <option>none</option><option>basic</option><option>bearer</option>
          </select>
        </XenolithPanel>
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
