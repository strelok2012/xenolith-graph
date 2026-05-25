import type { XenolithEditorOptions, MinimapPosition } from '@xenolith/editor'

/** Reactive props an adapter (Web Component, React, …) feeds into the editor. A subset is also the
 *  initial-mount config; the rest are applied imperatively on change via {@link applyProps}. */
export interface XenolithProps {
  theme?: XenolithEditorOptions['theme']
  /** xenolith.v1 graph JSON. Reloaded whenever the reference changes (treat as immutable). */
  graph?: unknown
  zoomBounds?: XenolithEditorOptions['zoomBounds']
  minimap?: XenolithEditorOptions['minimap']
  disableGrid?: boolean
  snap?: number
  /** When false (recommended for embedded panels / framework islands), the editor fits its host
   *  element via a ResizeObserver instead of the window. Defaults to window-fit. */
  resizeToWindow?: boolean
  /** Frame the graph after each (re)load. */
  fitOnLoad?: boolean
}

/** The slice of the editor surface that {@link applyProps} drives — kept minimal so it can be
 *  exercised with a mock in unit tests without a WebGL context. */
export interface EditorLike {
  setTheme(theme: NonNullable<XenolithProps['theme']>): void
  loadJSON(data: unknown): void
  fitView(opts?: { padding?: number; maxZoom?: number; minZoom?: number }): void
  setMinimapVisible(visible: boolean): void
  setMinimapPosition(position: MinimapPosition): void
}

function minimapEnabled(m: XenolithProps['minimap']): boolean {
  return m === true || (typeof m === 'object' && m !== null)
}
function minimapPosition(m: XenolithProps['minimap']): MinimapPosition | undefined {
  return typeof m === 'object' && m !== null ? m.position : undefined
}

/** Diff `prev` → `next` and call the matching editor methods. Reference equality is the change
 *  signal (props are treated as immutable), so adapters can call this on every render cheaply. */
export function applyProps(editor: EditorLike, prev: XenolithProps, next: XenolithProps): void {
  if (next.theme && next.theme !== prev.theme) editor.setTheme(next.theme)

  if (next.graph != null && next.graph !== prev.graph) {
    editor.loadJSON(next.graph)
    if (next.fitOnLoad) editor.fitView()
  }

  if (minimapEnabled(next.minimap) !== minimapEnabled(prev.minimap)) {
    editor.setMinimapVisible(minimapEnabled(next.minimap))
  }
  const pos = minimapPosition(next.minimap)
  if (pos !== undefined && pos !== minimapPosition(prev.minimap)) editor.setMinimapPosition(pos)
}
