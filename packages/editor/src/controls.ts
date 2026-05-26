// Built-in viewport controls — a vanilla DOM widget that mounts into the editor's overlay layer, so
// EVERY framework adapter gets the same toolbar for free (the React/Vue/… wrappers just toggle it).
// React-Flow-style: a single seamless rounded group of icon buttons (shared 1px dividers, no gaps),
// themed entirely through the host's exported `--xeno-*` CSS vars. Includes zoom, fit, reset,
// undo/redo (disabled when their stack is empty), a Save dropdown (JSON / PNG / JPG), and a lock.

export type ControlsPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface ControlsOptions {
  position?: ControlsPosition
  orientation?: 'vertical' | 'horizontal'
  zoomStep?: number
  showZoom?: boolean
  showFit?: boolean
  showReset?: boolean
  showHistory?: boolean
  showSave?: boolean
  showLock?: boolean
}

/** The slice of the editor the controls need — kept as an interface so this module doesn't import
 *  the editor class (avoids a cycle); `XenolithEditor` satisfies it structurally. */
export interface ControlsEditor {
  readonly overlayRoot: HTMLElement
  readonly interactive: boolean
  zoomAt(focal: { x: number; y: number }, factor: number): void
  fitView(opts?: { padding?: number; maxZoom?: number }): void
  resetView(): void
  undo(): boolean
  redo(): boolean
  canUndo(): boolean
  canRedo(): boolean
  setInteractive(v: boolean): void
  exportJSON(): Blob
  exportImage(opts?: { format?: 'png' | 'jpeg'; quality?: number; padding?: number; scale?: number }): Promise<Blob>
  withOverlay<T>(label: string, work: () => T | Promise<T>): Promise<T>
  on(event: 'history:changed', handler: (p: { canUndo: boolean; canRedo: boolean }) => void): () => void
}

const NS = 'http://www.w3.org/2000/svg'
function icon(inner: string): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round')
  svg.innerHTML = inner
  return svg
}
// Feather icons (MIT).
const ICONS = {
  zoomIn:  '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
  zoomOut: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
  fit:     '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  reset:   '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  undo:    '<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
  redo:    '<polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>',
  save:    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  lock:    '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  unlock:  '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
}

const POS: Record<ControlsPosition, Partial<CSSStyleDeclaration>> = {
  'top-left':     { top: '12px', left: '12px' },
  'top-right':    { top: '12px', right: '12px' },
  'bottom-left':  { bottom: '12px', left: '12px' },
  'bottom-right': { bottom: '12px', right: '12px' },
}

export class EditorControls {
  readonly #editor: ControlsEditor
  readonly #root: HTMLDivElement
  #opts: Required<ControlsOptions>
  #undoBtn?: HTMLButtonElement
  #redoBtn?: HTMLButtonElement
  #lockBtn?: HTMLButtonElement
  #menu: HTMLDivElement | null = null
  #offHistory: () => void = () => {}
  #onDocPointer: ((e: PointerEvent) => void) | null = null

