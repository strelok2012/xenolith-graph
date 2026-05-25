import { BitmapText, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import { comboOptions, widgetValue, type Node, type WidgetSpec, type WidgetStyle } from '@xenolith/core'
import type { XenTokens } from '@xenolith/theme-xen'

/** Context handed to a custom widget's draw/pointer callbacks. Coords are widget-local CSS px.
 *  Theme colours (`accent`/`text`/`muted`) come from the resolved widget tokens so a canvas widget
 *  can match the active theme (gold on Xen, cyan on Liquid Glass) instead of hardcoding — unless
 *  the widget's own `style` overrode them. */
export interface CustomWidgetContext {
  value: unknown
  node: Node
  width: number
  height: number
  accent: string
  text: string
  muted: string
}

/** Canvas-draw custom widget — paints into a 2D canvas we own (uploaded to a texture; the primary,
 *  perf-friendly path, no foreignObject). `onPointer` returns the new value (or undefined for no
 *  change) during a drag; the editor commits it. */
export interface CanvasWidgetController {
  draw(ctx: CanvasRenderingContext2D, c: CustomWidgetContext): void
  onPointer?(phase: 'down' | 'move' | 'up', x: number, y: number, c: CustomWidgetContext): unknown
}

/** DOM-mounted custom widget — the editor positions a real HTML element over the widget (in screen
 *  space, kept in sync with pan/zoom/drag). This is the contract the React/Vue/Svelte adapters wrap
 *  (mount a framework component into `el`); vanilla implements it directly. `setValue` commits
 *  (undoable). `update` fires on external value changes. Return a cleanup fn from `mount` or
 *  implement `unmount`. */
export interface DomWidgetController {
  mount(el: HTMLElement, c: CustomWidgetContext & { setValue: (v: unknown) => void }): void | (() => void)
  update?(c: CustomWidgetContext): void
  unmount?(): void
}

/** A custom widget controller — either canvas-draw (fast, WebGL texture) or DOM-mounted (arbitrary
 *  HTML / framework component). `editor.registerWidget(name, controller)` accepts either. */
export type CustomWidgetController = CanvasWidgetController | DomWidgetController

export function isDomWidgetController(c: CustomWidgetController): c is DomWidgetController {
  return 'mount' in c
}

/** Fully-resolved widget visuals: the theme's widget tokens with a widget's own `style` override
 *  applied on top. Both the WebGL renderer and the editor's DOM editor resolve through this so a
 *  per-widget override customises every surface consistently. */
export interface ResolvedWidgetStyle {
  bg: string; bgHover: string; bgFocused: string; track: string; fill: string; fillAlpha: number
  text: string; label: string; placeholder: string; border: string; borderFocused: string
  selection: string; knob: string
  radius: number; paddingX: number; paddingY: number; borderWidth: number
  toggleWidth: number; toggleHeight: number
}

export function resolveWidgetStyle(tokens: XenTokens, override?: WidgetStyle): ResolvedWidgetStyle {
  const c = tokens.color.widget
  const g = tokens.geometry.widget
  const o = override ?? {}
  return {
    bg: o.bg ?? c.bg, bgHover: o.bgHover ?? c.bgHover, bgFocused: o.bgFocused ?? c.bgFocused,
    track: o.track ?? c.track, fill: o.fill ?? c.fill, fillAlpha: o.fillAlpha ?? c.fillAlpha,
    text: o.text ?? c.text, label: o.label ?? c.label, placeholder: o.placeholder ?? c.placeholder,
    border: o.border ?? c.border, borderFocused: o.borderFocused ?? c.borderFocused,
    selection: o.selection ?? c.selection, knob: o.knob ?? c.knob,
    radius: o.radius ?? g.radius, paddingX: o.paddingX ?? g.paddingX, paddingY: o.paddingY ?? g.paddingY,
    borderWidth: o.borderWidth ?? g.borderWidth,
    toggleWidth: o.toggleWidth ?? g.toggleWidth, toggleHeight: o.toggleHeight ?? g.toggleHeight,
  }
}

/** The active widget theme as CSS custom properties. The editor sets these on each DOM-mounted
 *  custom widget's host element, so a widget author (any framework, or vanilla) can style with
 *  `var(--xeno-accent)`, `var(--xeno-bg)`, … and look correct in every theme — and restyle for free
 *  when the theme changes. This is the basis for a theme-agnostic widget/plugin ecosystem. */
export function widgetCssVars(c: ResolvedWidgetStyle): Record<string, string> {
  return {
    '--xeno-accent': c.fill,
    '--xeno-bg': c.bg,
    '--xeno-bg-hover': c.bgHover,
    '--xeno-bg-focused': c.bgFocused,
    '--xeno-track': c.track,
    '--xeno-text': c.text,
    '--xeno-muted': c.label,
    '--xeno-placeholder': c.placeholder,
    '--xeno-border': c.border,
    '--xeno-border-focused': c.borderFocused,
    '--xeno-selection': c.selection,
    '--xeno-knob': c.knob,
    '--xeno-radius': `${c.radius}px`,
    '--xeno-padding-x': `${c.paddingX}px`,
    '--xeno-padding-y': `${c.paddingY}px`,
    '--xeno-border-width': `${c.borderWidth}px`,
  }
}

/** The active theme as panel/control CSS custom properties. The editor sets these on the host root
 *  so in-editor chrome — `<XenolithPanel>`, `<XenolithControls>`, buttons, any framework component
 *  portalled into `editor.overlayRoot` — styles with `var(--xeno-panel)`, `var(--xeno-accent)`, …
 *  and restyles for free on `setTheme`. Complements `widgetCssVars` (per-widget input surfaces);
 *  shares the `--xeno-accent`/`--xeno-text`/`--xeno-muted`/`--xeno-border`/`--xeno-radius` vocabulary. */
export function themeCssVars(tokens: XenTokens): Record<string, string> {
  const c = tokens.color
  return {
    '--xeno-accent': c.widget.fill,
    '--xeno-canvas': c.surface.canvas,
    '--xeno-panel': c.surface.panel,
    '--xeno-elevated': c.surface.elevated,
    '--xeno-surface-muted': c.surface.muted,
    '--xeno-text': c.text.primary,
    '--xeno-text-secondary': c.text.secondary,
    '--xeno-muted': c.text.muted,
    '--xeno-border': c.surface.outline,
    '--xeno-divider': c.surface.divider,
    '--xeno-radius': `${tokens.geometry.widget.radius}px`,
  }
}

export interface WidgetLayoutTokens {
  node: { headerHeight: number }
  pin: { rowSpacing: number; rowHeight: number }
  header: { toPinsGap: number }
  widget: { rowHeight: number; gap: number; paddingX: number }
}

export interface WidgetRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

function widgetRowHeight(w: WidgetSpec, rowHeight: number): number {
  // Labelled text puts its label on a row ABOVE the field box, so it needs an extra row.
  if (w.type === 'text') {
    const field = w.multiline ? rowHeight * 3 : rowHeight
    return w.label ? field + rowHeight : field
  }
  if (w.type === 'custom') return w.height ?? rowHeight * 4
  return rowHeight
}

/** Local-space rects for each widget row, stacked below the pin block. Pure — drives both drawing
 *  and hit-testing so they never disagree. */
export function computeWidgetRects(node: Node, width: number, tokens: WidgetLayoutTokens): WidgetRect[] {
  if (!node.widgets || node.widgets.length === 0) return []
  let inCount = 0, outCount = 0
  for (const p of node.pins) (p.direction === 'in' ? inCount++ : outCount++)
  const rows = Math.max(inCount, outCount)
  const pinRowsHeight = rows > 0 ? rows * tokens.pin.rowHeight + (rows - 1) * tokens.pin.rowSpacing : 0
  const padX = tokens.widget.paddingX

  let y = tokens.node.headerHeight + tokens.header.toPinsGap + pinRowsHeight + tokens.widget.gap
  const out: WidgetRect[] = []
  for (const w of node.widgets) {
    const height = widgetRowHeight(w, tokens.widget.rowHeight)
    out.push({ id: w.id, x: padX, y, width: width - padX * 2, height })
    y += height + tokens.widget.gap
  }
  return out
}

export interface WidgetHit {
  id: string
  spec: WidgetSpec
  rect: WidgetRect
}

export interface WidgetsView {
  container: Container
  rects: WidgetRect[]
  /** Hit-test a node-local point; returns the widget under it (skips disabled / button-less). */
  widgetHit(localX: number, localY: number): WidgetHit | null
  /** Cheaply refresh one widget's visual to a new value (used during live slider/number drag). */
  update(id: string, value: unknown): void
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

/** Builds the WebGL widget rows for a node's expanded form. Pure PIXI — interaction is wired by the
 *  editor against `widgetHit`. */
export function renderWidgets(
  node: Node,
  width: number,
  tokens: XenTokens,
  layoutTokens: WidgetLayoutTokens,
  customWidgets?: ReadonlyMap<string, CustomWidgetController>,
): WidgetsView {
  const container = new Container({ label: `widgets:${node.id}` })
  const rects = computeWidgetRects(node, width, layoutTokens)
  const fontFamily = tokens.typography.fontFamily
  const labelSize = tokens.typography.label.size
  const wRowHeight = layoutTokens.widget.rowHeight
  const byId = new Map<string, { spec: WidgetSpec; redraw: (value: unknown) => void }>()
  const specById = new Map(node.widgets?.map((w) => [w.id, w]) ?? [])

  for (const rect of rects) {
    const spec = specById.get(rect.id)!
    // Per-widget resolved style: theme widget tokens + this widget's own `style` override.
    const c = resolveWidgetStyle(tokens, spec.style)
    const radius = c.radius, padX = c.paddingX, padY = c.paddingY, borderW = c.borderWidth
    const row = new Container()
    row.position.set(rect.x, rect.y)
    container.addChild(row)

    // Custom widget: canvas-draw path paints into a 2D canvas → texture. DOM-mounted controllers
    // are positioned over the widget by the editor; here we just leave the (transparent) rect.
    const controller = spec.type === 'custom' ? customWidgets?.get(spec.renderer) : undefined
    if (spec.type === 'custom' && controller && !isDomWidgetController(controller) && typeof document !== 'undefined') {
      const dpr = Math.min(2, (globalThis.devicePixelRatio || 1))
      const cv = document.createElement('canvas')
      cv.width = Math.max(1, Math.round(rect.width * dpr))
      cv.height = Math.max(1, Math.round(rect.height * dpr))
      const c2d = cv.getContext('2d')!
      const tex = Texture.from({ resource: cv })
      const sprite = new Sprite(tex)
      sprite.width = rect.width
      sprite.height = rect.height
      row.addChild(sprite)
      const redraw = (value: unknown): void => {
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0)
        c2d.clearRect(0, 0, rect.width, rect.height)
        controller.draw(c2d, { value, node, width: rect.width, height: rect.height, accent: c.fill, text: c.text, muted: c.label })
        tex.source.update()
      }
      redraw(widgetValue(node, spec))
      byId.set(rect.id, { spec, redraw })
      continue
    }

    const label = (text: string, color = c.label, align: 'left' | 'right' = 'left'): BitmapText => {
      const t = new BitmapText({ text, style: { fontFamily, fontSize: labelSize, fontWeight: '500', fill: color } })
      t.anchor.set(align === 'right' ? 1 : 0, 0.5)
      t.position.set(align === 'right' ? rect.width - padX : padX, rect.height / 2)
      return t
    }

    // Static layers (built once): field background/border + static label. Dynamic layer (slider
    // fill, toggle knob) + value text are MUTATED in `redraw`, never recreated — recreating Text
    // every frame both garbled the node (stacked copies) and churned GPU textures.
    const field = (g: Graphics): Graphics =>
      g.roundRect(0, 0, rect.width, rect.height, radius).fill({ color: c.bg }).stroke({ color: c.border, width: borderW })
    const bg = new Graphics()
    const dyn = new Graphics()
    row.addChild(bg, dyn)
    let valueText: BitmapText | Text | null = null

    switch (spec.type) {
      case 'number':
      case 'slider':
        if (spec.type === 'number') field(bg)
        else bg.roundRect(0, 0, rect.width, rect.height, radius).fill({ color: c.track })
        row.addChild(label(spec.label))
        valueText = label('', c.text, 'right')
        row.addChild(valueText)
        break
      case 'combo': {
        field(bg)
        const cx = rect.width - padX, cy = rect.height / 2
        bg.moveTo(cx - 7, cy - 2).lineTo(cx - 3.5, cy + 2).lineTo(cx, cy - 2).stroke({ color: c.label, width: 1.2 })
        valueText = label('', c.text, 'left')
        row.addChild(valueText)
        // Clip so a long value doesn't run under/past the chevron.
        const clip = new Graphics().rect(padX, 0, rect.width - padX * 2 - 8, rect.height).fill({ color: 0xffffff })
        row.addChild(clip)
        valueText.mask = clip
        break
      }
      case 'text': {
        // The label sits on its own row ABOVE the field box (outside it); the box (bg + value +
        // the DOM editor) occupies the area below. A label-less text widget is just the box.
        const hasLabel = spec.label.length > 0
        const boxTop = hasLabel ? wRowHeight : 0
        bg.roundRect(0, boxTop, rect.width, rect.height - boxTop, radius).fill({ color: c.bg }).stroke({ color: c.border, width: borderW })
        if (hasLabel) {
          const lab = label(spec.label)
          lab.anchor.set(0, 0.5); lab.position.set(padX, boxTop / 2)
          row.addChild(lab)
        }
        // Editable text VALUE stays a regular Text (not BitmapText) so its vertical metrics match
        // the DOM <textarea>/<input> editor exactly — otherwise the glyphs jump on focus.
        valueText = new Text({
          text: '',
          style: { fontFamily, fontSize: labelSize, fontWeight: '400', fill: c.text,
            wordWrap: !!spec.multiline, wordWrapWidth: rect.width - padX * 2, breakWords: true,
            ...(spec.multiline ? { lineHeight: labelSize * 1.2 } : {}) },
        })
        valueText.anchor.set(0, spec.multiline ? 0 : 0.5)
        valueText.position.set(padX, spec.multiline ? boxTop + padY : boxTop + (rect.height - boxTop) / 2)
        row.addChild(valueText)
        const clip = new Graphics().rect(padX, boxTop, rect.width - padX * 2, rect.height - boxTop).fill({ color: 0xffffff })
        row.addChild(clip)
        valueText.mask = clip
        break
      }
      case 'toggle':
      case 'color':
        row.addChild(label(spec.label))
        break
      case 'button': {
        bg.roundRect(0, 0, rect.width, rect.height, radius).fill({ color: c.track })
        const t = label(spec.label, c.text, 'left')
        t.anchor.set(0.5, 0.5)
        t.position.set(rect.width / 2, rect.height / 2)
        t.style.fontWeight = '600'
        row.addChild(t)
        break
      }
      case 'custom':
        // DOM-mounted controllers own their whole rect (the editor positions the element over it) —
        // draw nothing, or we'd paint a label/box UNDER the live element. Only a custom widget with
        // no registered controller gets a placeholder box+label so it isn't invisible.
        if (!(controller && isDomWidgetController(controller))) {
          field(bg)
          row.addChild(label(spec.label))
        }
        break
    }

    const redraw = (value: unknown): void => {
      switch (spec.type) {
        case 'number':
          if (valueText) valueText.text = spec.unit ? `${value}${spec.unit}` : String(value)
          break
        case 'slider': {
          const frac = spec.max > spec.min ? Math.min(1, Math.max(0, (num(value) - spec.min) / (spec.max - spec.min))) : 0
          dyn.clear().roundRect(0, 0, rect.width * frac, rect.height, radius).fill({ color: c.fill, alpha: c.fillAlpha })
          if (valueText) valueText.text = String(value)
          break
        }
        case 'combo': {
          const opt = comboOptions(spec).find((o) => o.value === value)
          if (valueText) valueText.text = String(opt?.label ?? value)
          break
        }
        case 'text': {
          const s = String(value ?? '')
          if (valueText) {
            valueText.text = s.length > 0 ? s : (spec.placeholder ?? '')
            valueText.style.fill = s ? c.text : c.placeholder
          }
          break
        }
        case 'toggle': {
          const on = Boolean(value)
          const trackW = c.toggleWidth, trackH = c.toggleHeight, tx = rect.width - trackW, ty = (rect.height - trackH) / 2
          dyn.clear()
            .roundRect(tx, ty, trackW, trackH, trackH / 2).fill({ color: on ? c.fill : c.track })
            .circle(on ? tx + trackW - trackH / 2 : tx + trackH / 2, ty + trackH / 2, trackH / 2 - 2).fill({ color: c.knob })
          break
        }
        case 'color': {
          const sw = 40, sh = rect.height - padY * 2, sx = rect.width - sw, sy = padY
          dyn.clear().roundRect(sx, sy, sw, sh, radius).fill({ color: String(value) || '#000000' }).stroke({ color: c.border, width: borderW })
          break
        }
        default:
          break
      }
    }
    redraw(widgetValue(node, spec))
    byId.set(rect.id, { spec, redraw })
  }

  return {
    container,
    rects,
    widgetHit(localX, localY) {
      for (const rect of rects) {
        const spec = specById.get(rect.id)!
        if (spec.disabled) continue
        if (localX >= rect.x && localX <= rect.x + rect.width && localY >= rect.y && localY <= rect.y + rect.height) {
          return { id: rect.id, spec, rect }
        }
      }
      return null
    },
    update(id, value) {
      byId.get(id)?.redraw(value)
    },
  }
}
