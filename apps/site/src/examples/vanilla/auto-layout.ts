// Vanilla mount for the Auto-Layout example. No React, no framework — just `XenolithEditor.init`,
// the shared scene builder, and two DOM buttons in the editor's overlay root for arrange / direction.
import { XenolithEditor } from '@xenolith/editor'
import { buildAutoLayout } from '@xenolith/demo/auto-layout'

export async function mount(target: HTMLElement): Promise<() => void> {
  const editor = await XenolithEditor.init(target, { minimap: false })
  const scene = buildAutoLayout(editor)

  type Direction = 'LR' | 'TB'
  let dir: Direction = 'LR'
  let busy = false

  // Tiny in-editor panel — themed by --xeno-* tokens like every other panel.
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
  const run = async (next: Direction = dir): Promise<void> => {
    if (busy) return
    busy = true; runBtn.textContent = 'Arranging…'
    try { await scene.arrange({ direction: next }) } finally { busy = false; runBtn.textContent = 'Auto-arrange' }
  }
  const flip = async (next: Direction): Promise<void> => { dir = next; repaintAll(); await run(next) }
  const runBtn = mkBtn('Auto-arrange', () => true, () => run())
  const lrBtn  = mkBtn('LR',           () => dir === 'LR', () => flip('LR'))
  const tbBtn  = mkBtn('TB',           () => dir === 'TB', () => flip('TB'))
  panel.append(runBtn, lrBtn, tbBtn)
  editor.overlayRoot.appendChild(panel)

  return () => { panel.remove(); editor.destroy() }
}