  constructor(editor: ControlsEditor, opts: ControlsOptions = {}) {
    this.#editor = editor
    this.#opts = {
      position: opts.position ?? 'bottom-left',
      orientation: opts.orientation ?? 'vertical',
      zoomStep: opts.zoomStep ?? 1.2,
      showZoom: opts.showZoom ?? true,
      showFit: opts.showFit ?? true,
      showReset: opts.showReset ?? true,
      showHistory: opts.showHistory ?? true,
      showSave: opts.showSave ?? true,
      showLock: opts.showLock ?? true,
    }
    this.#root = document.createElement('div')
    this.#root.setAttribute('data-xeno-controls', '')
    this.#editor.overlayRoot.appendChild(this.#root)
    this.#build()
    this.#offHistory = editor.on('history:changed', ({ canUndo, canRedo }) => this.#setHistory(canUndo, canRedo))
  }

  setOptions(opts: ControlsOptions): void {
    this.#opts = { ...this.#opts, ...opts }
    this.#build()
  }

  destroy(): void {
    this.#offHistory()
    this.#closeMenu()
    this.#root.remove()
  }

  #vertical(): boolean { return this.#opts.orientation === 'vertical' }

  #build(): void {
    this.#root.replaceChildren()
    this.#closeMenu()
    const vertical = this.#vertical()
    Object.assign(this.#root.style, {
      position: 'absolute', pointerEvents: 'auto', display: 'flex',
      flexDirection: vertical ? 'column' : 'row', alignItems: 'stretch',
      background: 'var(--xeno-panel)', border: '1px solid var(--xeno-border)', borderRadius: '8px',
      overflow: 'visible', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      top: '', right: '', bottom: '', left: '',
    } as Partial<CSSStyleDeclaration>)
    Object.assign(this.#root.style, POS[this.#opts.position] as Partial<CSSStyleDeclaration>)

    const o = this.#opts
    const groups: HTMLElement[][] = []
    const zoomFit: HTMLElement[] = []
    if (o.showZoom) zoomFit.push(this.#btn('Zoom in', ICONS.zoomIn, () => this.#editor.zoomAt(this.#focal(), o.zoomStep)))
    if (o.showZoom) zoomFit.push(this.#btn('Zoom out', ICONS.zoomOut, () => this.#editor.zoomAt(this.#focal(), 1 / o.zoomStep)))
    if (o.showFit) zoomFit.push(this.#btn('Fit view', ICONS.fit, () => this.#editor.fitView({ padding: 48, maxZoom: 1 })))
    if (o.showReset) zoomFit.push(this.#btn('Reset view', ICONS.reset, () => this.#editor.resetView()))
    if (zoomFit.length) groups.push(zoomFit)

    if (o.showHistory) {
      this.#undoBtn = this.#btn('Undo', ICONS.undo, () => this.#editor.undo())
      this.#redoBtn = this.#btn('Redo', ICONS.redo, () => this.#editor.redo())
      // Initialise from the editor's real history state so the buttons are greyed by default (empty
      // stack) and styled correctly even before the first history:changed event.
      this.#setHistory(this.#editor.canUndo(), this.#editor.canRedo())
      groups.push([this.#undoBtn, this.#redoBtn])
    }
    if (o.showSave) groups.push([this.#saveBtn()])
    if (o.showLock) {
      this.#lockBtn = this.#btn(this.#editor.interactive ? 'Lock' : 'Unlock',
        this.#editor.interactive ? ICONS.unlock : ICONS.lock, () => this.#toggleLock())
      this.#lockBtn.setAttribute('aria-pressed', String(!this.#editor.interactive))
      this.#syncLock()
      groups.push([this.#lockBtn])
    }

    // Lay out groups with a 1px divider between them — buttons sit flush (seamless), no gaps.
    groups.forEach((group, gi) => {
      if (gi > 0) this.#root.appendChild(this.#divider())
      for (const btn of group) this.#root.appendChild(btn)
    })
  }

  #focal(): { x: number; y: number } {
    return { x: this.#editor.overlayRoot.clientWidth / 2, y: this.#editor.overlayRoot.clientHeight / 2 }
  }

  #divider(): HTMLDivElement {
    const d = document.createElement('div')
    Object.assign(d.style, this.#vertical()
      ? { height: '1px', alignSelf: 'stretch', background: 'var(--xeno-border)' }
      : { width: '1px', alignSelf: 'stretch', background: 'var(--xeno-border)' } as Partial<CSSStyleDeclaration>)
    return d
  }

  #btn(label: string, svg: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.setAttribute('aria-label', label)
    b.title = label
    Object.assign(b.style, {
      width: '30px', height: '30px', display: 'grid', placeItems: 'center', padding: '0',
      background: 'transparent', border: 'none', color: 'var(--xeno-text)', cursor: 'pointer',
    } as Partial<CSSStyleDeclaration>)
    b.appendChild(icon(svg))
    b.addEventListener('pointerenter', () => { if (!b.disabled) b.style.background = 'var(--xeno-elevated)' })
    b.addEventListener('pointerleave', () => { if (b.getAttribute('data-active') !== 'true') b.style.background = 'transparent' })
    b.addEventListener('click', () => { if (!b.disabled) onClick() })
    return b
  }

  #setHistory(canUndo: boolean, canRedo: boolean): void {
    if (this.#undoBtn) { this.#undoBtn.disabled = !canUndo; this.#undoBtn.style.opacity = canUndo ? '1' : '0.4' }
    if (this.#redoBtn) { this.#redoBtn.disabled = !canRedo; this.#redoBtn.style.opacity = canRedo ? '1' : '0.4' }
  }

  #toggleLock(): void {
    this.#editor.setInteractive(!this.#editor.interactive)
    this.#syncLock()
  }

  #syncLock(): void {
    const b = this.#lockBtn
    if (!b) return
    const locked = !this.#editor.interactive
    b.replaceChildren(icon(locked ? ICONS.lock : ICONS.unlock))
    b.setAttribute('aria-label', locked ? 'Unlock' : 'Lock')
    b.title = locked ? 'Unlock interaction' : 'Lock interaction'
    b.setAttribute('data-active', String(locked))
    b.style.background = locked ? 'var(--xeno-accent)' : 'transparent'
    b.style.color = locked ? 'var(--xeno-canvas)' : 'var(--xeno-text)'
  }

  // ---- Save dropdown -----------------------------------------------------------------------------
  #saveBtn(): HTMLButtonElement {
    const b = this.#btn('Save', ICONS.save, () => this.#toggleMenu(b))
    return b
  }

  #toggleMenu(anchor: HTMLButtonElement): void {
    if (this.#menu) { this.#closeMenu(); return }
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    Object.assign(menu.style, {
      position: 'absolute', zIndex: '2', minWidth: '150px', padding: '4px',
      // overlayRoot is pointer-events:none — the menu MUST opt back in or clicks fall through to canvas.
      pointerEvents: 'auto',
      background: 'var(--xeno-panel)', border: '1px solid var(--xeno-border)', borderRadius: '8px',
      boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
    } as Partial<CSSStyleDeclaration>)
    const mk = (text: string, run: () => void): HTMLButtonElement => {
      const it = document.createElement('button')
      it.type = 'button'; it.textContent = text
      Object.assign(it.style, {
        display: 'block', width: '100%', textAlign: 'left', whiteSpace: 'nowrap',
        font: 'inherit', fontSize: '13px', padding: '7px 12px', border: 'none', borderRadius: '6px',
        background: 'transparent', color: 'var(--xeno-text)', cursor: 'pointer',
      } as Partial<CSSStyleDeclaration>)
      it.addEventListener('pointerenter', () => { it.style.background = 'var(--xeno-elevated)' })
      it.addEventListener('pointerleave', () => { it.style.background = 'transparent' })
      it.addEventListener('click', () => { this.#closeMenu(); run() })
      return it
    }
    menu.appendChild(mk('Save as JSON', () => this.#download(this.#editor.exportJSON(), 'graph.json')))
    menu.appendChild(mk('Save as PNG', () => void this.#exportImage('png')))
    menu.appendChild(mk('Save as JPG', () => void this.#exportImage('jpeg')))
    // Append to the overlay root (not the controls box) so the menu's containing block matches the
    // host-relative coordinates computed in #placeMenu — otherwise it lands off-screen.
    this.#editor.overlayRoot.appendChild(menu)
    this.#menu = menu
    this.#placeMenu(anchor, menu)
    anchor.setAttribute('data-active', 'true'); anchor.style.background = 'var(--xeno-elevated)'

    // Close on any pointerdown outside the menu or its anchor.
    this.#onDocPointer = (e: PointerEvent): void => {
      const t = e.target as ChildNode | null
      if (t && (menu.contains(t) || anchor.contains(t))) return
      this.#closeMenu()
    }
    document.addEventListener('pointerdown', this.#onDocPointer, true)
  }

  /** Standard dropdown placement, measured against the host so the controls can sit in ANY corner:
   *  drop below the button (flip up if no room), left-aligned (flip to right-aligned if it overflows). */
  #placeMenu(anchor: HTMLButtonElement, menu: HTMLDivElement): void {
    const host = this.#editor.overlayRoot.getBoundingClientRect()
    const a = anchor.getBoundingClientRect()
    const m = menu.getBoundingClientRect()
    const gap = 6
    let left = a.left - host.left
    if (a.left + m.width > host.right) left = a.right - host.left - m.width   // right-align
    let top = a.bottom - host.top + gap
    if (a.bottom + gap + m.height > host.bottom) top = a.top - host.top - gap - m.height  // flip up
    menu.style.left = `${Math.max(4, left)}px`
    menu.style.top = `${Math.max(4, top)}px`
    menu.style.right = ''; menu.style.bottom = ''
  }

  #closeMenu(): void {
    if (this.#onDocPointer) { document.removeEventListener('pointerdown', this.#onDocPointer, true); this.#onDocPointer = null }
    this.#menu?.remove()
    this.#menu = null
    const save = this.#root.querySelector('button[aria-label="Save"]') as HTMLButtonElement | null
    if (save) { save.removeAttribute('data-active'); save.style.background = 'transparent' }
  }

  async #exportImage(format: 'png' | 'jpeg'): Promise<void> {
    const blob = await this.#editor.withOverlay('Exporting image…', () => this.#editor.exportImage({ format }))
    this.#download(blob, `graph.${format === 'jpeg' ? 'jpg' : 'png'}`)
  }

  #download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
