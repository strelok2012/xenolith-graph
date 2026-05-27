import { XenolithEditor } from '@xenolith/editor'
import { xenTheme, type XenolithTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'
import { demoGraph, demoSchemas, createCurveWidget, createXYPadWidget } from '@xenolith/demo'

const editor = await XenolithEditor.init('#app', {
  theme: xenTheme,
  zoomBounds: [0.1, 2],
  minimap: true,
})

// Register schemas so the insert palette (Tab / double-click) can spawn any demo node type, then
// load the whole graph from our own xenolith.v1 data format and frame it. No hand-built nodes.
editor.registerWidget('curve', createCurveWidget())
editor.registerWidget('xypad', createXYPadWidget())
for (const schema of demoSchemas) editor.registry.register(schema)
editor.loadJSON(demoGraph)
editor.fitView({ padding: 56, maxZoom: 1 })

// Standard in-editor controls panel (zoom / fit / reset / undo-redo / save / lock), top-right corner.
editor.setControls({ position: 'top-right', orientation: 'horizontal' })

// -----------------------------------------------------------------------------------------------
// Theme switcher — proves runtime setTheme() works. Buttons in the top-left corner of the page.
// -----------------------------------------------------------------------------------------------
const themes: { label: string; theme: XenolithTheme }[] = [
  { label: 'Xen',          theme: xenTheme },
  { label: 'Liquid Glass', theme: liquidGlassTheme },
]
// Lives in the editor's overlay root and styles itself purely from the theme's `--xeno-*` design
// tokens (the editor re-writes them on setTheme), so the panel restyles with the active theme — no
// ad-hoc CSS, same mechanism the in-editor chrome uses.
const switcher = document.createElement('div')
switcher.setAttribute('data-xeno-panel', '')
switcher.style.cssText = `
  position: absolute; top: 60px; right: 12px; pointer-events: auto;
  display: flex; gap: 4px;
  background: var(--xeno-panel); padding: 4px; border-radius: var(--xeno-radius);
  border: 1px solid var(--xeno-border);
  font-family: 'Inter', system-ui, sans-serif; font-size: 12px;
`
let active = themes[0]!
const paint = (): void => {
  for (const child of switcher.children) {
    const on = (child as HTMLElement).textContent === active.label
    const el = child as HTMLElement
    el.style.background = on ? 'var(--xeno-accent)' : 'transparent'
    el.style.color = on ? 'var(--xeno-canvas)' : 'var(--xeno-text)'
  }
}
for (const entry of themes) {
  const btn = document.createElement('button')
  btn.textContent = entry.label
  btn.style.cssText = `
    padding: 6px 12px; border-radius: calc(var(--xeno-radius) - 2px);
    border: none; background: transparent; color: var(--xeno-text);
    font: inherit; cursor: pointer;
  `
  btn.addEventListener('click', () => {
    if (entry === active) return
    active = entry
    editor.setTheme(entry.theme)
    paint()
  })
  switcher.appendChild(btn)
}
editor.overlayRoot.appendChild(switcher)
paint()

// Comments are inserted through the standard Tab/double-click palette (search "Comment"), not a
// bespoke button — they're a first-class insert type like any node.

// Expose the editor for e2e introspection (palette insert assertions, etc).
;(window as unknown as { __xenoEditor: XenolithEditor }).__xenoEditor = editor
