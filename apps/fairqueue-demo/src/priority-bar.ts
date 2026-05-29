// The `priorityBar` custom widget: a diverging bar centred on the 0 reference. Positive priority
// fills right of centre (theme accent, "ahead in the queue"), negative fills left (muted, "recently
// served"). It is fully two-way bound (the CanvasWidgetDemo pattern): the host pushes the live
// signed value each tick via `editor.setWidgetValue`, and dragging the bar returns a new value that
// the editor commits and reports through `widget:changed`, which the host writes back into the sim —
// that's the "drag a bar and watch the tax relax it toward 0" interaction.

import type { CanvasWidgetController } from '@xenolith/editor'

export const SCALE = 3 // ± priority shown full-scale; 0 reference sits at the centre

/** Signed priority → [-1, 1] fraction of a half-bar (negative = left of centre, positive = right). */
export function signedFraction(value: number, scale = SCALE): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(-1, Math.min(1, value / scale))
}

/** Pointer x within the bar → signed priority (inverse of signedFraction; centre maps to 0). */
export function pointerToValue(x: number, width: number, scale = SCALE): number {
  if (width <= 0) return 0
  return Math.max(-scale, Math.min(scale, ((2 * x) / width - 1) * scale))
}

export const priorityBar: CanvasWidgetController = {
  draw(ctx, { value, width, height, accent, muted }) {
    const v = typeof value === 'number' ? value : 0
    const barH = 10
    const barY = height - barH
    const cx = width / 2
    const half = width / 2
    const f = signedFraction(v)

    ctx.fillStyle = muted // signed readout, top-left
    ctx.font = '11px Inter'
    ctx.textBaseline = 'top'
    ctx.fillText(`${v >= 0 ? '+' : ''}${v.toFixed(2)}`, 0, 0)

    ctx.fillStyle = 'rgba(255,255,255,0.10)' // track
    ctx.fillRect(0, barY, width, barH)

    if (f >= 0) {
      ctx.fillStyle = accent // ahead of the queue → right of centre
      ctx.fillRect(cx, barY, half * f, barH)
    } else {
      ctx.fillStyle = muted // recently served → left of centre
      ctx.fillRect(cx + half * f, barY, -half * f, barH)
    }

    ctx.fillStyle = 'rgba(255,255,255,0.55)' // 0 reference tick at centre
    ctx.fillRect(cx - 0.5, barY - 2, 1.5, barH + 4)
  },
  onPointer(phase, x, _y, { width }) {
    if (phase === 'up') return undefined
    return pointerToValue(x, width)
  },
}
