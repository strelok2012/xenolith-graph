// G4 — Properties sidebar. Per Baklava's `displayInSidebar` insight: there's no separate
// "sidebar component" to author. The SAME WidgetSpec that renders inline on the node also
// renders in the side panel — just flagged with `showInSidebar: true`. This keeps the contract
// declarative and means a widget never silently goes out of sync between its two presentations.
//
// Built-in widgets render as native HTML controls (input range / number / text / checkbox / etc)
// styled via `--xeno-*` CSS vars. Custom widgets are skipped in v1 — they're WebGL/canvas
// machinery designed for the in-node canvas; reusing them in a DOM panel needs separate plumbing.
// Hosts that need a custom-widget sidebar render right now can author a normal DOM widget.

import type { Node, NodeId, WidgetSpec } from '@xenolith/core'
import { widgetValue, widgetIsVisible } from '@xenolith/core'

export interface SidebarManagerOpts {
  /** Editor's DOM overlay root — the panel mounts here as a child. */
  overlayRoot: HTMLElement
  /** Resolve a node by id (live — the manager reads `state` on every refresh). */
  getNode: (id: NodeId) => Node | undefined
  /** Title to show in the panel header. `loadJSON` strips `node.render` into a separate
   *  renderOpts map on the editor, so the manager can't read it off Node directly. */
  getNodeTitle?: (id: NodeId) => string | undefined
  /** Commit a new value for a widget. Mirrors the editor's `setWidgetValue` (undoable). */
  setWidgetValue: (nodeId: NodeId, widgetId: string, value: unknown) => void
  onOpen?: (nodeId: NodeId) => void
  onClose?: () => void
}

interface RowBinding {
  spec: WidgetSpec
  /** Apply a new value to the existing control WITHOUT recreating DOM. Skips writes when the
   *  control is focused — typing must never be clobbered by the live-refresh loop. */
  setValue: (v: unknown) => void
}

export class SidebarManager {
  readonly #opts: SidebarManagerOpts
  #panel: HTMLDivElement | null = null
  #body: HTMLDivElement | null = null
  #header: HTMLDivElement | null = null
  #currentId: NodeId | null = null
  /** Per-widget bindings for the currently displayed node — live as long as the widget set on
   *  the node hasn't changed. `refresh()` reuses them; only a structural change (widgets added/
   *  removed or the open node swapped) tears them down. */
  #rows = new Map<string, RowBinding>()
  #renderedWidgetIds: string[] = []

  constructor(opts: SidebarManagerOpts) {
    this.#opts = opts
  }

