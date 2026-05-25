import type { CanvasWidgetController } from '@xenolith/editor'

/** A point on the curve, normalised to 0..1 (x = input, y = output, y-up). */
export interface CurvePoint { x: number; y: number }

export const CURVE_DEFAULT: CurvePoint[] = [{ x: 0, y: 0 }, { x: 0.45, y: 0.65 }, { x: 1, y: 1 }]
const DEFAULT = CURVE_DEFAULT
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

function points(value: unknown): CurvePoint[] {
  const arr = Array.isArray(value) && value.length >= 2
    ? value.filter((p): p is CurvePoint => typeof p?.x === 'number' && typeof p?.y === 'number')
    : DEFAULT
  return [...arr].sort((a, b) => a.x - b.x)
}

/** Canvas-draw curve editor: drag the control points; endpoints are x-locked. Value is a sorted
 *  array of {x,y} in 0..1. A hero example of a custom widget — pure 2D-canvas, no DOM. */
export function createCurveWidget(): CanvasWidgetController {
  let grabbed = -1
  const HANDLE = 4

  return {
    draw(ctx, { value, width: w, height: h, accent }) {
      const pts = points(value)
      // backdrop
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
      ctx.beginPath(); ctx.roundRect(0.5, 0.5, w - 1, h - 1, 5); ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'; ctx.lineWidth = 1; ctx.stroke()
      // grid (quarters)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'
      ctx.beginPath()
      for (let i = 1; i < 4; i++) {
        ctx.moveTo((i / 4) * w, 0); ctx.lineTo((i / 4) * w, h)
        ctx.moveTo(0, (i / 4) * h); ctx.lineTo(w, (i / 4) * h)
      }
      ctx.stroke()
      // curve — Catmull-Rom through the points
      const px = (p: CurvePoint): number => p.x * w
      const py = (p: CurvePoint): number => (1 - p.y) * h
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.lineJoin = 'round'
      ctx.beginPath(); ctx.moveTo(px(pts[0]!), py(pts[0]!))
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[i + 2] ?? p2
        ctx.bezierCurveTo(
          px(p1) + (px(p2) - px(p0)) / 6, py(p1) + (py(p2) - py(p0)) / 6,
          px(p2) - (px(p3) - px(p1)) / 6, py(p2) - (py(p3) - py(p1)) / 6,
          px(p2), py(p2),
        )
      }
      ctx.stroke()
      // handles
      for (const p of pts) {
        ctx.beginPath(); ctx.arc(px(p), py(p), HANDLE, 0, Math.PI * 2)
        ctx.fillStyle = '#FFFFFF'; ctx.fill()
        ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke()
      }
    },

    onPointer(phase, x, y, { value, width: w, height: h }) {
      const pts = points(value).map((p) => ({ ...p }))
      if (phase === 'down') {
        grabbed = pts.findIndex((p) => Math.hypot(p.x * w - x, (1 - p.y) * h - y) < 11)
        return undefined
      }
      if (grabbed < 0) return undefined
      if (phase === 'up') { grabbed = -1; return undefined }
      const last = pts.length - 1
      const nx = grabbed === 0 ? 0 : grabbed === last ? 1 : clamp01(x / w)
      pts[grabbed] = { x: nx, y: clamp01(1 - y / h) }
      return pts
    },
  }
}
