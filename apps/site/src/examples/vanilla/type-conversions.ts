// Vanilla mount for Type Conversions (G2). DOM toggle + log readout in the editor overlay root.
import { XenolithEditor } from '@xenolith/editor'
import { buildTypeConversions } from '@xenolith/demo/type-conversions'

export async function mount(target: HTMLElement): Promise<() => void> {
  const editor = await XenolithEditor.init(target, { minimap: false })
  const scene = buildTypeConversions(editor)

  const panel = document.createElement('div')
  panel.setAttribute('data-xeno-panel', '')
  panel.style.cssText = 'position:absolute;top:12px;left:12px;display:flex;flex-direction:column;gap:6px;padding:8px;min-width:280px;background:var(--xeno-panel,#1d1d1d);border:1px solid var(--xeno-border,#333);border-radius:8px;font:12px Inter,system-ui,sans-serif;'

  const btn = document.createElement('button')
  const paintBtn = (): void => {
    const on = scene.conversionEnabled()
    btn.textContent = on ? '✓ Conversion enabled' : 'Enable number → text cast'
    btn.style.cssText = `padding:8px 12px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid ${on ? 'var(--xeno-accent,#FCB400)' : 'var(--xeno-border,#333)'};background:${on ? 'var(--xeno-accent,#FCB400)' : 'transparent'};color:${on ? 'var(--xeno-canvas,#111)' : 'var(--xeno-text,#cfcfcf)'};`
  }
  btn.addEventListener('click', () => { scene.toggleConversion(); paintBtn() })
  paintBtn()

  const logEl = document.createElement('div')
  logEl.style.cssText = 'font:11px/1.4 Menlo,monospace;max-height:120px;overflow:auto;padding:6px;background:rgba(0,0,0,0.3);border-radius:4px;'
  const paintLog = (): void => {
    logEl.innerHTML = ''
    for (const line of scene.log().slice(-6)) {
      const row = document.createElement('div')
      row.textContent = line
      row.style.color = line.includes('✗') ? '#f88' : line.includes('✓') ? '#9f9' : '#cfcfcf'
      logEl.appendChild(row)
    }
  }
  paintLog()
  const unsub = scene.onLogChange(paintLog)

  panel.append(btn, logEl)
  editor.overlayRoot.appendChild(panel)

  return () => { unsub(); panel.remove(); editor.destroy() }
}
