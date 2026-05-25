import { XenolithGraphElement } from './element.js'

export { XenolithGraphElement } from './element.js'
export { readAttributes, FORWARDED_EVENTS } from './attrs.js'

/** Register the custom element (default tag `xenolith-graph`). Idempotent — safe to call multiple
 *  times and across modules. */
export function register(tag = 'xenolith-graph'): void {
  if (typeof customElements === 'undefined') return
  if (!customElements.get(tag)) customElements.define(tag, XenolithGraphElement)
}

// Auto-register on import for the common case (`import '@xenolith/wc'` and use the tag).
register()
