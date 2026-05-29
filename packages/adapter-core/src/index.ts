import { XenolithEditor, type XenolithEditorOptions, type EditorEvents } from '@xenolith/editor'
import { applyProps, type XenolithProps } from './props.js'

export type { XenolithProps } from './props.js'
export { applyProps, type EditorLike } from './props.js'

/** The canonical public editor event names. Every adapter derives its idiomatic surface from this
 *  single list (React `onNodeClick`, Vue `@node-click`, DOM `node:click`, …). */
export const EDITOR_EVENT_NAMES = [
  'node:added', 'node:removed', 'node:moved', 'node:click',
  'edge:connected', 'edge:disconnected',
  'selection:changed', 'viewport:changed',
  'widget:changed', 'widget:action',
  'graph:loaded', 'history:changed', 'dive:changed',
] as const satisfies ReadonlyArray<keyof EditorEvents>

export interface EditorBinding {
  readonly editor: XenolithEditor
  /** Subscribe to a public editor event. Returns an unsubscribe fn. */
  on<E extends keyof EditorEvents>(event: E, handler: (payload: EditorEvents[E]) => void): () => void
  /** Apply a new props object; only changed (by reference) props touch the editor. */
  setProps(next: XenolithProps): void
  /** Tear down the editor and release its WebGL context. */
  destroy(): void
}

function toInitOptions(props: XenolithProps): XenolithEditorOptions {
  const opts: XenolithEditorOptions = {}
  if (props.theme !== undefined) opts.theme = props.theme
  if (props.zoomBounds !== undefined) opts.zoomBounds = props.zoomBounds
  if (props.minimap !== undefined) opts.minimap = props.minimap
  if (props.disableGrid !== undefined) opts.disableGrid = props.disableGrid
  if (props.snap !== undefined) opts.snap = props.snap
  if (props.resizeToWindow !== undefined) opts.resizeToWindow = props.resizeToWindow
  if (props.isValidConnection !== undefined) opts.isValidConnection = props.isValidConnection
  return opts
}

/** Mount a XenolithGraph editor into `target` and wrap it in a framework-agnostic binding. This is
 *  the single foundation every adapter (Web Component, React, Vue, Svelte, Solid) builds on:
 *  props in (reactively, via {@link EditorBinding.setProps}), events out (via `on`). */
export async function createEditorBinding(
  target: string | HTMLElement,
  props: XenolithProps = {},
): Promise<EditorBinding> {
  const editor = await XenolithEditor.init(target, toInitOptions(props))
  let current: XenolithProps = props

  if (props.graph != null) {
    editor.loadJSON(props.graph)
    if (props.fitOnLoad) editor.fitView()
  }

  return {
    editor,
    on: (event, handler) => editor.on(event, handler),
    setProps(next) { applyProps(editor, current, next); current = next },
    destroy() { editor.destroy() },
  }
}
