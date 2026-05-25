import { XenolithEditor } from '@xenolith/editor'
import { xenTheme, type XenolithTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'
import { demoGraph, demoSchemas, createCurveWidget, createXYPadWidget } from '@xenolith/demo'

const THEMES: Record<string, XenolithTheme> = {
  xen: xenTheme,
  'liquid-glass': liquidGlassTheme,
}

async function buildShowcase(mountEl: HTMLElement, theme: XenolithTheme) {
  // Don't use PIXI's `resizeTo` — at init time the mount can be 0px tall (aspect-ratio CSS
  // applies AFTER first layout pass), and PIXI then sticks with that 0px height. We size
  // manually via ResizeObserver below.
  const editor = await XenolithEditor.init(mountEl, {
    theme,
    resizeToWindow: false,
    zoomBounds: [0.1, 2],
  })

  // The landing showcases display the canonical demo graph (same data the playground loads), so
  // there's a single source of truth for what Xenolith looks like out of the box.
  editor.registerWidget('curve', createCurveWidget())
  editor.registerWidget('xypad', createXYPadWidget())
  for (const schema of demoSchemas) editor.registry.register(schema)
  editor.loadJSON(demoGraph)

  const fitToMount = (): void => {
    const w = mountEl.clientWidth
    const h = mountEl.clientHeight
    if (w > 0 && h > 0) {
      editor.app.renderer.resize(w, h)
      // Re-frame the whole graph for the new canvas size so it's always fully visible.
      editor.fitView({ padding: 36, maxZoom: 1 })
    }
  }
  // First fit: the editor is mounted; aspect-ratio:16/10 has applied; sizes are real now.
  fitToMount()
  // Track future container size changes (responsive layout, font-load reflow, etc.)
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => fitToMount())
    ro.observe(mountEl)
  }

  return editor
}

export function mountAllShowcases(): void {
  const mounts = document.querySelectorAll<HTMLElement>('[data-xeno-showcase]')
  for (const el of Array.from(mounts)) {
    if (el.dataset['xenoMounted']) continue
    el.dataset['xenoMounted'] = '1'
    const themeName = el.dataset['xenoTheme'] ?? 'xen'
    const theme = THEMES[themeName] ?? xenTheme
    void buildShowcase(el, theme).catch((err) => {
      console.error('[xeno-showcase] init failed', err)
    })
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAllShowcases)
  } else {
    mountAllShowcases()
  }
}
