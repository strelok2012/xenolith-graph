import { xenTokens } from '@xenolith/theme-xen'
import type { XenolithTheme } from './theme.js'

/**
 * The default Xen theme — pure tokens, no custom render hooks. The editor falls back to the
 * built-in `renderNode` / `drawEdge` / `createGridSprite` for every element, so this theme is
 * the visual identity of the library out of the box.
 */
export const xenTheme: XenolithTheme = {
  id: 'xen',
  tokens: xenTokens,
}
