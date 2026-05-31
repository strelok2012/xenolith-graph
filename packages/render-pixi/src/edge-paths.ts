// Alternative edge-path generators for G9 — pluggable wire curves (Rete `connection-path-plugin`
// parity). The default `'bezier'` route stays in `bezier.ts` UNTOUCHED; this module owns the
// polyline-based styles (step / smoothstep / linear). The renderer picks a style per edge via
// `RenderEdgeOptions.pathStyle`; this keeps the hot path zero-risk for the 95% bezier case.
//
// All polyline generators return a `Vec2[]` of ≥2 points. The renderer feeds them to lineTo()
// (and to the midpoint / arrowhead helpers below). The first/last point ARE the pin centres.

import type { PinLayout } from './layout.js'
import type { Vec2 } from './bezier.js'

export type EdgePathStyle = 'bezier' | 'step' | 'smoothstep' | 'linear'

/** Straight line — first sample is `from`, last is `to`. */
export function computeLinearPolyline(from: PinLayout, to: PinLayout): Vec2[] {
  return [{ x: from.x, y: from.y }, { x: to.x, y: to.y }]
}

/** Orthogonal Z/U — leave each pin in its `side` direction for `offset` px, then a single
 *  vertical run, then horizontal to the target. Mirrors React Flow / Rete `curveStep` for
 *  flowchart-style diagrams. For the common right→left flow (out → in) the two pulls overlap
 *  and degenerate to a clean Z; for same-side / reverse pins the extensions sit outside the
 *  pin bounds, producing a U that doesn't cross the node body. `offset` defaults to a chunk of
 *  horizontal distance so close pins still get a visible elbow. */
export function computeStepPolyline(from: PinLayout, to: PinLayout, offset?: number): Vec2[] {
  const fromSign = from.side === 'right' ? 1 : -1
  const toSign   = to.side   === 'right' ? 1 : -1
  const off = Math.max(20, Math.abs((to.x - from.x) * 0.5))
  const stepX = offset ?? off
  const ax = from.x + fromSign * stepX                 // extension X off the source pin
  const bx = to.x   + toSign   * stepX                 // extension X off the target pin
  const midX = (ax + bx) / 2                           // where the vertical run lives
  return dedupConsecutive([
    { x: from.x, y: from.y },
    { x: ax,     y: from.y },                          // extend OUT from source pin in its side dir
    { x: midX,   y: from.y },                          // ride source y until the meet x (collapses if ax == midX)
    { x: midX,   y: to.y },                            // vertical run
    { x: bx,     y: to.y },                            // ride target y until the extension x
    { x: to.x,   y: to.y },
  ])
}

function dedupConsecutive(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && last.x === p.x && last.y === p.y) continue
    out.push(p)
  }
  return out
}

/** Rounded step — same elbows as `computeStepPolyline` but the 90° corners get a quarter-arc
 *  approximation via 5-point insets. Cheap, looks like a Visio/Excalidraw orthogonal connector. */
export function computeSmoothStepPolyline(from: PinLayout, to: PinLayout, radius = 12): Vec2[] {
  const step = computeStepPolyline(from, to)
  // computeStepPolyline returns 3–6 points after dedup: 3 when source/target are colinear (no
  // elbow), 4 in the canonical Z, more when the two extensions overlap and form a U. Only the
  // 4-point canonical shape has the two-elbow geometry this rounder is built for; anything else
  // (no elbow, or a multi-corner U) falls back to the bare step shape — no rounding artifact,
  // no thrown exception (which was the crash in the edge-paths demo when from.y === to.y).
  if (step.length !== 4) return step
  const [a, b, c, d] = step as [Vec2, Vec2, Vec2, Vec2]
  const dirAB = Math.sign(b.x - a.x)                  // ±1 along x
  const dirCD = Math.sign(d.x - c.x)
  const dirBC = Math.sign(c.y - b.y)                  // ±1 along y
  const r = Math.min(
    radius,
    Math.max(0, Math.abs(b.x - a.x) - 1),
    Math.max(0, Math.abs(d.x - c.x) - 1),
    Math.max(0, Math.abs(c.y - b.y) - 1) / 2,
  )
  if (r <= 0) return step
  // Approximate each 90° corner with 3 evenly-spaced points along its quarter circle.
  const corner = (centerX: number, centerY: number, fromX: number, fromY: number, toX: number, toY: number): Vec2[] => {
    // Quarter from (fromX,fromY) → (toX,toY). Build with a quadratic approx: 2 inner points.
    return [
      { x: fromX, y: fromY },
      { x: centerX + (fromX - centerX) * 0.5, y: centerY + (fromY - centerY) * 0.95 },
      { x: centerX + (toX - centerX) * 0.95, y: centerY + (toY - centerY) * 0.5 },
      { x: toX, y: toY },
    ]
  }
  const c1 = corner(
    b.x, b.y,
    b.x - dirAB * r, b.y,
    b.x, b.y + dirBC * r,
  )
  const c2 = corner(
    c.x, c.y,
    c.x, c.y - dirBC * r,
    c.x + dirCD * r, c.y,
  )
  return [a, ...c1, ...c2, d]
}

/** Walk a polyline and return the point at half its arc length. Used so the midpoint handle
 *  sits visually centred on the wire regardless of how skewed the segments are. */
export function polylineMidpoint(pts: Vec2[]): Vec2 {
  if (pts.length === 0) return { x: 0, y: 0 }
  if (pts.length === 1) return { ...pts[0]! }
  let total = 0
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  const target = total / 2
  let walked = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (walked + seg >= target) {
      const t = seg === 0 ? 0 : (target - walked) / seg
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    walked += seg
  }
  return { ...pts[pts.length - 1]! }
}

/** Unit tangent of the last segment — the direction the wire is travelling as it lands on the
 *  target pin. Used to orient the arrowhead on non-bezier styles. */
export function polylineEndTangent(pts: Vec2[]): Vec2 {
  if (pts.length < 2) return { x: 1, y: 0 }
  const a = pts[pts.length - 2]!, b = pts[pts.length - 1]!
  const dx = b.x - a.x, dy = b.y - a.y
  const len = Math.hypot(dx, dy) || 1
  return { x: dx / len, y: dy / len }
}

/** Arrowhead triangle on a polyline (matches `arrowHead` shape for bezier paths). */
export function polylineArrowHead(pts: Vec2[], size: number): [Vec2, Vec2, Vec2] {
  const end = pts[pts.length - 1] ?? { x: 0, y: 0 }
  const dir = polylineEndTangent(pts)
  const back = { x: end.x - dir.x * size, y: end.y - dir.y * size }
  const perp = { x: dir.y, y: -dir.x }
  const half = size * 0.5
  return [
    { x: end.x, y: end.y },
    { x: back.x + perp.x * half, y: back.y + perp.y * half },
    { x: back.x - perp.x * half, y: back.y - perp.y * half },
  ]
}
