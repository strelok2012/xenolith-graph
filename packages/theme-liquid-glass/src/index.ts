import type { XenolithTheme } from '@xenolith/render-pixi'
import { liquidGlassTokens } from './tokens.js'
import { renderNodeLiquidGlass, syncLiquidGlassBackdropSize } from './render-node.js'
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
  renderNode: (node, opts, ctx) => renderNodeLiquidGlass(node, liquidGlassTokens, opts, ctx),
  createGrid: () => createLiquidGlassBackdrop(liquidGlassTokens),
  onFrame: (ctx) => {
    const tex = ctx.backdropTexture
    if (tex) syncLiquidGlassBackdropSize(tex.width, tex.height)
  },
}

export { liquidGlassTokens } from './tokens.js'

export const VERSION = '0.0.0'
