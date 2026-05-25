import type { XenolithProps } from '@xenolith/adapter-core'

/** A boolean HTML attribute is true when present unless its value is the string "false". */
function boolAttr(el: HTMLElement, name: string): boolean | undefined {
  if (!el.hasAttribute(name)) return undefined
  return el.getAttribute(name) !== 'false'
}

/** Parse the declarative (string) attributes of <xenolith-graph> into props. Complex props
 *  (theme object, graph data) arrive via JS properties, not attributes. */
export function readAttributes(el: HTMLElement): Partial<XenolithProps> {
  const props: Partial<XenolithProps> = {}
  const minimap = boolAttr(el, 'minimap')
  if (minimap !== undefined) props.minimap = minimap
  const fit = boolAttr(el, 'fit-on-load')
  if (fit !== undefined) props.fitOnLoad = fit
  const grid = boolAttr(el, 'disable-grid')
  if (grid !== undefined) props.disableGrid = grid
  return props
}

/** Every public editor event is re-dispatched off the element as a same-named CustomEvent whose
 *  `detail` is the event payload. */
export const FORWARDED_EVENTS = [
  'node:added', 'node:removed', 'node:moved', 'node:click',
  'edge:connected', 'edge:disconnected',
  'selection:changed', 'viewport:changed',
  'widget:changed', 'widget:action',
  'graph:loaded', 'history:changed',
] as const
