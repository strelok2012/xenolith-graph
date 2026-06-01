import { XenolithGraph, XenolithPanel, useEditor } from '@xenolith/react'
import { setupBreadcrumbDive, diveIntoSlug } from '@xenolith/demo/breadcrumb-dive'
import { DemoStage } from '../Layout.js'

// Canon: dive operations are pure editor methods + one helper; the panel calls them directly
// via `useEditor()`. No scene handle held in state.

function BreadcrumbPanel() {
  const editor = useEditor()
  return (
    <XenolithPanel position="top-right" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8 }}>
      <button onClick={() => diveIntoSlug(editor, 'pipeline')} style={btn}>Dive into Pipeline</button>
      <button onClick={() => diveIntoSlug(editor, 'stage')}    style={btn}>… then into Stage</button>
      <button onClick={() => editor.diveOut(0)}                style={btn}>Pop to Root</button>
      <div style={{ fontSize: 11, color: 'var(--xeno-muted, #9a9a9a)' }}>Or double-click any $templateInstance node.</div>
    </XenolithPanel>
  )
}

/** Island: G7 — subgraph breadcrumb. */
export function BreadcrumbDiveDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupBreadcrumbDive}>
        <BreadcrumbPanel />
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
