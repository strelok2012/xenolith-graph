// Vanilla mount for G9 — edge path styles. DOM buttons in the overlay root flip every wire's
// pathStyle via `editor.setEdgeOptions(id, { pathStyle })`.
import { XenolithEditor } from '@xenolith/editor'
import type { EdgePathStyle } from '@xenolith/render-pixi'
import { buildEdgePaths } from '@xenolith/demo/edge-paths'

const STYLES: EdgePathStyle[] = ['bezier', 'smoothstep', 'step', 'linear']

export async function mount(target: HTMLElement): Promise<() => void> {
  const editor = await XenolithEditor.init(target, { minimap: false })
  const scene = buildEdgePaths(editor)
  let active: EdgePathStyle | null = null

  const panel = document.createElement('div')
  panel.setAttribute('data-xeno-panel', '')
  panel.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:6px;padding:8px;min-width:200px;background:var(--xeno-panel,#1d1d1d);border:1px solid var(--xeno-border,#333);border-radius:8px;font:12px Inter,system-ui,sans-serif;'

  const hdr = document.createElement('div')
  hdr.style.cssText = 'font-size:11px;color:var(--xeno-muted,#999);text-transform:uppercase;letter-spacing:0.6px;'
  hdr.textContent = 'Apply to all'
  panel.appendChild(hdr)

  const buttons: { s: EdgePathStyle; el: HTMLButtonElement }[] = []
  const paint = (): void => {
    for (const { s, el } of buttons) {
      const on = s === active
      el.style.cssText = `padding:6px 12px;font-size:12px;border-radius:6px;cursor:pointer;text-align:left;border:1px solid ${on ? 'var(--xeno-accent,#FCB400)' : 'var(--xeno-border,#333)'};background:${on ? 'var(--xeno-accent,#FCB400)' : 'transparent'};color:${on ? 'var(--xeno-canvas,#111)' : 'var(--xeno-text,#cfcfcf)'};`
    }
  }
  for (const s of STYLES) {
    const b = document.createElement('button')
    b.textContent = s
    b.addEventListener('click', () => { active = s; scene.setAll(s); paint() })
    buttons.push({ s, el: b })
    panel.appendChild(b)
  }
  paint()
  editor.overlayRoot.appendChild(panel)
  return () => { panel.remove(); editor.destroy() }
}
