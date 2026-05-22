import { VERSION as CORE_VERSION } from '@xenolith/core'
import { VERSION as RENDER_VERSION } from '@xenolith/render-pixi'
import { VERSION as EDITOR_VERSION } from '@xenolith/editor'

const root = document.getElementById('app')
if (root) {
  root.textContent = `XenolithGraph — core ${CORE_VERSION} · render-pixi ${RENDER_VERSION} · editor ${EDITOR_VERSION}`
}
