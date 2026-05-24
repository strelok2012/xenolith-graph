import { XenolithEditor } from '@xenolith/editor'
import { xenTheme, type XenolithTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'
import { demoGraph, demoSchemas } from '@xenolith/demo'

const editor = await XenolithEditor.init('#app', {
  theme: liquidGlassTheme,
  zoomBounds: [0.1, 2],
})

// Register schemas so the insert palette (Tab / double-click) can spawn any demo node type, then
// load the whole graph from our own xenolith.v1 data format and frame it. No hand-built nodes.
for (const schema of demoSchemas) editor.registry.register(schema)
editor.loadJSON(demoGraph)
editor.fitView({ padding: 56, maxZoom: 1 })

// -----------------------------------------------------------------------------------------------
// Theme switcher — proves runtime setTheme() works. Buttons in the top-left corner of the page.
// -----------------------------------------------------------------------------------------------
const themes: { label: string; theme: XenolithTheme }[] = [
  { label: 'Liquid Glass', theme: liquidGlassTheme },
  { label: 'Xen',          theme: xenTheme },
]
const switcher = document.createElement('div')
switcher.style.cssText = `
  position: fixed; top: 12px; left: 12px; z-index: 1000;
  display: flex; gap: 6px;
  background: rgba(0, 0, 0, 0.35);
  padding: 6px;
  border-radius: 8px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px;
`
let active = themes[0]!
for (const entry of themes) {
  const btn = document.createElement('button')
  btn.textContent = entry.label
  btn.style.cssText = `
    padding: 6px 12px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: ${entry === active ? 'rgba(255, 255, 255, 0.18)' : 'transparent'};
    color: #fff;
    font: inherit;
    cursor: pointer;
  `
  btn.addEventListener('click', () => {
    if (entry === active) return
    active = entry
    editor.setTheme(entry.theme)
    for (const child of switcher.children) {
      const isActive = (child as HTMLElement).textContent === entry.label
      ;(child as HTMLElement).style.background = isActive ? 'rgba(255, 255, 255, 0.18)' : 'transparent'
    }
  })
  switcher.appendChild(btn)
}
document.body.appendChild(switcher)

// Expose the editor for e2e introspection (palette insert assertions, etc).
;(window as unknown as { __xenoEditor: XenolithEditor }).__xenoEditor = editor
