// Vanilla mount for the Nested Auto-Layout (ELK) example. Same toggling behaviour as the React
// demo, built with plain DOM buttons in the editor's overlay root.
import { XenolithEditor } from '@xenolith/editor'
import { buildNestedLayout, type LayoutEngineId } from '@xenolith/demo/nested-layout'

export async function mount(target: HTMLElement): Promise<() => void> {
  const editor = await XenolithEditor.init(target, { minimap: false })
  const scene = buildNestedLayout(editor)
  let busy = false

  const panel = document.createElement('div')
  panel.setAttribute('data-xeno-panel', '')
  panel.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;gap:6px;padding:6px;background:var(--xeno-panel,#1d1d1d);border:1px solid var(--xeno-border,#333);border-radius:8px;font:12px Inter,system-ui,sans-serif;'

  const mkBtn = (label: string, primary: () => boolean, onClick: () => Promise<void>): HTMLButtonElement => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', () => { void onClick() })
    const paint = (): void => {
      const isP = primary()
      b.style.cssText = `padding:6px 12px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid ${isP ? 'var(--xeno-accent,#FCB400)' : 'var(--xeno-border,#333)'};background:${isP ? 'var(--xeno-accent,#FCB400)' : 'transparent'};color:${isP ? 'var(--xeno-canvas,#111)' : 'var(--xeno-text,#cfcfcf)'};`
    }
    paint()
    ;(b as HTMLButtonElement & { _repaint: () => void })._repaint = paint
    return b
  }
  const repaintAll = (): void => { for (const c of panel.children) (c as HTMLButtonElement & { _repaint?: () => void })._repaint?.() }
  const run = async (): Promise<void> => {
    if (busy) return
    busy = true; runBtn.textContent = 'Arranging…'
    try { await scene.arrange() } finally { busy = false; runBtn.textContent = 'Auto-arrange' }
  }
  const flip = async (next: LayoutEngineId): Promise<void> => { scene.setEngine(next); repaintAll(); await run() }
  const runBtn = mkBtn('Auto-arrange', () => true, () => run())
  const elkBtn = mkBtn('ELK',   () => scene.getEngine() === 'elk',   () => flip('elk'))
  const dgBtn  = mkBtn('dagre', () => scene.getEngine() === 'dagre', () => flip('dagre'))
  panel.append(runBtn, elkBtn, dgBtn)
  editor.overlayRoot.appendChild(panel)

  return () => { panel.remove(); editor.destroy() }
}
