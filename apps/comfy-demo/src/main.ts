import { XenolithEditor } from '@xenolith/editor'
import { xenTheme, type XenolithTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'
import { importComfyWorkflow } from '@xenolith/demo/comfy'
import { generateXxlWorkflow } from './fixtures/xxl.js'

// Wider zoom range than the default [0.25, 2] so the 1391-node monster can be zoomed out far
// enough to behold in full.
const editor = await XenolithEditor.init('#app', { theme: xenTheme, zoomBounds: [0.04, 2] })

// ---- core load path --------------------------------------------------------------------------
// The editor owns a themeable busy overlay (blur + spinner) via `withOverlay`: it paints first,
// runs the heavy import + first render behind the blur, then fades out — so big graphs reveal
// smoothly instead of freezing then popping in. `editor.fitView()` frames the whole graph from the
// real node bounds (no footprint guessing) so even the 1391-node monster lands fully in view.
function importAndLoad(workflow: unknown): void {
  const { graph, schemas } = importComfyWorkflow(workflow)
  editor.registry.clear()
  for (const s of schemas) editor.registry.register(s)
  editor.loadJSON(graph)
  editor.fitView({ padding: 80, maxZoom: 1 })
}

async function loadWorkflow(workflow: unknown, label: string): Promise<void> {
  await editor.withOverlay(`Rendering ${label}…`, () => importAndLoad(workflow))
}

async function loadFromUrl(url: string, label: string): Promise<void> {
  await editor.withOverlay(`Loading ${label}…`, async () => {
    const res = await fetch(url)
    importAndLoad(await res.json())
  })
}

// ---- toolbar (workflow + theme switchers) ----------------------------------------------------
const WORKFLOWS: { label: string; load: () => Promise<void> }[] = [
  { label: 'Medium · 110',      load: () => loadFromUrl('/workflows/searge-medium.json', 'Medium') },
  { label: 'XXL · 298',         load: () => loadFromUrl('/workflows/searge-xxl.json', 'XXL') },
  { label: 'The Machine · 1391', load: () => loadFromUrl('/workflows/the-machine.json', 'The Machine') },
  { label: 'Synthetic · 1400',  load: () => loadWorkflow(generateXxlWorkflow(200), 'Synthetic stress') },
]
const THEMES: { label: string; theme: XenolithTheme }[] = [
  { label: 'Xen',          theme: xenTheme },
  { label: 'Liquid Glass', theme: liquidGlassTheme },
]

function buttonGroup(
  items: { label: string }[],
  initialIndex: number,
  onPick: (i: number) => void,
): HTMLDivElement {
  const group = document.createElement('div')
  group.style.cssText = `
    display: flex; gap: 4px; background: rgba(0,0,0,0.4); padding: 5px;
    border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    font: 12px 'Inter', system-ui, sans-serif;
  `
  let active = initialIndex
  const paint = (): void => {
    ;[...group.children].forEach((c, i) => {
      ;(c as HTMLElement).style.background = i === active ? 'rgba(255,255,255,0.18)' : 'transparent'
    })
  }
  items.forEach((it, i) => {
    const b = document.createElement('button')
    b.textContent = it.label
    b.style.cssText = `
      padding: 6px 11px; border-radius: 5px; border: 1px solid rgba(255,255,255,0.06);
      background: transparent; color: #fff; font: inherit; cursor: pointer; white-space: nowrap;
    `
    b.addEventListener('click', () => { active = i; paint(); onPick(i) })
    group.appendChild(b)
  })
  paint()
  return group
}

const bar = document.createElement('div')
bar.style.cssText = `
  position: fixed; top: 12px; left: 12px; z-index: 1000;
  display: flex; gap: 10px; align-items: center;
`
bar.appendChild(buttonGroup(WORKFLOWS, 0, (i) => void WORKFLOWS[i]!.load()))
bar.appendChild(buttonGroup(THEMES, 0, (i) => editor.setTheme(THEMES[i]!.theme)))
document.body.appendChild(bar)

const hint = document.createElement('div')
hint.style.cssText = `
  position: fixed; bottom: 12px; left: 12px; z-index: 1000;
  font: 11px 'Inter', system-ui, sans-serif; color: rgba(255,255,255,0.45);
`
hint.textContent = 'Drop a ComfyUI workflow .json · Tab to insert · ` for stats'
document.body.appendChild(hint)

// ---- file drop -------------------------------------------------------------------------------
window.addEventListener('dragover', (e) => { e.preventDefault() })
window.addEventListener('drop', (e) => {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  void file.text().then((txt) => loadWorkflow(JSON.parse(txt), file.name))
})

// ---- boot ------------------------------------------------------------------------------------
await loadFromUrl('/workflows/searge-medium.json', 'Medium')

;(window as unknown as { __xenoEditor: XenolithEditor }).__xenoEditor = editor
