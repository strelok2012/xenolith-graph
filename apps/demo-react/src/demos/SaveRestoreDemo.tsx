import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithControls, XenolithPanel, XenolithButton, useXenolithEditor, useGraphJSON } from '@xenolith/react'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

// Persistence: the whole graph is JSON (editor.toJSON ⇄ loadJSON). This showcases real save/restore —
// download/upload a .json file, and autosave to localStorage on every edit (driven by useGraphJSON).

const KEY = 'xeno:save-restore-demo'

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function SavePanel() {
  const editor = useXenolithEditor()
  const json = useGraphJSON()
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const first = useRef(true)

  // Autosave (debounced) to localStorage whenever the graph changes — useGraphJSON re-emits on edits.
  useEffect(() => {
    if (!json) return
    if (first.current) { first.current = false; return } // skip the initial load
    const t = setTimeout(() => { localStorage.setItem(KEY, JSON.stringify(json)); setSavedAt(Date.now()) }, 500)
    return () => clearTimeout(t)
  }, [json])

  const restore = (): void => {
    const s = localStorage.getItem(KEY)
    if (!s || !editor) return
    try { editor.loadJSON(JSON.parse(s)); editor.fitView({ padding: 48, maxZoom: 1 }) } catch { /* corrupt */ }
  }
  const upload = (file?: File): void => {
    if (!file || !editor) return
    void file.text().then((t) => { try { editor.loadJSON(JSON.parse(t)); editor.fitView({ padding: 48, maxZoom: 1 }) } catch { /* bad file */ } })
  }

  const btn: React.CSSProperties = { width: '100%' }
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 180 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Save / restore</p>
      <XenolithButton style={btn} onClick={() => editor && download(editor.exportJSON(), 'graph.json')}>↓ Download .json</XenolithButton>
      <XenolithButton style={btn} onClick={() => fileRef.current?.click()}>↑ Upload .json</XenolithButton>
      <XenolithButton style={btn} onClick={restore} disabled={savedAt === null && !localStorage.getItem(KEY)}>↺ Restore last</XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
        {savedAt ? '✓ Autosaved to your browser' : 'Edit the graph — it autosaves to localStorage.'}
      </span>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => upload(e.target.files?.[0])} />
    </XenolithPanel>
  )
}

/** Showcase: save & restore. Restores the last autosave on load, else the demo graph. */
export function SaveRestoreDemo() {
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={(editor) => {
          loadDemo(editor) // registers the demo node schemas and loads the demo graph
          const saved = localStorage.getItem(KEY)
          if (saved) { try { editor.loadJSON(JSON.parse(saved)); editor.fitView({ padding: 48, maxZoom: 1 }) } catch { /* corrupt — keep the demo */ } }
        }}
      >
        <XenolithControls position="bottom-left" />
        <SavePanel />
      </XenolithGraph>
    </DemoStage>
  )
}
