import type { CanvasWidgetController } from '@xenolith/editor'

/** Default for an always-visible preview: empty string. The widget renders whatever value its
 *  bound pin is currently carrying — that's the canon's `visibility:'always'` path. */
export const PREVIEW_DEFAULT = ''

/** Read-only display widget — renders the current value of the bound pin as text. Used to
 *  showcase the `visibility:'always'` mode of the widget canon: the widget stays visible when
 *  the pin is wired and shows the live runtime value (via editor.setPinLiveValueProvider). With
 *  no runtime provider it just shows the state default. */
export function createPreviewWidget(): CanvasWidgetController {
  return {
    draw(ctx, { value, width: w, height: h, text }) {
      // muted backdrop
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
      ctx.beginPath(); ctx.roundRect(0.5, 0.5, w - 1, h - 1, 5); ctx.fill()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.lineWidth = 1; ctx.stroke()
      // Render the value as text. Strings/numbers go in directly; structured values get JSON,
      // truncated to keep the row's height usable.
      const raw = value === undefined || value === null ? '—' :
        (typeof value === 'string' || typeof value === 'number') ? String(value) :
        JSON.stringify(value).slice(0, 64)
      ctx.fillStyle = text
      ctx.font = '11px Inter, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.fillText(raw, 8, h / 2)
    },
  }
}
