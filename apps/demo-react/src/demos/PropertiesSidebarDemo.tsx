import { useEffect, useState } from 'react'
import { XenolithGraph, XenolithPanel, useEditor } from '@xenolith/react'
import { setupPropertiesSidebar, PROPERTIES_SIDEBAR_NODE_ID } from '@xenolith/demo/properties-sidebar'
import { DemoStage } from '../Layout.js'

// Canon: sidebar open-state lives in the panel — only the panel needs it. Open/close are direct
// editor calls. The panel mounts AFTER `onReady` (Provider gates children on editor presence), so
// the auto-open effect runs once with a guaranteed-ready editor.

function SidebarPanel() {
  const editor = useEditor()
  const [open, setOpen] = useState(true)

  useEffect(() => {
    // Auto-open on mount so the demo lands with the panel visible — first impression matters.
    editor.openSidebar(PROPERTIES_SIDEBAR_NODE_ID)
  }, [editor])

  const toggle = (): void => {
    if (open) { editor.closeSidebar(); setOpen(false) }
    else      { editor.openSidebar(PROPERTIES_SIDEBAR_NODE_ID); setOpen(true) }
  }

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', gap: 6, padding: 6 }}>
      <button onClick={toggle} style={btn(open)}>{open ? 'Close sidebar' : 'Open sidebar'}</button>
    </XenolithPanel>
  )
}

/** Island: G4 — properties sidebar. */
export function PropertiesSidebarDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupPropertiesSidebar}>
        <SidebarPanel />
      </XenolithGraph>
    </DemoStage>
  )
}

const btn = (on: boolean): React.CSSProperties => ({
  padding: '6px 12px',
  fontSize: 12,
  borderRadius: 6,
  border: `1px solid ${on ? 'var(--xeno-accent, #FCB400)' : 'var(--xeno-border, #333)'}`,
  background: on ? 'var(--xeno-accent, #FCB400)' : 'transparent',
  color: on ? 'var(--xeno-canvas, #111)' : 'var(--xeno-text, #cfcfcf)',
  cursor: 'pointer',
})
