import type { NodeSearchResult } from '@xenolith/core'
import type { PaletteStyle } from '@xenolith/render-pixi'

export interface PaletteCallbacks {
  /** Fuzzy search over the registry. */
  search: (query: string) => NodeSearchResult[]
  /** Commit an insertion of `type` at the screen position where the palette opened. */
  insert: (type: string, screen: { x: number; y: number }) => void
  /** Resolve a pin type to a CSS colour for the in/out pips. Falls back to a neutral grey. */
  pinColor?: (type: string) => string
}

const DEFAULT_STYLE: PaletteStyle = {
  panelBackground:       '#191919',
  panelBorder:           '#424242',
  panelShadow:           '0 16px 48px rgba(0, 0, 0, 0.6)',
  panelRadius:           '10px',
  textColor:             '#FFFFFF',
  mutedColor:            '#B8B8B8',
  accent:                '#FCB400',
  rowSelectedBackground: 'rgba(252, 180, 0, 0.14)',
  inputBackground:       '#0F110E',
  inputBorder:           '#363636',
}

/**
 * DOM insert palette — a K2 / Blueprint-style fuzzy search overlay for adding nodes. Rendered as
 * HTML (not PIXI) so it gets native focus, keyboard, and accessibility for free. Restyles with
 * the active theme via {@link PaletteStyle}.
 */
export class InsertPalette {
  readonly #host: HTMLElement
  readonly #cb: PaletteCallbacks
  #style: PaletteStyle

  #root: HTMLDivElement | null = null
  #input: HTMLInputElement | null = null
  #list: HTMLDivElement | null = null

  #open = false
  #openedAt = { x: 0, y: 0 }
  #results: NodeSearchResult[] = []
  #activeIndex = 0

  constructor(host: HTMLElement, style: PaletteStyle | undefined, cb: PaletteCallbacks) {
    this.#host = host
    this.#cb = cb
    this.#style = style ?? DEFAULT_STYLE
  }

