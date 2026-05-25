import type { PaletteStyle } from '@xenolith/render-pixi'

const DEFAULT_STYLE: PaletteStyle = {
  panelBackground:       '#191919',
  panelBorder:           '#424242',
  panelShadow:           '0 16px 48px rgba(0, 0, 0, 0.6)',
  panelRadius:           '8px',
  textColor:             '#FFFFFF',
  mutedColor:            '#B8B8B8',
  accent:                '#FCB400',
  rowSelectedBackground: 'rgba(252, 180, 0, 0.14)',
  inputBackground:       '#0F110E',
  inputBorder:           '#363636',
}

/** Screen-space rect (px) where a widget currently sits, so the DOM editor overlaps it exactly. */
export interface OverlayRect { x: number; y: number; width: number; height: number }

function hexToHsv(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim())
  const n = m ? parseInt(m[1]!, 16) : 0
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60; if (h < 0) h += 360
  }
  return [h, max === 0 ? 0 : d / max, max]
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const hh = (n: number): string => Math.round((n + m) * 255).toString(16).padStart(2, '0')
  return `#${hh(r)}${hh(g)}${hh(b)}`
}

/** Field appearance, derived from the active theme's widget tokens (scaled to the current zoom) so
 *  the DOM editor matches the WebGL widget pixel-for-pixel — no jump on focus. */
export interface WidgetFieldStyle {
  background: string
  text: string
  border: string
  borderWidth: number
  radius: number
  paddingX: number
  paddingY: number
  fontSize: number
  fontFamily: string
  fontWeight: string
  placeholder: string
  selection: string
}

export interface TextEditOptions {
  rect: OverlayRect
  value: string
  multiline?: boolean
  placeholder?: string
  numeric?: boolean
  style: WidgetFieldStyle
  onCommit: (value: string) => void
}

export interface ComboEditOptions {
  rect: OverlayRect
  options: { label: string; value: string | number }[]
  value: unknown
  fontSize: number
  onPick: (value: string | number) => void
}

/**
 * Transient DOM editors for widgets that can't be typed into the WebGL canvas (text/number entry)
 * or need a popover (combo). One editor at a time; positioned over the widget in screen coords and
 * styled by the active theme's PaletteStyle so it matches the palette / edge-menu chrome.
 */
export class WidgetOverlay {
  readonly #host: HTMLElement
  #style: PaletteStyle
  #el: HTMLElement | null = null
  #styleTag: HTMLStyleElement | null = null
  #onDocPointerDown: ((e: Event) => void) | null = null

  constructor(host: HTMLElement, style: PaletteStyle | undefined) {
    this.#host = host
    this.#style = style ?? DEFAULT_STYLE
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
  }

  setStyle(style: PaletteStyle | undefined): void { this.#style = style ?? DEFAULT_STYLE }
  get isOpen(): boolean { return this.#el !== null }

  /** Top offset for a popover of `height` anchored under `rect`, flipping above when it would
   *  overflow the bottom of the host. */
  #popoverTop(rect: OverlayRect, height: number, gap = 6): number {
    const hostH = this.#host.clientHeight || window.innerHeight
    const below = rect.y + rect.height + gap
    const above = rect.y - height - gap
    return below + height > hostH && above >= 0 ? above : below
  }

  #ensurePseudoStyle(st: WidgetFieldStyle): void {
    if (!this.#styleTag) {
      this.#styleTag = document.createElement('style')
      this.#host.appendChild(this.#styleTag)
    }
    this.#styleTag.textContent =
      `.xeno-widget-field::placeholder{color:${st.placeholder};opacity:1}` +
      `.xeno-widget-field::selection{background:${st.selection}}`
  }

