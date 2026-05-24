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
  paletteStyle: {
    panelBackground:       '#191919',
    panelBorder:           '#424242',
    panelShadow:           '0 16px 48px rgba(0, 0, 0, 0.6)',
    panelRadius:           '10px',
    textColor:             '#FFFFFF',
    mutedColor:            '#B8B8B8',
    accent:                '#FCB400',
    rowSelectedBackground: 'rgba(252, 180, 0, 0.14)',
    inputBackground:       '#0F110E',
    inputBorder:           '#363636',
  },
}
