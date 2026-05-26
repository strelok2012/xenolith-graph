import { Graphics } from 'pixi.js'
import type { XenTokens } from '@xenolith/theme-xen'
import { bezierMidpoint, computeEdgePath, arrowHead, sampleBezier, type Vec2 } from './bezier.js'
import type { PinLayout } from './layout.js'
import { resolveEdgeColor } from './style.js'

export interface RenderEdgeOptions {
  /** Pin type at the source — drives wire colour. Defaults to 'any'. */
  sourceType?: string
  /** Suppress the midpoint handle dot (e.g. the live drag-ghost wire has no interaction point). */
  noMidpoint?: boolean
  /** Text drawn at the wire's midpoint (rendered by the editor as a PIXI Text, not by drawEdge). */
  label?: string
  /** End marker drawn at the target pin. `'arrow'` draws a filled arrowhead; omit/`'none'` for none. */
  markerEnd?: 'arrow' | 'none'
  /** Animate a flowing dash along the wire (kept ticking only while ≥1 animated edge exists). */
  animated?: boolean
  /** Transient per-frame dash offset (px) for animated edges. Not serialized; set by the editor's
   *  ticker. Ignored unless `animated`. */
  dashPhase?: number
}

/** Stroke bright dash segments along a sampled polyline, offset by `phase` so they travel when the
 *  caller animates `phase`. Approximated per-segment — fine at ~56 samples per wire. */
function drawFlowingDashes(g: Graphics, pts: Vec2[], color: string, width: number, phase: number): void {
  const dash = 15, gap = 13, period = dash + gap
  let s = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!
    const segLen = Math.hypot(b.x - a.x, b.y - a.y)
    const m = (((s + segLen / 2 - phase) % period) + period) % period
    if (m < dash) g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width })
    s += segLen
  }
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

  g.clear()
  if (opts.animated) {
    // Dim base wire + bright dashes that travel along it (driven by opts.dashPhase per frame).
    g.moveTo(path.start.x, path.start.y)
      .bezierCurveTo(path.c1.x, path.c1.y, path.c2.x, path.c2.y, path.end.x, path.end.y)
      .stroke({ color, width, alpha: 0.3 })
    // Sample density scales with the wire's length (~5px/segment) so dashes stay smooth + uniform
    // on a long edge instead of going chunky at a fixed sample count.
    const approxLen =
      Math.hypot(path.c1.x - path.start.x, path.c1.y - path.start.y) +
      Math.hypot(path.c2.x - path.c1.x, path.c2.y - path.c1.y) +
      Math.hypot(path.end.x - path.c2.x, path.end.y - path.c2.y)
    const steps = Math.max(24, Math.min(400, Math.round(approxLen / 5)))
    drawFlowingDashes(g, sampleBezier(path, steps), color, width, opts.dashPhase ?? 0)
  } else {
    g.moveTo(path.start.x, path.start.y)
      .bezierCurveTo(path.c1.x, path.c1.y, path.c2.x, path.c2.y, path.end.x, path.end.y)
      .stroke({ color, width })
  }

  // End marker: a filled arrowhead at the target pin (diagram-style directional edges).
  if (opts.markerEnd === 'arrow') {
    const [tip, l, r] = arrowHead(path, tokens.geometry.edge.arrowSize)
    g.moveTo(tip.x, tip.y).lineTo(l.x, l.y).lineTo(r.x, r.y).closePath().fill({ color })
  }

  // Midpoint handle — the real interaction point for the edge context menu (right-click here for
  // Add Reroute / Add Node / Delete). A filled dot in the wire colour with a subtle dark rim.
  const r = tokens.geometry.edge.midpointRadius
  if (!opts.noMidpoint && r > 0) {
    const mid = bezierMidpoint(path)
    g.circle(mid.x, mid.y, r)
      .fill({ color })
      .stroke({ color: tokens.color.surface.canvas, width: 1, alignment: 0.5 })
  }
  return g
}

export function renderEdge(
  from: PinLayout,
  to: PinLayout,
  tokens: XenTokens,
  opts: RenderEdgeOptions = {},
): Graphics {
  return drawEdge(new Graphics(), from, to, tokens, opts)
}
