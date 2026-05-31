import { Graphics } from 'pixi.js'
import type { XenTokens } from '@xenolith/theme-xen'
import { bezierMidpoint, computeEdgePath, arrowHead, sampleBezier, type Vec2 } from './bezier.js'
import {
  computeLinearPolyline, computeStepPolyline, computeSmoothStepPolyline,
  polylineMidpoint, polylineArrowHead,
  type EdgePathStyle,
} from './edge-paths.js'
import type { PinLayout } from './layout.js'
import { resolveEdgeColor } from './style.js'

export type { EdgePathStyle } from './edge-paths.js'

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
  /** Wire shape. Default `'bezier'` (smooth S-curve, the historical Xen look — untouched). Other
   *  styles render as orthogonal / straight polylines via `edge-paths.ts`. Per-edge override
   *  through `editor.setEdgeOptions(id, { pathStyle })`. */
  pathStyle?: EdgePathStyle
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
  const sourceType = opts.sourceType ?? 'any'
  const isExec = sourceType === 'exec'
  const color = resolveEdgeColor(sourceType, tokens)
  const width = isExec ? tokens.geometry.edge.execWidth : tokens.geometry.edge.width
  const style: EdgePathStyle = opts.pathStyle ?? 'bezier'

  g.clear()

  // Bezier path stays on the historical hot path — fastest (native PIXI bezierCurveTo), best-
  // looking for typical DAG edges. The polyline branch below only fires when the user asked for
  // step / smoothstep / linear via opts.pathStyle.
  if (style === 'bezier') {
    const path = computeEdgePath(from, to, {
      bezierTension: tokens.geometry.edge.bezierTension,
      minHorizontalSpread: tokens.geometry.edge.minHorizontalSpread,
    })
    if (opts.animated) {
      g.moveTo(path.start.x, path.start.y)
        .bezierCurveTo(path.c1.x, path.c1.y, path.c2.x, path.c2.y, path.end.x, path.end.y)
        .stroke({ color, width, alpha: 0.3 })
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

    if (opts.markerEnd === 'arrow') {
      const [tip, l, r] = arrowHead(path, tokens.geometry.edge.arrowSize)
      g.moveTo(tip.x, tip.y).lineTo(l.x, l.y).lineTo(r.x, r.y).closePath().fill({ color })
    }

    const rMid = tokens.geometry.edge.midpointRadius
    if (!opts.noMidpoint && rMid > 0) {
      const mid = bezierMidpoint(path)
      g.circle(mid.x, mid.y, rMid)
        .fill({ color })
        .stroke({ color: tokens.color.surface.canvas, width: 1, alignment: 0.5 })
    }
    return g
  }

  // Polyline styles: step / smoothstep / linear. Same colour + width contract as bezier, just a
  // different point list. Animated dashes reuse the same `drawFlowingDashes` (already polyline-
  // based) — no resampling needed.
  const pts =
    style === 'linear'     ? computeLinearPolyline(from, to) :
    style === 'step'       ? computeStepPolyline(from, to) :
    /* smoothstep */         computeSmoothStepPolyline(from, to)

  if (opts.animated) {
    g.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y)
    g.stroke({ color, width, alpha: 0.3 })
    drawFlowingDashes(g, pts, color, width, opts.dashPhase ?? 0)
  } else {
    g.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y)
    g.stroke({ color, width })
  }

  if (opts.markerEnd === 'arrow') {
    const [tip, l, r] = polylineArrowHead(pts, tokens.geometry.edge.arrowSize)
    g.moveTo(tip.x, tip.y).lineTo(l.x, l.y).lineTo(r.x, r.y).closePath().fill({ color })
  }

  const rMid = tokens.geometry.edge.midpointRadius
  if (!opts.noMidpoint && rMid > 0) {
    const mid = polylineMidpoint(pts)
    g.circle(mid.x, mid.y, rMid)
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
