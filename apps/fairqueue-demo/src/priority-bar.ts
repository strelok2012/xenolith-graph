// The `priorityBar` custom widget: a horizontal bar showing an agent's priority RELATIVE to the
// current equilibrium (the geometric mean), so 1.0× sits at the midpoint. Above-equilibrium fills
// in the theme accent, below in muted. It is fully two-way bound (the CanvasWidgetDemo pattern):
// the host pushes live values each tick via `editor.setWidgetValue`, and dragging the bar returns a
// new value that the editor commits and reports through `widget:changed`, which the host writes
// back into the sim — that's the "drag a bar and watch the tax relax it" interaction.

import type { CanvasWidgetController } from '@xenolith/editor'

export const SCALE_MAX = 2 // relative priority shown full-scale; equilibrium 1.0 = midpoint

/** Relative priority → [0,1] fill fraction of the bar. */
export function barFraction(value: number, scaleMax = SCALE_MAX): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(1, value / scaleMax)
}

/** Pointer x within the bar → relative priority value (inverse of barFraction). */
export function pointerToValue(x: number, width: number, scaleMax = SCALE_MAX): number {
  if (width <= 0) return 0
  return Math.max(0, Math.min(scaleMax, (x / width) * scaleMax))
}

export const priorityBar: CanvasWidgetController = {
  draw(ctx, { value, width, height, accent, muted }) {
    const v = typeof value === 'number' ? value : 0
    const barH = 10
    const barY = height - barH
    const frac = barFraction(v)

    ctx.fillStyle = muted // readout, top-left
    ctx.font = '11px Inter'
    ctx.textBaseline = 'top'
    ctx.fillText(`${v.toFixed(2)}×`, 0, 0)

    ctx.fillStyle = 'rgba(255,255,255,0.10)' // track
    ctx.fillRect(0, barY, width, barH)

    ctx.fillStyle = v >= 1 ? accent : muted // fill: accent above equilibrium, muted below
    ctx.fillRect(0, barY, width * frac, barH)

    const eqX = width / SCALE_MAX // equilibrium tick at 1.0×
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillRect(eqX - 0.5, barY - 2, 1.5, barH + 4)
  },
  onPointer(phase, x, _y, { width }) {
    if (phase === 'up') return undefined
    return pointerToValue(x, width)
  },
}
