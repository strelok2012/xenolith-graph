import { Container, Sprite, Texture } from 'pixi.js'
import { createGridSprite } from '@xenolith/render-pixi'
import type { XenTokens } from '@xenolith/theme-xen'

/**
 * Liquid Glass canvas backdrop — a radial gradient rendered into a Canvas2D ImageBitmap and
 * wrapped as a PIXI Sprite. The shader-driven node bodies sample this through the editor's
 * per-frame backdrop RenderTexture, so a gradient backdrop gives the glass a natural cool/warm
 * play instead of a uniform dark slab.
 *
 * Canvas2D path is used (rather than PIXI FillGradient + Graphics.rect) because the latter's
 * radial fills don't reliably cover an 8000×8000 quad in PIXI v8 — the texture-space gradient
 * renders empty/clipped in that case. A pre-baked Canvas2D bitmap is bulletproof.
 */
export function createLiquidGlassBackdrop(tokens: XenTokens): Container {
  const root = new Container({ label: 'liquid-glass-backdrop' })

  // Bake a 2048-px radial gradient bitmap once at theme creation. Stretched to 8000 px in
  // world space; smoothing keeps the gradient soft even when zoomed in.
  const BAKE_SIZE = 2048
  const cnv = document.createElement('canvas')
  cnv.width = BAKE_SIZE
  cnv.height = BAKE_SIZE
  const ctx = cnv.getContext('2d')!
  const grad = ctx.createRadialGradient(
    BAKE_SIZE / 2, BAKE_SIZE / 2, 0,
    BAKE_SIZE / 2, BAKE_SIZE / 2, BAKE_SIZE * 0.55,
  )
  grad.addColorStop(0, '#1D3573')
  grad.addColorStop(1, '#112558')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, BAKE_SIZE, BAKE_SIZE)

  const texture = Texture.from(cnv)
  const sprite = new Sprite(texture)
  const WORLD_SIZE = 8000
  sprite.width = WORLD_SIZE
  sprite.height = WORLD_SIZE
  sprite.anchor.set(0.5)
  sprite.position.set(0, 0)
  root.addChild(sprite)

  // Dot grid overlaid on the gradient — preserves the "graph editor canvas" feel while still
  // letting the radial backdrop show through. Uses the same `createGridSprite` machinery as the
  // Xen theme so the dot spacing/size is consistent.
  const grid = createGridSprite(tokens)
  root.addChild(grid)

  return root
}
