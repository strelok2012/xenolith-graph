// The `warehouse` custom widget: a read-only stockpile of unclaimed goodies (those whose goodie node
// has no subscriber). The host pushes a { type: count } object as the widget value each tick via
// editor.setWidgetValue; this draws one row per type. Nothing is interactive (no onPointer).

import type { CanvasWidgetController } from '@xenolith/editor'

export interface StockEntry {
  type: string
  count: number
}

/** Normalise a { type: count } stock object into sorted rows (highest count first). */
export function stockEntries(value: unknown): StockEntry[] {
  if (typeof value !== 'object' || value === null) return []
  return Object.entries(value as Record<string, unknown>)
    .map(([type, c]) => ({ type, count: typeof c === 'number' ? c : 0 }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
}

/** Clip `s` to `maxWidth` px, adding an ellipsis — so a long type id never bleeds past the node. */
function ellipsize(ctx: CanvasRenderingContext2D, s: string, maxWidth: number): string {
  if (maxWidth <= 0 || ctx.measureText(s).width <= maxWidth) return s
  let lo = 0
  let hi = s.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return s.slice(0, lo) + '…'
}

export const warehouseWidget: CanvasWidgetController = {
  draw(ctx, { value, width, height, accent, text, muted }) {
    const entries = stockEntries(value)
    ctx.font = '11px Inter'
    ctx.textBaseline = 'middle'
    if (entries.length === 0) {
      ctx.fillStyle = muted
      ctx.fillText('empty', 0, height / 2)
      return
    }
    const rowH = Math.min(18, height / entries.length)
    const countCol = 28 // reserved width for the right-aligned count
    entries.forEach((e, i) => {
      const y = rowH * i + rowH / 2
      ctx.fillStyle = text
      ctx.textAlign = 'left'
      ctx.fillText(ellipsize(ctx, e.type, width - countCol), 0, y)
      ctx.fillStyle = e.count > 0 ? accent : muted
      ctx.textAlign = 'right'
      ctx.fillText(String(e.count), width, y)
    })
    ctx.textAlign = 'left'
  },
}
