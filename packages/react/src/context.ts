import { createContext, useContext } from 'react'
import type { XenolithEditor } from '@xenolith/editor'

/** The live editor for the enclosing `<XenolithGraph>`, or `null` until it has mounted. In-editor
 *  components (`<XenolithPanel>`, `<XenolithControls>`, hooks) read it from here. */
export const XenolithContext = createContext<XenolithEditor | null>(null)

/** The editor instance from the nearest `<XenolithGraph>` ancestor — `null` until ready. */
export function useXenolithEditor(): XenolithEditor | null {
  return useContext(XenolithContext)
}
