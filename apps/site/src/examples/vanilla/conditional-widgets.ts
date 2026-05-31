// Vanilla mount for A1 — conditional widgets. Switch the combos in the toolbar; the node
// re-layouts as `body` / `token` show or hide. The same widgets remain editable inline on the
// node — the toolbar exists only to keep the demo's narrative obvious without the user fishing
// for the right combo.
import { XenolithEditor } from '@xenolith/editor'
import { buildConditionalWidgets } from '@xenolith/demo/conditional-widgets'

export async function mount(target: HTMLElement): Promise<() => void> {
  const editor = await XenolithEditor.init(target, { minimap: false })
  const scene = buildConditionalWidgets(editor)

  const panel = document.createElement('div')
  panel.setAttribute('data-xeno-panel', '')
  panel.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;gap:8px;align-items:center;padding:8px;background:var(--xeno-panel,#1d1d1d);border:1px solid var(--xeno-border,#333);border-radius:8px;font:12px Inter,system-ui,sans-serif;color:var(--xeno-text,#cfcfcf);z-index:5;'
  panel.innerHTML = `
    <span>method</span>
    <select data-method style="background:transparent;color:inherit;border:1px solid var(--xeno-border,#333);border-radius:4px;padding:3px 6px;">
      <option>GET</option><option>POST</option><option>PUT</option>
    </select>
    <span style="margin-left:8px;">auth</span>
    <select data-auth style="background:transparent;color:inherit;border:1px solid var(--xeno-border,#333);border-radius:4px;padding:3px 6px;">
      <option>none</option><option>basic</option><option>bearer</option>
    </select>`
  const methodSel = panel.querySelector<HTMLSelectElement>('[data-method]')!
  const authSel = panel.querySelector<HTMLSelectElement>('[data-auth]')!
  methodSel.addEventListener('change', () => scene.setMethod(methodSel.value as 'GET' | 'POST' | 'PUT'))
  authSel.addEventListener('change', () => scene.setAuth(authSel.value as 'none' | 'basic' | 'bearer'))
  editor.overlayRoot.appendChild(panel)

  return () => { panel.remove(); editor.destroy() }
}
