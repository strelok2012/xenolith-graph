import type { EditorEvents } from '@xenolith/editor'

/** Maps each public editor event to its idiomatic React callback prop name. */
export const EVENT_PROP = {
  'node:added': 'onNodeAdded',
  'node:removed': 'onNodeRemoved',
  'node:moved': 'onNodeMoved',
  'node:click': 'onNodeClick',
  'edge:connected': 'onEdgeConnected',
  'edge:disconnected': 'onEdgeDisconnected',
  'selection:changed': 'onSelectionChange',
  'viewport:changed': 'onViewportChange',
  'widget:changed': 'onWidgetChange',
  'widget:action': 'onWidgetAction',
  'graph:loaded': 'onGraphLoad',
  'history:changed': 'onHistoryChange',
  'dive:changed': 'onDiveChange',
} as const satisfies Record<keyof EditorEvents, string>

/** The React callback props derived from {@link EVENT_PROP} — one optional handler per event. */
export type EventCallbacks = {
  [E in keyof EditorEvents as (typeof EVENT_PROP)[E]]?: (payload: EditorEvents[E]) => void
}
