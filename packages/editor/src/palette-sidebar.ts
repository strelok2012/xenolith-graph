// G6 — persistent palette sidebar. A docked left panel listing every registered NodeSchema
// grouped by category. Items are HTML5-draggable with the schema type as `text/plain` payload
// — the editor's existing canvas `drop` handler picks it up and inserts the node at the drop
// point through the `node:drop` event. Hosts that don't want this can `setPaletteSidebar(false)`
// (default) and rely on the Tab palette instead.

import type { NodeRegistry, NodeSchema } from '@xenolith/core'

export interface PaletteSidebarOpts {
  /** Where to anchor the panel inside the overlay root. Default 'left'. */
  side?: 'left' | 'right'
  /** Filter what shows in the palette — e.g. hide internal types like `$templateInstance`. */
  filter?: (schema: NodeSchema) => boolean
}

export class PaletteSidebar {
  readonly #registry: NodeRegistry
  readonly #overlayRoot: HTMLElement
  readonly #opts: PaletteSidebarOpts
  #panel: HTMLDivElement | null = null

  constructor(registry: NodeRegistry, overlayRoot: HTMLElement, opts: PaletteSidebarOpts = {}) {
    this.#registry = registry
    this.#overlayRoot = overlayRoot
    this.#opts = opts
  }

  mount(): void {
    if (this.#panel) return
    const side = this.#opts.side ?? 'left'
    const panel = document.createElement('div')
    panel.setAttribute('data-xeno-palette-sidebar', '')
    panel.setAttribute('data-xeno-panel', '')
    panel.style.cssText = [
      'position:absolute', 'top:0', 'bottom:0', side === 'left' ? 'left:0' : 'right:0',
      'width:240px',
      'background:var(--xeno-panel, #1d1d1d)',
      `border-${side === 'left' ? 'right' : 'left'}:1px solid var(--xeno-border, #2a2a2a)`,
      'color:var(--xeno-text, #cfcfcf)',
      'font:13px/1.4 Inter, system-ui, sans-serif',
      'display:flex', 'flex-direction:column',
      'pointer-events:auto', 'z-index:8',
    ].join(';')

    const header = document.createElement('div')
    header.style.cssText = 'padding:12px 14px;font-weight:600;font-size:13px;border-bottom:1px solid var(--xeno-border, #2a2a2a);'
    header.textContent = 'Nodes'
    panel.appendChild(header)

    const body = document.createElement('div')
    body.style.cssText = 'flex:1;overflow-y:auto;padding:8px;'
    panel.appendChild(body)

    // Group schemas by category (default 'Other'); within each group sort by title.
    const filtered = this.#registry.all().filter((s) => this.#opts.filter?.(s) ?? true)
    const groups = new Map<string, NodeSchema[]>()
    for (const s of filtered) {
      const cat = s.category ?? 'Other'
      const arr = groups.get(cat) ?? (groups.set(cat, []), groups.get(cat)!)
      arr.push(s)
    }
    for (const arr of groups.values()) arr.sort((a, b) => a.title.localeCompare(b.title))

    for (const [cat, schemas] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const groupLabel = document.createElement('div')
      groupLabel.style.cssText = 'font-size:10px;text-transform:uppercase;letter-spacing:0.6px;color:var(--xeno-muted, #9a9a9a);padding:8px 6px 4px;'
      groupLabel.textContent = cat
      body.appendChild(groupLabel)

      for (const s of schemas) {
        const item = document.createElement('div')
        item.setAttribute('data-xeno-palette-item', s.type)
        item.draggable = true
        item.style.cssText = [
          'padding:7px 9px', 'border-radius:6px',
          'background:transparent', 'cursor:grab',
          'display:flex', 'flex-direction:column', 'gap:2px',
          'user-select:none',
        ].join(';')
        item.addEventListener('mouseenter', () => { item.style.background = 'var(--xeno-panel-strong, rgba(255,255,255,0.05))' })
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent' })
        item.addEventListener('dragstart', (e) => {
          if (!e.dataTransfer) return
          // The canvas's `drop` handler picks this up and emits `node:drop` with `text` set; a
          // simple host listener does `editor.insertNode(text, position)`. Decoupled by design —
          // we don't directly call insertNode here so the host stays in control of placement,
          // snapping, validation, etc.
          e.dataTransfer.setData('text/plain', s.type)
          e.dataTransfer.effectAllowed = 'copy'
        })
        const title = document.createElement('div')
        title.textContent = s.title
        title.style.cssText = 'font-size:13px;font-weight:500;'
        item.appendChild(title)
        if (s.description) {
          const desc = document.createElement('div')
          desc.textContent = s.description
          desc.style.cssText = 'font-size:11px;color:var(--xeno-muted, #9a9a9a);'
          item.appendChild(desc)
        }
        body.appendChild(item)
      }
    }

    this.#overlayRoot.appendChild(panel)
    this.#panel = panel
  }

  unmount(): void {
    if (this.#panel?.parentElement) this.#panel.parentElement.removeChild(this.#panel)
    this.#panel = null
  }

  /** Re-render contents — call after the host adds new schemas. Cheap (DOM rebuild ~12 items). */
  refresh(): void {
    if (!this.#panel) return
    this.unmount()
    this.mount()
  }
}
