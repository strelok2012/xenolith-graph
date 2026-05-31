import { useState } from 'react'
import type { XenolithEditor } from '@xenolith/editor'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import { buildBreadcrumbDive, type BreadcrumbDiveScene } from '@xenolith/demo/breadcrumb-dive'
import { DemoStage } from '../Layout.js'

/** Island: G7 — subgraph breadcrumb. Nested template-instance graph. Dive in via the panel OR
 *  by double-clicking a $templateInstance node; the breadcrumb in the top-left shows Root ›
 *  Pipeline › Stage and lets you pop any level. Themed via --xeno-*. */
export function BreadcrumbDiveDemo() {
  const [scene, setScene] = useState<BreadcrumbDiveScene | null>(null)
  const onReady = (editor: XenolithEditor): void => { setScene(buildBreadcrumbDive(editor)) }
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-right" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
          <button onClick={() => scene?.diveInto('pipeline')} disabled={!scene} style={btn}>Dive into Pipeline</button>
          <button onClick={() => scene?.diveInto('stage')}    disabled={!scene} style={btn}>… then into Stage</button>
          <button onClick={() => scene?.diveOut()}            disabled={!scene} style={btn}>Pop to Root</button>
          <div style={{ fontSize: 11, color: 'var(--xeno-muted, #9a9a9a)' }}>Or double-click any $templateInstance node.</div>
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}

const btn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 6,
  border: '1px solid var(--xeno-border, #333)',
  background: 'transparent',
  color: 'var(--xeno-text, #cfcfcf)',
  cursor: 'pointer',
  textAlign: 'left',
}
