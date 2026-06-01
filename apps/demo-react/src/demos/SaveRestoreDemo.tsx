import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithControls, XenolithPanel, XenolithButton, useEditor, useGraphJSON } from '@xenolith/react'
import { initSaveRestore, downloadGraph, uploadGraph, saveToLocal, restoreFromLocal, hasSaved } from '@xenolith/demo/save-restore'
import { DemoStage } from '../Layout.js'

// Persistence: the whole graph is JSON (editor.toJSON ⇄ loadJSON). The file + localStorage helpers
// live in the framework-agnostic core; only the autosave-on-edit is React here, since it rides
// useGraphJSON's reactive change stream. `useEditor()` is strict — the panel only renders inside
// <XenolithGraph>, after the editor has mounted, so we never hold null.

function SavePanel() {
  const editor = useEditor()
  const json = useGraphJSON()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const first = useRef(true)

  // Autosave (debounced) whenever the graph changes — useGraphJSON re-emits on edits.
  useEffect(() => {
    if (!json) return
    if (first.current) { first.current = false; return } // skip the initial load
    const t = setTimeout(() => { saveToLocal(editor); setSavedAt(Date.now()) }, 500)
    return () => clearTimeout(t)
  }, [json, editor])

  const btn: React.CSSProperties = { width: '100%' }
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 180 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Save / restore</p>
      <XenolithButton style={btn} onClick={() => downloadGraph(editor)}>↓ Download .json</XenolithButton>
      <XenolithButton style={btn} onClick={() => fileRef.current?.click()}>↑ Upload .json</XenolithButton>
      <XenolithButton style={btn} onClick={() => restoreFromLocal(editor)} disabled={savedAt === null && !hasSaved()}>↺ Restore last</XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
        {savedAt ? '✓ Autosaved to your browser' : 'Edit the graph — it autosaves to localStorage.'}
      </span>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadGraph(editor, f) }} />
    </XenolithPanel>
  )
}

/** Showcase: save & restore. Restores the last autosave on load, else the demo graph. */
export function SaveRestoreDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={initSaveRestore}>
        <XenolithControls position="bottom-left" />
        <SavePanel />
      </XenolithGraph>
    </DemoStage>
  )
}
