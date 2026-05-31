import { useEffect, useState } from 'react'
import type { XenolithEditor } from '@xenolith/editor'
import { XenolithGraph, XenolithPanel } from '@xenolith/react'
import { buildPropertiesSidebar, type PropertiesSidebarScene } from '@xenolith/demo/properties-sidebar'
import { DemoStage } from '../Layout.js'

/** Island: G4 — properties sidebar. The "fat" Material node has 8 widgets all flagged
 *  `showInSidebar`; the toolbar button below pops them out into a docked right panel,
 *  themed via --xeno-* and editable live. The SAME widget renders inline + in the panel. */
export function PropertiesSidebarDemo() {
  const [scene, setScene] = useState<PropertiesSidebarScene | null>(null)
  const [open, setOpen] = useState(false)
  const onReady = (editor: XenolithEditor): void => { setScene(buildPropertiesSidebar(editor)) }
  useEffect(() => {
    if (!scene) return
    // Auto-open on mount so the demo lands with the panel visible — first impression matters.
    scene.open(); setOpen(true)
  }, [scene])

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', gap: 6, padding: 6 }}>
          <button
            onClick={() => { if (!scene) return; if (open) { scene.close(); setOpen(false) } else { scene.open(); setOpen(true) } }}
            style={btn(open)} disabled={!scene}
          >
            {open ? 'Close sidebar' : 'Open sidebar'}
          </button>
        </XenolithPanel>
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
