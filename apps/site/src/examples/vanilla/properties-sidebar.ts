// Vanilla mount for G4 — properties sidebar. Same auto-open + toggle button as React.
import { XenolithEditor } from '@xenolith/editor'
import { buildPropertiesSidebar } from '@xenolith/demo/properties-sidebar'

export async function mount(target: HTMLElement): Promise<() => void> {
  const editor = await XenolithEditor.init(target, { minimap: false })
  const scene = buildPropertiesSidebar(editor)
  scene.open()

  const panel = document.createElement('div')
  panel.setAttribute('data-xeno-panel', '')
  panel.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;gap:6px;padding:6px;background:var(--xeno-panel,#1d1d1d);border:1px solid var(--xeno-border,#333);border-radius:8px;font:12px Inter,system-ui,sans-serif;z-index:5;'
  const btn = document.createElement('button')
  const paint = (): void => {
    const open = scene.isOpen()
    btn.textContent = open ? 'Close sidebar' : 'Open sidebar'
    btn.style.cssText = `padding:6px 12px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid ${open ? 'var(--xeno-accent,#FCB400)' : 'var(--xeno-border,#333)'};background:${open ? 'var(--xeno-accent,#FCB400)' : 'transparent'};color:${open ? 'var(--xeno-canvas,#111)' : 'var(--xeno-text,#cfcfcf)'};`
  }
  btn.addEventListener('click', () => {
    if (scene.isOpen()) scene.close()
    else scene.open()
    paint()
  })
  paint()
  panel.appendChild(btn)
  editor.overlayRoot.appendChild(panel)

  return () => { panel.remove(); editor.destroy() }
}
