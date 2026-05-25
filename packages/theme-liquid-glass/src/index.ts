import type { XenolithTheme } from '@xenolith/render-pixi'
import { liquidGlassTokens } from './tokens.js'
import {
  renderNodeLiquidGlass,
  renderRerouteLiquidGlass,
  renderRerouteNodeBoxLiquidGlass,
  syncLiquidGlassBackdropSize,
  syncLiquidGlassBackdropTexture,
} from './render-node.js'
import { createLiquidGlassBackdrop } from './backdrop.js'

/**
 * Liquid Glass theme — Apple WWDC25 material aesthetic applied to nodes.
 *
 * v0.1 ships as a tokens-only theme: translucent surfaces + luminous rims + cool canvas. A
 * future iteration will add a custom `renderNode` with backdrop-blur and edge refraction
 * shaders for the full WWDC25 glass effect. The current build relies on the default Xen
 * renderer being respectful of token-level translucency (it draws surface fills with the
 * tokens' rgba values), so swapping themes at runtime is a single `setTheme()` call.
 */
export const liquidGlassTheme: XenolithTheme = {
  id: 'liquid-glass',
  tokens: liquidGlassTokens,
  needsBackdrop: true,
  // Disabled for now: the freeze/unfreeze at gesture start/end causes a hitch that hurts
  // smoothness more than the per-frame glass cost. Revisit with proper LOD/virtualization (#59).
  freezeOnNavigate: false,
  // CSS frosted-glass approximation for DOM chrome (insert palette). Translucent cool-white
  // panel + heavy backdrop blur + luminous 1px rim + soft inner highlight — the WWDC25 look
  // without the backdrop-sampling shader (overkill for chrome).
  paletteStyle: {
    backdropFilter:        'blur(18px) saturate(160%)',
    panelBackground:       'rgba(28, 42, 74, 0.55)',
    panelBorder:           'rgba(255, 255, 255, 0.28)',
    panelShadow:           '0 16px 50px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
    panelRadius:           '16px',
    textColor:             'rgba(255, 255, 255, 0.95)',
    mutedColor:            'rgba(220, 232, 255, 0.6)',
    accent:                '#9AD6E3',
    rowSelectedBackground: 'rgba(255, 255, 255, 0.16)',
    inputBackground:       'rgba(255, 255, 255, 0.1)',
    inputBorder:           'rgba(255, 255, 255, 0.22)',
  },
  renderNode: (node, opts, ctx) => renderNodeLiquidGlass(node, liquidGlassTokens, opts, ctx),
  renderReroute: (node, opts, ctx) => renderRerouteLiquidGlass(node, liquidGlassTokens, opts, ctx),
  renderRerouteNode: (node, opts, ctx) => renderRerouteNodeBoxLiquidGlass(node, liquidGlassTokens, opts, ctx),
  createGrid: () => createLiquidGlassBackdrop(liquidGlassTokens),
  onFrame: (ctx) => {
    const tex = ctx.backdropTexture
    if (tex) syncLiquidGlassBackdropSize(tex.width, tex.height)
  },
  onNodeBackdrop: (nodeId, texture) => syncLiquidGlassBackdropTexture(nodeId, texture),
}

export { liquidGlassTokens } from './tokens.js'

export const VERSION = '0.0.0'
