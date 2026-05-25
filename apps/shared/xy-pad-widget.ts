import type { CanvasWidgetController } from '@xenolith/editor'

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

export const XYPAD_DEFAULT = { x: 0.5, y: 0.5 }

function vec(value: unknown): { x: number; y: number } {
  const v = value as { x?: number; y?: number } | undefined
  return { x: typeof v?.x === 'number' ? clamp01(v.x) : 0.5, y: typeof v?.y === 'number' ? clamp01(v.y) : 0.5 }
}

/** Canvas-draw XY-pad: drag the dot anywhere in the square to set a 2D value (x, y) in 0..1, y-up.
 *  A second hero custom widget — different interaction model from the curve (direct 2D positioning). */
export function createXYPadWidget(): CanvasWidgetController {
  return {
    draw(ctx, { value, width: w, height: h, accent }) {
      const { x, y } = vec(value)
      const px = x * w, py = (1 - y) * h
      // backdrop
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)'
      ctx.beginPath(); ctx.roundRect(0.5, 0.5, w - 1, h - 1, 5); ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'; ctx.lineWidth = 1; ctx.stroke()
      // grid quarters
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)'; ctx.beginPath()
      for (let i = 1; i < 4; i++) { ctx.moveTo((i / 4) * w, 0); ctx.lineTo((i / 4) * w, h); ctx.moveTo(0, (i / 4) * h); ctx.lineTo(w, (i / 4) * h) }
      ctx.stroke()
      // crosshair through the point (accent, dimmed)
      ctx.save(); ctx.globalAlpha = 0.45
      ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.beginPath()
      ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke()
      ctx.restore()
      // handle
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#FFFFFF'; ctx.fill()
      ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.stroke()
      // readout
      ctx.fillStyle = 'rgba(220, 232, 255, 0.7)'; ctx.font = "10px 'Inter', system-ui, sans-serif"
      ctx.textBaseline = 'top'
      ctx.fillText(`${x.toFixed(2)}, ${y.toFixed(2)}`, 6, 5)
    },

    onPointer(phase, x, y, { width: w, height: h }) {
      if (phase === 'up') return undefined
      return { x: clamp01(x / w), y: clamp01(1 - y / h) }
    },
  }
}
