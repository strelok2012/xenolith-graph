// Persistence: the whole graph is JSON (editor.exportJSON / loadJSON). These framework-agnostic
// helpers cover the real save/restore surface — download/upload a .json file, and save/restore the
// last graph from localStorage. The host wires them to buttons; the only framework-reactive bit
// (autosave on every edit) stays in the host because it rides that framework's change subscription.

import { loadDemo } from './scene.js'
import type { XenolithEditor } from '@xenolith/editor'

export const SAVE_KEY = 'xeno:save-restore-demo'

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadGraph(editor: XenolithEditor): void {
  download(editor.exportJSON(), 'graph.json')
}

export function uploadGraph(editor: XenolithEditor, file: File): void {
  void file.text().then((t) => {
    try { editor.loadJSON(JSON.parse(t)); editor.fitView({ padding: 48, maxZoom: 1 }) } catch { /* bad file */ }
  })
}

export function saveToLocal(editor: XenolithEditor): void {
  localStorage.setItem(SAVE_KEY, JSON.stringify(editor.toJSON()))
}

export function hasSaved(): boolean {
  return localStorage.getItem(SAVE_KEY) !== null
}

export function restoreFromLocal(editor: XenolithEditor): boolean {
  const s = localStorage.getItem(SAVE_KEY)
  if (!s) return false
  try { editor.loadJSON(JSON.parse(s)); editor.fitView({ padding: 48, maxZoom: 1 }); return true } catch { return false }
}

/** Initial load: the demo graph, then the last autosave on top if present. */
export function initSaveRestore(editor: XenolithEditor): void {
  loadDemo(editor)
  restoreFromLocal(editor)
}
