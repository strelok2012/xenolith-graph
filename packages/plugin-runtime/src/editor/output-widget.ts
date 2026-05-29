// Canvas-widget renderer for the `Output` primitive — draws whatever value the Output node received
// straight into the node. Generic: supports number / string / bool / array / object. Registered by
// `runtimePlugin.install` so any host that uses the plugin gets Output rendering out of the box.

import type { CanvasWidgetController } from '@xenolith/editor'

function format(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'string' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  if (typeof value === 'object') return `${Object.keys(value as object).length} fields`
  return String(value)
}

export const outputWidget: CanvasWidgetController = {
  draw(ctx, { value, width, height, accent, muted }) {
    ctx.fillStyle = accent
    ctx.font = '24px Inter'
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'right'
    ctx.fillText(format(value), width, height / 2)
    ctx.fillStyle = muted
    ctx.font = '9px Inter'
    ctx.textAlign = 'left'
    ctx.fillText('output', 0, height - 4)
  },
}
