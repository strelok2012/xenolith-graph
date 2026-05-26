import { useRef } from 'react'
import { XenolithGraph, XenolithControls, XenolithPanel, XenolithButton } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { DemoStage } from '../Layout.js'
import { loadDemo, demoGraph } from '../demo-data.js'

/** Island: load a real saved xenolith.v1 graph; an in-editor panel reloads it. */
export function LoadDemo() {
  const editorRef = useRef<XenolithEditor | null>(null)
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={(e) => { editorRef.current = e; loadDemo(e) }}
      >
        <XenolithControls position="bottom-left" />
        <XenolithPanel position="top-right">
          <XenolithButton onClick={() => { const e = editorRef.current; if (e) { e.loadJSON(demoGraph); e.fitView({ padding: 48, maxZoom: 1 }) } }}>
            Reload graph
          </XenolithButton>
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}
