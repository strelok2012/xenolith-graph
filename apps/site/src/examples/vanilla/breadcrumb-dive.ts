// Vanilla mount for G7 — subgraph breadcrumb. DOM buttons in overlay root dive in/out.
import { XenolithEditor } from '@xenolith/editor'
import { buildBreadcrumbDive } from '@xenolith/demo/breadcrumb-dive'

export async function mount(target: HTMLElement): Promise<() => void> {
  const editor = await XenolithEditor.init(target, { minimap: false })
  const scene = buildBreadcrumbDive(editor)

  const panel = document.createElement('div')
  panel.setAttribute('data-xeno-panel', '')
  panel.style.cssText = 'position:absolute;top:12px;right:12px;display:flex;flex-direction:column;gap:6px;padding:8px;background:var(--xeno-panel,#1d1d1d);border:1px solid var(--xeno-border,#333);border-radius:8px;font:12px Inter,system-ui,sans-serif;'

  const mkBtn = (text: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.textContent = text
    b.style.cssText = 'padding:6px 12px;font-size:12px;border-radius:6px;cursor:pointer;text-align:left;border:1px solid var(--xeno-border,#333);background:transparent;color:var(--xeno-text,#cfcfcf);'
    b.addEventListener('click', onClick)
    return b
  }
  panel.appendChild(mkBtn('Dive into Pipeline', () => scene.diveInto('pipeline')))
  panel.appendChild(mkBtn('… then into Stage',  () => scene.diveInto('stage')))
  panel.appendChild(mkBtn('Pop to Root',        () => scene.diveOut()))
  const hint = document.createElement('div')
  hint.textContent = 'Or double-click any $templateInstance node.'
  hint.style.cssText = 'font-size:11px;color:var(--xeno-muted,#9a9a9a);'
  panel.appendChild(hint)
  editor.overlayRoot.appendChild(panel)

  return () => { panel.remove(); editor.destroy() }
}