  close(): void {
    if (this.#onDocPointerDown) {
      document.removeEventListener('pointerdown', this.#onDocPointerDown, true)
      this.#onDocPointerDown = null
    }
    this.#el?.remove()
    this.#el = null
  }

  editText(opts: TextEditOptions): void {
    this.close()
    const st = opts.style
    const el = document.createElement(opts.multiline ? 'textarea' : 'input') as HTMLInputElement | HTMLTextAreaElement
    if (opts.numeric && !opts.multiline) (el as HTMLInputElement).inputMode = 'decimal'
    el.className = 'xeno-widget-field'
    el.value = opts.value
    if (opts.placeholder) el.placeholder = opts.placeholder
    // Pseudo-elements (::placeholder / ::selection) can't be set inline — drive them from a single
    // host-scoped <style> updated per open with the theme's tokens.
    this.#ensurePseudoStyle(st)
    Object.assign(el.style, {
      position:     'absolute',
      left:         `${opts.rect.x}px`,
      top:          `${opts.rect.y}px`,
      width:        `${opts.rect.width}px`,
      height:       `${opts.rect.height}px`,
      zIndex:       '1200',
      boxSizing:    'border-box',
      // Match the WebGL widget's text inset exactly so the glyphs don't jump on focus. With
      // border-box the border eats into the content area, so subtract it from the padding: text
      // then starts at `paddingX` from the OUTER edge, just like the WebGL text (whose stroke is
      // drawn over the rect and never shifts the glyphs).
      // border-box eats the border into the content area, so subtract it from padding: text then
      // starts at exactly `paddingX`/`paddingY` from the OUTER edge, matching the WebGL glyphs.
      // Both sides use the same 1.2 line-height so the first line centres identically (no Y jump).
      padding:      opts.multiline
        ? `${Math.max(0, st.paddingY - st.borderWidth)}px ${Math.max(0, st.paddingX - st.borderWidth)}px`
        : `0 ${Math.max(0, st.paddingX - st.borderWidth)}px`,
      lineHeight:   opts.multiline ? `${st.fontSize * 1.2}px` : `${opts.rect.height}px`,
      margin:       '0',
      background:   st.background,
      color:        st.text,
      border:       `${st.borderWidth}px solid ${st.border}`,
      borderRadius: `${st.radius}px`,
      outline:      'none',
      font:         `${st.fontWeight} ${st.fontSize}px ${st.fontFamily}`,
      resize:       'none',
      textAlign:    opts.numeric ? 'right' : 'left',
      ...(this.#style.backdropFilter ? { backdropFilter: this.#style.backdropFilter, WebkitBackdropFilter: this.#style.backdropFilter } : {}),
    })
    let committed = false
    const commit = (): void => {
      if (committed) return
      committed = true
      opts.onCommit(el.value)
      this.close()
    }
    const elem = el as HTMLElement
    if (opts.numeric) {
      // Allow only a numeric literal: optional leading minus, digits, single dot. Strip anything
      // else as it's typed/pasted so letters never land in the field.
      el.addEventListener('input', () => {
        const cleaned = el.value.replace(/[^0-9.-]/g, '')
          .replace(/(?!^)-/g, '')        // minus only at start
          .replace(/^(-?\d*\.\d*).*$/, '$1') // at most one dot
        if (cleaned !== el.value) el.value = cleaned
      })
    }
    elem.addEventListener('blur', commit)
    elem.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') { committed = true; this.close() }
      else if (e.key === 'Enter' && (!opts.multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
    })
    this.#host.appendChild(el)
    this.#el = el
    el.focus()
    if ('select' in el) (el as HTMLInputElement).select()
  }

  /** Themed popover colour picker anchored under the swatch — an HSV square + hue strip + hex
   *  field. Custom (not `<input type=color>`) because the OS-native panel can't be positioned and,
   *  on macOS, floats detached. `onInput` fires live while dragging; closing commits via `onCommit`. */
  editColor(opts: { rect: OverlayRect; value: string; onInput: (hex: string) => void; onCommit: (hex: string) => void }): void {
    this.close()
    const s = this.#style
    let [h, sat, val] = hexToHsv(opts.value)
    let lastHex = hsvToHex(h, sat, val)

    const root = document.createElement('div')
    Object.assign(root.style, {
      position: 'absolute', left: `${opts.rect.x}px`, top: `${this.#popoverTop(opts.rect, 200)}px`,
      width: '184px', zIndex: '1200', padding: '8px', boxSizing: 'content-box',
      background: s.panelBackground, border: `1px solid ${s.panelBorder}`,
      borderRadius: s.panelRadius ?? '10px', boxShadow: s.panelShadow ?? '0 16px 48px rgba(0,0,0,0.6)',
      ...(s.backdropFilter ? { backdropFilter: s.backdropFilter, WebkitBackdropFilter: s.backdropFilter } : {}),
    })

    // SV square: hue base + white→right + black→bottom gradients.
    const sv = document.createElement('div')
    Object.assign(sv.style, {
      position: 'relative', width: '184px', height: '120px', borderRadius: '6px', cursor: 'crosshair',
      touchAction: 'none', overflow: 'hidden',
    })
    const svHandle = document.createElement('div')
    Object.assign(svHandle.style, {
      position: 'absolute', width: '12px', height: '12px', borderRadius: '50%',
      border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', transform: 'translate(-50%,-50%)', pointerEvents: 'none',
    })
    sv.appendChild(svHandle)

    // Hue strip.
    const hue = document.createElement('div')
    Object.assign(hue.style, {
      position: 'relative', width: '184px', height: '12px', marginTop: '8px', borderRadius: '6px',
      cursor: 'pointer', touchAction: 'none',
      background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)',
    })
    const hueHandle = document.createElement('div')
    Object.assign(hueHandle.style, {
      position: 'absolute', top: '-2px', width: '4px', height: '16px', borderRadius: '2px',
      background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.4)', transform: 'translateX(-50%)', pointerEvents: 'none',
    })
    hue.appendChild(hueHandle)

    const hex = document.createElement('input')
    hex.className = 'xeno-widget-field'
    Object.assign(hex.style, {
      width: '100%', boxSizing: 'border-box', marginTop: '8px', padding: '4px 8px',
      background: s.inputBackground, color: s.textColor, border: `1px solid ${s.inputBorder ?? s.panelBorder}`,
      borderRadius: '6px', outline: 'none', font: `500 12px 'Inter', system-ui, sans-serif`,
    })

    const paint = (): void => {
      sv.style.background =
        `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h},100%,50%))`
      svHandle.style.left = `${sat * 184}px`
      svHandle.style.top = `${(1 - val) * 120}px`
      svHandle.style.background = lastHex
      hueHandle.style.left = `${(h / 360) * 184}px`
      if (document.activeElement !== hex) hex.value = lastHex
    }
    const emit = (): void => { lastHex = hsvToHex(h, sat, val); paint(); opts.onInput(lastHex) }
    paint()

    const dragOn = (el: HTMLElement, onMove: (e: PointerEvent) => void): void => {
      el.addEventListener('pointerdown', (e: PointerEvent) => {
        e.preventDefault(); e.stopPropagation()
        const move = (ev: PointerEvent): void => onMove(ev)
        const up = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
        onMove(e)
      })
    }
    dragOn(sv, (e) => {
      const r = sv.getBoundingClientRect()
      sat = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
      val = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))
      emit()
    })
    dragOn(hue, (e) => {
      const r = hue.getBoundingClientRect()
      h = Math.min(360, Math.max(0, ((e.clientX - r.left) / r.width) * 360))
      emit()
    })
    hex.addEventListener('input', () => {
      const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.value.trim())
      if (m) { [h, sat, val] = hexToHsv(`#${m[1]}`); lastHex = `#${m[1]!.toLowerCase()}`; paint(); opts.onInput(lastHex) }
    })

    root.append(sv, hue, hex)
    this.#host.appendChild(root)
    this.#el = root
    this.#onDocPointerDown = (e: Event): void => { if (!root.contains(e.target as Node)) { opts.onCommit(lastHex); this.close() } }
    setTimeout(() => { if (this.#onDocPointerDown) document.addEventListener('pointerdown', this.#onDocPointerDown, true) }, 0)
  }

  editCombo(opts: ComboEditOptions): void {
    this.close()
    const s = this.#style
    const estH = Math.min(248, opts.options.length * (opts.fontSize + 12) + 8)
    const root = document.createElement('div')
    Object.assign(root.style, {
      position:       'absolute',
      left:           `${opts.rect.x}px`,
      top:            `${this.#popoverTop(opts.rect, estH, 4)}px`,
      minWidth:       `${opts.rect.width}px`,
      zIndex:         '1200',
      padding:        '4px',
      background:     s.panelBackground,
      border:         `1px solid ${s.panelBorder}`,
      borderRadius:   s.panelRadius ?? '8px',
      boxShadow:      s.panelShadow ?? '0 16px 48px rgba(0,0,0,0.6)',
      font:           `500 ${opts.fontSize}px 'Inter', system-ui, sans-serif`,
      maxHeight:      '240px',
      overflowY:      'auto',
      ...(s.backdropFilter ? { backdropFilter: s.backdropFilter, WebkitBackdropFilter: s.backdropFilter } : {}),
    })
    for (const opt of opts.options) {
      const row = document.createElement('div')
      row.textContent = opt.label
      const selected = opt.value === opts.value
      Object.assign(row.style, {
        padding:      '6px 10px',
        borderRadius: '5px',
        cursor:       'pointer',
        color:        s.textColor,
        background:   selected ? s.rowSelectedBackground : 'transparent',
        whiteSpace:   'nowrap',
      })
      row.addEventListener('pointerenter', () => { row.style.background = s.rowSelectedBackground })
      row.addEventListener('pointerleave', () => { row.style.background = selected ? s.rowSelectedBackground : 'transparent' })
      row.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); opts.onPick(opt.value); this.close() })
      root.appendChild(row)
    }
    this.#host.appendChild(root)
    this.#el = root
    // Close on any outside pointerdown.
    this.#onDocPointerDown = (e: Event): void => { if (!root.contains(e.target as Node)) this.close() }
    setTimeout(() => { if (this.#onDocPointerDown) document.addEventListener('pointerdown', this.#onDocPointerDown, true) }, 0)
  }
}
