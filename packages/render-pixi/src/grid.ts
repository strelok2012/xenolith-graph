import { Texture, TilingSprite } from 'pixi.js'
import type { XenTokens } from '@xenolith/theme-xen'

/**
 * Create a `TilingSprite` filled with the Xen background dot pattern.
 *
 * The grid lives in world space — add it as a child of the same container the viewport applies
 * to, so it scales / pans naturally with zoom and pan. We make the sprite very large (effectively
 * infinite) and pre-offset it to a negative origin, so under any reasonable viewport position the
 * visible area is always covered.
 */
export function createGridSprite(tokens: XenTokens): TilingSprite {
  const tile = makeDotTile(tokens)
  const sprite = new TilingSprite({
    texture: tile,
    width: 200_000,
    height: 200_000,
  })
  sprite.position.set(-100_000, -100_000)
  sprite.label = 'background-grid'
  return sprite
}

function makeDotTile(tokens: XenTokens): Texture {
  const { spacing, size, color } = tokens.background.grid
  const canvas = document.createElement('canvas')
  canvas.width = spacing
  canvas.height = spacing
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('createGridSprite: 2d canvas context unavailable')
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(spacing / 2, spacing / 2, size, 0, Math.PI * 2)
  ctx.fill()
  return Texture.from(canvas)
}
