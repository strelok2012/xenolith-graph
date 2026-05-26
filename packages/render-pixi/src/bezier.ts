import type { PinLayout } from './layout.js'

export interface Vec2 {
  x: number
  y: number
}

export interface EdgePath {
  start: Vec2
  c1: Vec2
  c2: Vec2
  end: Vec2
}

export interface EdgeTokens {
  /** Fraction of horizontal distance used as the handle spread. 0..1. */
  bezierTension: number
  /** Minimum handle spread in pixels, applied even when pins are very close horizontally. */
  minHorizontalSpread: number
}

export function computeEdgePath(from: PinLayout, to: PinLayout, tokens: EdgeTokens): EdgePath {
  const dx = Math.abs(to.x - from.x)
  const spread = Math.max(tokens.minHorizontalSpread, dx * tokens.bezierTension)
  const fromSign = from.side === 'right' ? 1 : -1
  const toSign   = to.side   === 'right' ? 1 : -1
  return {
    start: { x: from.x, y: from.y },
    c1:    { x: from.x + fromSign * spread, y: from.y },
    c2:    { x: to.x   + toSign   * spread, y: to.y },
    end:   { x: to.x, y: to.y },
  }
}

/** Point on the cubic bezier at t=0.5 — the wire's visual midpoint, where the edge handle dot is
 *  drawn and right-click picking is anchored. */
export function bezierMidpoint(path: EdgePath): Vec2 {
  return {
    x: 0.125 * path.start.x + 0.375 * path.c1.x + 0.375 * path.c2.x + 0.125 * path.end.x,
    y: 0.125 * path.start.y + 0.375 * path.c1.y + 0.375 * path.c2.y + 0.125 * path.end.y,
  }
}

/** Unit tangent at the end of the curve — the direction the wire is travelling as it arrives at the
 *  target pin. Used to orient an arrowhead. Falls back to the start→end direction for a degenerate
 *  (zero-length) final handle segment. */
export function endTangent(path: EdgePath): Vec2 {
  let dx = path.end.x - path.c2.x
  let dy = path.end.y - path.c2.y
  let len = Math.hypot(dx, dy)
  if (len < 1e-6) {
    dx = path.end.x - path.start.x
    dy = path.end.y - path.start.y
    len = Math.hypot(dx, dy) || 1
  }
  return { x: dx / len, y: dy / len }
}

/** Triangle for an arrowhead at the curve's end: `[tip, left, right]`. The tip sits on the end
 *  point; the base is `size` px back along the incoming tangent and `size` wide. */
export function arrowHead(path: EdgePath, size: number): [Vec2, Vec2, Vec2] {
  const dir = endTangent(path)
  const back = { x: path.end.x - dir.x * size, y: path.end.y - dir.y * size }
  const perp = { x: dir.y, y: -dir.x }
  const half = size * 0.5
  return [
    { x: path.end.x, y: path.end.y },
    { x: back.x + perp.x * half, y: back.y + perp.y * half },
    { x: back.x - perp.x * half, y: back.y - perp.y * half },
  ]
}

export function sampleBezier(path: EdgePath, steps: number): Vec2[] {
  if (steps < 1) throw new Error(`sampleBezier: steps must be >= 1, got ${steps}`)
  const out: Vec2[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const tt = t * t
    const uu = u * u
    const uuu = uu * u
    const ttt = tt * t
    const a = uuu
    const b = 3 * uu * t
    const c = 3 * u * tt
    const d = ttt
    out.push({
      x: a * path.start.x + b * path.c1.x + c * path.c2.x + d * path.end.x,
      y: a * path.start.y + b * path.c1.y + c * path.c2.y + d * path.end.y,
    })
  }
  return out
}
