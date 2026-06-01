import { createContext, useContext } from 'react'
import type { XenolithEditor } from '@xenolith/editor'

/** The live editor for the enclosing `<XenolithGraph>`, or `null` until it has mounted. In-editor
 *  components (`<XenolithPanel>`, `<XenolithControls>`, hooks) read it from here. */
export const XenolithContext = createContext<XenolithEditor | null>(null)

/** The editor instance from the nearest `<XenolithGraph>` ancestor — `null` until it has mounted
 *  OR if the component is rendered outside any `<XenolithGraph>`. Use `useEditor()` when the
 *  component is GUARANTEED to live inside an editor — that variant throws on misuse rather than
 *  leaking nulls into your render. */
export function useXenolithEditor(): XenolithEditor | null {
  return useContext(XenolithContext)
}

/** Strict variant: returns the live editor, throwing if the component is rendered outside a
 *  `<XenolithGraph>` ancestor or before the editor has finished mounting. Prefer this when
 *  writing in-editor components — removes null-check noise at every call site and turns a
 *  misuse from a silent bug into a clear error. */
export function useEditor(): XenolithEditor {
  const editor = useContext(XenolithContext)
  if (!editor) throw new Error('useEditor() called outside <XenolithGraph> or before the editor mounted. Use useXenolithEditor() if a null result is expected here.')
  return editor
}
