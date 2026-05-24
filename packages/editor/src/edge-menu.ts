import type { PaletteStyle } from '@xenolith/render-pixi'

export interface EdgeMenuItem {
  label: string
  hint?: string
  onSelect: () => void
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
 * Small right-click dropdown anchored at the cursor — used by the edge context menu (Add Reroute /
 * Add Node). DOM-rendered like the insert palette and styled by the active theme's PaletteStyle so
 * it matches (Liquid Glass frosted glass etc.). Closes on outside click, Escape, or selection.
 */
export class EdgeContextMenu {
  readonly #host: HTMLElement
  #style: PaletteStyle
  #root: HTMLDivElement | null = null
  #open = false
  #onDocPointerDown: ((e: Event) => void) | null = null

  constructor(host: HTMLElement, style: PaletteStyle | undefined) {
    this.#host = host
    this.#style = style ?? DEFAULT_STYLE
  }

  get isOpen(): boolean { return this.#open }

  setStyle(style: PaletteStyle | undefined): void {
    this.#style = style ?? DEFAULT_STYLE
  }

  open(screen: { x: number; y: number }, items: EdgeMenuItem[]): void {
    this.close()
    const s = this.#style
    const root = document.createElement('div')
    root.setAttribute('data-xeno-edge-menu', '')
    Object.assign(root.style, {
      position:       'absolute',
      left:           `${screen.x}px`,
      top:            `${screen.y}px`,
      zIndex:         '1100',
      minWidth:       '180px',
      padding:        '5px',
      background:     s.panelBackground,
      border:         `1px solid ${s.panelBorder}`,
      borderRadius:   s.panelRadius ?? '10px',
      boxShadow:      s.panelShadow ?? '0 16px 48px rgba(0,0,0,0.6)',
      backdropFilter: s.backdropFilter ?? 'none',
      WebkitBackdropFilter: s.backdropFilter ?? 'none',
      font:           "13px 'Inter', system-ui, sans-serif",
      color:          s.textColor,
      userSelect:     'none',
    } as Partial<CSSStyleDeclaration>)

    for (const item of items) {
      const row = document.createElement('div')
      Object.assign(row.style, {
        display:       'flex',
        justifyContent:'space-between',
        alignItems:    'center',
        gap:           '16px',
        padding:       '7px 10px',
        borderRadius:  '6px',
        cursor:        'pointer',
        whiteSpace:    'nowrap',
      } as Partial<CSSStyleDeclaration>)
      const label = document.createElement('span')
      label.textContent = item.label
      row.appendChild(label)
      if (item.hint) {
        const hint = document.createElement('span')
        hint.textContent = item.hint
        hint.style.color = s.mutedColor
        hint.style.fontSize = '11px'
        row.appendChild(hint)
      }
      row.addEventListener('pointerenter', () => { row.style.background = s.rowSelectedBackground })
      row.addEventListener('pointerleave', () => { row.style.background = 'transparent' })
      row.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.close()
        item.onSelect()
      })
      root.appendChild(row)
    }

    if (getComputedStyle(this.#host).position === 'static') this.#host.style.position = 'relative'
    this.#host.appendChild(root)
    this.#root = root
    this.#open = true

    // Close on any pointerdown outside the menu (capture phase, deferred so the opening click
    // doesn't immediately close it).
    this.#onDocPointerDown = (e: Event) => {
      if (this.#root && !this.#root.contains(e.target as globalThis.Node)) this.close()
    }
    setTimeout(() => {
      if (this.#onDocPointerDown) document.addEventListener('pointerdown', this.#onDocPointerDown, true)
    }, 0)
  }

  close(): void {
    if (this.#onDocPointerDown) {
      document.removeEventListener('pointerdown', this.#onDocPointerDown, true)
      this.#onDocPointerDown = null
    }
    if (this.#root?.parentElement) this.#root.parentElement.removeChild(this.#root)
    this.#root = null
    this.#open = false
  }

  destroy(): void { this.close() }
}