  get isOpen(): boolean { return this.#open }

  setStyle(style: PaletteStyle | undefined): void {
    this.#style = style ?? DEFAULT_STYLE
    if (this.#open) { this.#applyStyle(); this.#renderResults() }
  }

  open(screen: { x: number; y: number }): void {
    this.#openedAt = { ...screen }
    if (!this.#root) this.#build()
    this.#open = true
    this.#root!.style.display = 'flex'
    // Re-apply style on every open — the active theme may have changed while the palette was
    // closed (setStyle updates #style but can't touch the DOM until the panel is visible).
    this.#applyStyle()
    this.#position(screen)
    this.#input!.value = ''
    this.#refilter()
    this.#input!.focus()
    // Click anywhere outside the panel dismisses it. Capture phase + next tick so the opening
    // click (double-click / Tab) doesn't immediately close it.
    setTimeout(() => document.addEventListener('pointerdown', this.#onDocPointerDown, true), 0)
  }

  close(): void {
    if (!this.#open) return
    this.#open = false
    if (this.#root) this.#root.style.display = 'none'
    document.removeEventListener('pointerdown', this.#onDocPointerDown, true)
    // Release focus so the editor's global keyboard shortcuts (undo, delete, …) work again —
    // otherwise they'd see the hidden input as the focus target and bail out.
    this.#input?.blur()
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.#onDocPointerDown, true)
    this.#root?.parentElement?.removeChild(this.#root)
    this.#root = null
  }

  readonly #onDocPointerDown = (e: PointerEvent): void => {
    if (this.#root && !this.#root.contains(e.target as globalThis.Node)) this.close()
  }

  // ---------------------------------------------------------------------------------------------

  #build(): void {
    if (getComputedStyle(this.#host).position === 'static') {
      this.#host.style.position = 'relative'
    }
    const root = document.createElement('div')
    root.setAttribute('data-xeno-palette', '')
    Object.assign(root.style, {
      position:      'absolute',
      zIndex:        '1100',
      display:       'none',
      flexDirection: 'column',
      width:         '280px',
      maxHeight:     '340px',
      overflow:      'hidden',
      fontFamily:    'ui-sans-serif, system-ui, -apple-system, Inter, sans-serif',
      fontSize:      '13px',
    } satisfies Partial<CSSStyleDeclaration>)

    const input = document.createElement('input')
    input.setAttribute('data-xeno-palette-input', '')
    input.setAttribute('placeholder', 'Search nodes…')
    input.setAttribute('spellcheck', 'false')
    Object.assign(input.style, {
      outline:    'none',
      border:     '1px solid transparent',
      margin:     '8px',
      padding:    '8px 10px',
      borderRadius: '7px',
      width:      'calc(100% - 16px)',
      boxSizing:  'border-box',
    } satisfies Partial<CSSStyleDeclaration>)

    const list = document.createElement('div')
    list.setAttribute('data-xeno-palette-list', '')
    Object.assign(list.style, {
      overflowY: 'auto',
      padding:   '0 8px 8px',
    } satisfies Partial<CSSStyleDeclaration>)

    input.addEventListener('input', () => this.#refilter())
    input.addEventListener('keydown', (e) => this.#onKeyDown(e))
    // Prevent the editor's global keydown (Tab/Delete/etc) from firing while typing.
    input.addEventListener('keyup', (e) => e.stopPropagation())

    root.appendChild(input)
    root.appendChild(list)
    this.#host.appendChild(root)
    this.#root = root
    this.#input = input
    this.#list = list
    this.#applyStyle()
  }

  #applyStyle(): void {
    const s = this.#style
    if (this.#root) {
      this.#root.style.background = s.panelBackground
      this.#root.style.border = `1px solid ${s.panelBorder}`
      this.#root.style.borderRadius = s.panelRadius ?? '10px'
      this.#root.style.boxShadow = s.panelShadow ?? 'none'
      this.#root.style.backdropFilter = s.backdropFilter ?? 'none'
      ;(this.#root.style as unknown as Record<string, string>)['-webkit-backdrop-filter'] =
        s.backdropFilter ?? 'none'
      this.#root.style.color = s.textColor
    }
    if (this.#input) {
      this.#input.style.background = s.inputBackground
      this.#input.style.border = `1px solid ${s.inputBorder ?? s.panelBorder}`
      this.#input.style.color = s.textColor
    }
  }

  #position(screen: { x: number; y: number }): void {
    const root = this.#root!
    const hostRect = this.#host.getBoundingClientRect()
    // screen coords are relative to the canvas/host; clamp so the panel stays inside the host.
    const w = 280, maxH = 340
    let x = screen.x
    let y = screen.y
    if (x + w > hostRect.width)  x = Math.max(0, hostRect.width - w - 8)
    if (y + maxH > hostRect.height) y = Math.max(0, hostRect.height - maxH - 8)
    root.style.left = `${x}px`
    root.style.top = `${y}px`
  }

  #refilter(): void {
    const q = this.#input?.value ?? ''
    this.#results = this.#cb.search(q)
    this.#activeIndex = 0
    this.#renderResults()
  }

  #onKeyDown(e: KeyboardEvent): void {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      this.close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.#move(1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.#move(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      this.#commit(this.#activeIndex)
      return
    }
  }

  #move(delta: number): void {
    if (this.#results.length === 0) return
    this.#activeIndex = (this.#activeIndex + delta + this.#results.length) % this.#results.length
    this.#renderResults()
  }

  #commit(index: number): void {
    const r = this.#results[index]
    if (!r) return
    this.close()
    this.#cb.insert(r.schema.type, this.#openedAt)
  }

  #renderResults(): void {
    const list = this.#list
    if (!list) return
    list.replaceChildren()
    const s = this.#style
    this.#results.forEach((r, i) => {
      const row = document.createElement('div')
      row.setAttribute('data-xeno-palette-row', '')
      Object.assign(row.style, {
        display:       'flex',
        flexDirection: 'column',
        gap:           '2px',
        padding:       '6px 9px',
        borderRadius:  '6px',
        cursor:        'pointer',
        background:    i === this.#activeIndex ? s.rowSelectedBackground : 'transparent',
      } satisfies Partial<CSSStyleDeclaration>)

      // Line 1 — title + category badge.
      const line1 = document.createElement('div')
      Object.assign(line1.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
      } satisfies Partial<CSSStyleDeclaration>)
      line1.appendChild(this.#titleNode(r))
      if (r.schema.category) {
        const badge = document.createElement('span')
        badge.textContent = r.schema.category
        Object.assign(badge.style, {
          fontSize: '10px', color: s.mutedColor, textTransform: 'uppercase',
          letterSpacing: '0.04em', flexShrink: '0',
        } satisfies Partial<CSSStyleDeclaration>)
        line1.appendChild(badge)
      }
      row.appendChild(line1)

      // Line 2 — description (ellipsis) + in/out pips.
      const line2 = document.createElement('div')
      Object.assign(line2.style, {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        minHeight: '14px',
      } satisfies Partial<CSSStyleDeclaration>)
      const desc = document.createElement('span')
      desc.textContent = r.schema.description ?? ''
      Object.assign(desc.style, {
        fontSize: '11px', color: s.mutedColor, flex: '1', minWidth: '0',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      } satisfies Partial<CSSStyleDeclaration>)
      line2.appendChild(desc)
      line2.appendChild(this.#pipsNode(r))
      row.appendChild(line2)

      row.addEventListener('pointerenter', () => {
        this.#activeIndex = i
        this.#renderResults()
      })
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        this.#commit(i)
      })
      list.appendChild(row)
    })
  }

  /** Compact pin summary: input type-coloured dots, a thin separator, then output dots. */
  #pipsNode(r: NodeSearchResult): HTMLElement {
    const wrap = document.createElement('span')
    Object.assign(wrap.style, {
      display: 'flex', alignItems: 'center', gap: '3px', flexShrink: '0',
    } satisfies Partial<CSSStyleDeclaration>)
    const color = (type: string): string => this.#cb.pinColor?.(type) ?? this.#style.mutedColor
    const dot = (type: string): HTMLElement => {
      const d = document.createElement('span')
      Object.assign(d.style, {
        width: '7px', height: '7px', borderRadius: '50%', background: color(type),
        display: 'inline-block', flexShrink: '0',
      } satisfies Partial<CSSStyleDeclaration>)
      return d
    }
    const ins  = r.schema.pins.filter((p) => p.direction === 'in')
    const outs = r.schema.pins.filter((p) => p.direction === 'out')
    for (const p of ins) wrap.appendChild(dot(p.type))
    if (ins.length && outs.length) {
      const sep = document.createElement('span')
      sep.textContent = '›'
      Object.assign(sep.style, { color: this.#style.mutedColor, fontSize: '10px', margin: '0 1px' } satisfies Partial<CSSStyleDeclaration>)
      wrap.appendChild(sep)
    }
    for (const p of outs) wrap.appendChild(dot(p.type))
    return wrap
  }

  /** Title with matched query characters wrapped in an accent span. */
  #titleNode(r: NodeSearchResult): HTMLElement {
    const wrap = document.createElement('span')
    const title = r.schema.title
    const hit = new Set(r.indices)
    if (hit.size === 0) {
      wrap.textContent = title
      return wrap
    }
    for (let i = 0; i < title.length; i++) {
      const ch = title[i]!
      if (hit.has(i)) {
        const mark = document.createElement('span')
        mark.textContent = ch
        mark.style.color = this.#style.accent
        mark.style.fontWeight = '700'
        wrap.appendChild(mark)
      } else {
        wrap.appendChild(document.createTextNode(ch))
      }
    }
    return wrap
  }
}