  isOpen(): boolean { return this.#currentId !== null }
  currentNodeId(): NodeId | null { return this.#currentId }

  open(nodeId: NodeId): void {
    const node = this.#opts.getNode(nodeId)
    if (!node) return                                        // unknown id — silent no-op
    // Swapping nodes invalidates any cached bindings — even if the new node happens to have the
    // same widget ids, the closures captured `node.id` for commit. Force a structural rebuild.
    if (this.#currentId !== null && this.#currentId !== nodeId) {
      this.#rows.clear()
      this.#renderedWidgetIds = []
    }
    this.#currentId = nodeId
    this.#ensurePanel()
    this.#renderInto(node)
    this.#opts.onOpen?.(nodeId)
  }

  close(): void {
    if (this.#currentId === null) return
    this.#currentId = null
    if (this.#panel) this.#panel.style.display = 'none'
    this.#opts.onClose?.()
  }

  /** Re-render the panel with the current node's latest state. Cheap; the host calls this on
   *  `widget:changed` / `node:added` / dive transitions to keep the panel in sync. */
  refresh(): void {
    if (this.#currentId === null) return
    const node = this.#opts.getNode(this.#currentId)
    if (!node) { this.close(); return }
    this.#renderInto(node)
  }

  dispose(): void {
    if (this.#panel?.parentElement) this.#panel.parentElement.removeChild(this.#panel)
    this.#panel = null
    this.#body = null
    this.#header = null
    this.#currentId = null
    this.#rows.clear()
    this.#renderedWidgetIds = []
  }

  // ────────────────────────────────────────────────────────────────────────────────────────────

  #ensurePanel(): void {
    if (this.#panel) {
      this.#panel.style.display = ''
      return
    }
    const p = document.createElement('div')
    p.setAttribute('data-xeno-sidebar', '')
    p.setAttribute('data-xeno-panel', '')                    // picks up the panel theme vars
    p.style.cssText = [
      'position:absolute', 'top:0', 'right:0', 'bottom:0',
      'width:320px',
      'background:var(--xeno-panel, #1d1d1d)',
      'border-left:1px solid var(--xeno-border, #2a2a2a)',
      'color:var(--xeno-text, #cfcfcf)',
      'font:13px/1.4 Inter, system-ui, sans-serif',
      'display:flex', 'flex-direction:column',
      'box-shadow:-4px 0 12px rgba(0,0,0,0.25)',
      'pointer-events:auto',
      'z-index:10',
    ].join(';')

    const header = document.createElement('div')
    header.style.cssText = [
      'display:flex', 'align-items:center', 'justify-content:space-between',
      'padding:12px 14px',
      'border-bottom:1px solid var(--xeno-border, #2a2a2a)',
      'background:var(--xeno-panel-strong, var(--xeno-panel, #1d1d1d))',
    ].join(';')
    const title = document.createElement('div')
    title.setAttribute('data-xeno-sidebar-title', '')
    title.style.cssText = 'font-weight:600;font-size:14px;'
    const closeBtn = document.createElement('button')
    closeBtn.setAttribute('data-xeno-sidebar-close', '')
    closeBtn.setAttribute('aria-label', 'Close sidebar')
    closeBtn.textContent = '×'
    closeBtn.style.cssText = [
      'background:transparent', 'border:none',
      'color:var(--xeno-muted, #9a9a9a)',
      'font:600 20px/1 system-ui',
      'cursor:pointer', 'padding:0 6px',
    ].join(';')
    closeBtn.addEventListener('click', () => { this.close() })
    header.append(title, closeBtn)

    const body = document.createElement('div')
    body.setAttribute('data-xeno-sidebar-body', '')
    body.style.cssText = [
      'flex:1', 'overflow-y:auto',
      'padding:14px',
      'display:flex', 'flex-direction:column', 'gap:14px',
    ].join(';')

    p.append(header, body)
    this.#opts.overlayRoot.appendChild(p)
    this.#panel = p
    this.#header = header
    this.#body = body
  }

  #renderInto(node: Node): void {
    if (!this.#panel || !this.#body || !this.#header) return
    const titleEl = this.#header.querySelector<HTMLElement>('[data-xeno-sidebar-title]')
    if (titleEl) {
      const title = this.#opts.getNodeTitle?.(node.id)
        ?? (node as { render?: { title?: string } }).render?.title
        ?? String(node.id)
      titleEl.textContent = title
    }
    const sidebarWidgets = (node.widgets ?? []).filter((w) => w.showInSidebar && widgetIsVisible(w, node))
    const ids = sidebarWidgets.map((w) => w.id)
    // FAST PATH: same widget set as last render → reuse the DOM, just push the latest values into
    // each control. This is critical for inputs that fire on every keystroke (text/textarea) —
    // wiping innerHTML on every value change would yank focus away mid-type. The setValue helpers
    // skip themselves when the control is focused so the live edit isn't clobbered either.
    if (sameIds(ids, this.#renderedWidgetIds) && this.#rows.size === ids.length) {
      for (const w of sidebarWidgets) {
        const binding = this.#rows.get(w.id)
        if (binding) binding.setValue(widgetValue(node, w))
      }
      return
    }
    // STRUCTURAL CHANGE: wipe + rebuild from scratch.
    this.#body.innerHTML = ''
    this.#rows.clear()
    for (const w of sidebarWidgets) {
      const row = this.#renderWidgetRow(node, w)
      if (row) this.#body.appendChild(row)
    }
    this.#renderedWidgetIds = ids
  }

  #renderWidgetRow(node: Node, w: WidgetSpec): HTMLElement | null {
    const row = document.createElement('div')
    row.setAttribute('data-xeno-sidebar-widget', w.id)
    row.style.cssText = 'display:flex;flex-direction:column;gap:6px;'

    // Label: explicit widget.label first; if empty (the canon for pin-bound widgets — they leave
    // labelling to the pin row inline), fall back to the binding key so the sidebar isn't a stack
    // of unlabelled controls.
    const labelText = w.label || w.key
    if (labelText) {
      const label = document.createElement('label')
      label.textContent = labelText
      label.style.cssText = 'font-size:12px;color:var(--xeno-muted, #9a9a9a);text-transform:uppercase;letter-spacing:0.4px;'
      row.appendChild(label)
    }

    const value = widgetValue(node, w)
    const commit = (v: unknown): void => { this.#opts.setWidgetValue(node.id, w.id, v) }
    const built = this.#renderControl(w, value, commit)
    if (!built) return null                                  // skip custom / button-on-pin / unknown
    row.appendChild(built.el)
    if (w.hint) {
      const hint = document.createElement('div')
      hint.textContent = w.hint
      hint.style.cssText = 'font-size:11px;color:var(--xeno-muted, #9a9a9a);'
      row.appendChild(hint)
    }
    this.#rows.set(w.id, { spec: w, setValue: built.setValue })
    return row
  }

  #renderControl(w: WidgetSpec, value: unknown, commit: (v: unknown) => void): { el: HTMLElement; setValue: (v: unknown) => void } | null {
    const fieldStyle = [
      'background:var(--xeno-canvas, #161616)',
      'color:var(--xeno-text, #cfcfcf)',
      'border:1px solid var(--xeno-border, #2a2a2a)',
      'border-radius:6px',
      'padding:7px 9px',
      'font:13px Inter, system-ui, sans-serif',
      'width:100%', 'box-sizing:border-box',
      'outline:none',
    ].join(';')

    // Every setValue helper below GUARDS focus: if the user is currently editing this control,
    // we DO NOT overwrite their value with the upstream state — otherwise typing a character
    // would round-trip → state.x = 'a' → refresh → input.value = 'a' (focus may be intact for
    // simple inputs, BUT the caret jumps to the end). The focused-skip keeps the caret put and
    // lets the user finish typing without the live-sync stomping them.
    switch (w.type) {
      case 'slider': {
        const wrap = document.createElement('div')
        wrap.style.cssText = 'display:flex;gap:8px;align-items:center;'
        const range = document.createElement('input')
        range.type = 'range'
        range.min = String(w.min); range.max = String(w.max); range.step = String(w.step ?? 0.01)
        range.value = String(value ?? w.min)
        range.style.cssText = 'flex:1;'
        const read = document.createElement('div')
        read.textContent = String(range.value)
        read.style.cssText = 'min-width:48px;text-align:right;font-variant-numeric:tabular-nums;color:var(--xeno-muted, #9a9a9a);font-size:12px;'
        range.addEventListener('input', () => {
          const v = parseFloat(range.value)
          read.textContent = String(v)
          commit(v)
        })
        wrap.append(range, read)
        return { el: wrap, setValue: (v) => {
          if (document.activeElement === range) return
          range.value = String(v ?? w.min); read.textContent = range.value
        } }
      }
      case 'number': {
        const input = document.createElement('input')
        input.type = 'number'
        if (w.min !== undefined) input.min = String(w.min)
        if (w.max !== undefined) input.max = String(w.max)
        if (w.step !== undefined) input.step = String(w.step)
        input.value = String(value ?? 0)
        input.style.cssText = fieldStyle
        input.addEventListener('input', () => commit(parseFloat(input.value)))
        return { el: input, setValue: (v) => { if (document.activeElement !== input) input.value = String(v ?? 0) } }
      }
      case 'text': {
        const input = w.multiline ? document.createElement('textarea') : document.createElement('input')
        if (input instanceof HTMLInputElement) input.type = 'text'
        input.value = String(value ?? '')
        if (w.placeholder) input.placeholder = w.placeholder
        input.style.cssText = fieldStyle + (w.multiline ? ';resize:vertical;min-height:60px;' : '')
        input.addEventListener('input', () => commit(input.value))
        return { el: input, setValue: (v) => { if (document.activeElement !== input) input.value = String(v ?? '') } }
      }
      case 'combo': {
        const select = document.createElement('select')
        select.style.cssText = fieldStyle
        for (const v of w.values) {
          const opt = document.createElement('option')
          const optValue = typeof v === 'string' ? v : v.value
          const optLabel = typeof v === 'string' ? v : v.label
          opt.value = String(optValue)
          opt.textContent = String(optLabel)
          if (String(optValue) === String(value)) opt.selected = true
          select.appendChild(opt)
        }
        select.addEventListener('change', () => commit(select.value))
        return { el: select, setValue: (v) => { if (document.activeElement !== select) select.value = String(v ?? '') } }
      }
      case 'toggle': {
        const wrap = document.createElement('label')
        wrap.style.cssText = 'display:flex;gap:8px;align-items:center;cursor:pointer;'
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.checked = !!value
        const txt = document.createElement('span')
        txt.textContent = input.checked ? 'On' : 'Off'
        input.addEventListener('change', () => { txt.textContent = input.checked ? 'On' : 'Off'; commit(input.checked) })
        wrap.append(input, txt)
        return { el: wrap, setValue: (v) => { input.checked = !!v; txt.textContent = input.checked ? 'On' : 'Off' } }
      }
      case 'color': {
        const input = document.createElement('input')
        input.type = 'color'
        input.value = String(value ?? '#000000')
        input.style.cssText = 'width:60px;height:32px;background:transparent;border:1px solid var(--xeno-border, #2a2a2a);border-radius:6px;padding:2px;cursor:pointer;'
        input.addEventListener('input', () => commit(input.value))
        return { el: input, setValue: (v) => { if (document.activeElement !== input) input.value = String(v ?? '#000000') } }
      }
      case 'button': {
        const btn = document.createElement('button')
        btn.textContent = w.label || 'Run'
        btn.style.cssText = fieldStyle + ';cursor:pointer;background:var(--xeno-accent, #FCB400);color:var(--xeno-canvas, #111);font-weight:600;border-color:transparent;'
        btn.addEventListener('click', () => commit(undefined))
        return { el: btn, setValue: () => {} }                // buttons have no value
      }
      case 'custom':
        // Custom widgets are PIXI/canvas/DOM controllers built for in-node rendering — out of
        // scope for v1 sidebar (they need their own mount path). Documented limitation.
        return null
    }
  }
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
