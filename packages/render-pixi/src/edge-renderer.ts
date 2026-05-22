import { Graphics } from 'pixi.js'
import type { XenTokens } from '@xenolith/theme-xen'
import { computeEdgePath } from './bezier.js'
import type { PinLayout } from './layout.js'
import { resolveEdgeColor } from './style.js'

export interface RenderEdgeOptions {
  /** Pin type at the source — drives wire colour. Defaults to 'any'. */
  sourceType?: string
}

/** Repaint an existing Graphics with a fresh edge path. Use during drag to avoid GC pressure
 *  from creating a new Graphics on every pointermove. */
export function drawEdge(
  g: Graphics,
  from: PinLayout,
  to: PinLayout,
  tokens: XenTokens,
  opts: RenderEdgeOptions = {},
): Graphics {
  const path = computeEdgePath(from, to, {
    bezierTension: tokens.geometry.edge.bezierTension,
    minHorizontalSpread: tokens.geometry.edge.minHorizontalSpread,
  })

  const sourceType = opts.sourceType ?? 'any'
  const isExec = sourceType === 'exec'
  const color = resolveEdgeColor(sourceType, tokens)
  const width = isExec ? tokens.geometry.edge.execWidth : tokens.geometry.edge.width

  return g
    .clear()
    .moveTo(path.start.x, path.start.y)
    .bezierCurveTo(path.c1.x, path.c1.y, path.c2.x, path.c2.y, path.end.x, path.end.y)
    .stroke({ color, width })
}

export function renderEdge(
  from: PinLayout,
  to: PinLayout,
  tokens: XenTokens,
  opts: RenderEdgeOptions = {},
): Graphics {
  return drawEdge(new Graphics(), from, to, tokens, opts)
}
