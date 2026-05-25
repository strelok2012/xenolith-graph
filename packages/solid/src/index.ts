import { createEffect, onCleanup } from 'solid-js'
import {
  createEditorBinding,
  EDITOR_EVENT_NAMES,
  type EditorBinding,
  type XenolithProps,
} from '@xenolith/adapter-core'

/**
 * Solid directive: `<div use:xenolith={props} on:node:click={…} on:selection:changed={…} />`.
 * Mounts the editor into the element, syncs props reactively, and re-dispatches every editor event
 * off the element as a same-named CustomEvent (Solid's `on:` binds colon names). Client-only (WebGL).
 *
 * Solid calls a directive as `xenolith(el, accessor)`, where `accessor()` is the bound value.
 */
export function xenolith(el: HTMLElement, accessor: () => XenolithProps | undefined): void {
  let binding: EditorBinding | null = null
  let destroyed = false
  const offs: Array<() => void> = []

  void createEditorBinding(el, accessor() ?? {}).then((b) => {
    if (destroyed) { b.destroy(); return }
    binding = b
    for (const ev of EDITOR_EVENT_NAMES) {
      offs.push(b.on(ev, (detail) => el.dispatchEvent(new CustomEvent(ev, { detail }))))
    }
    b.setProps(accessor() ?? {})
  })

  // Re-run whenever the bound props signal changes.
  createEffect(() => { const p = accessor(); if (p) binding?.setProps(p) })

  onCleanup(() => { destroyed = true; for (const off of offs) off(); binding?.destroy(); binding = null })
}

/** Imperative primitive for hosts that prefer it over the directive. Returns the binding promise;
 *  the caller owns teardown (call `destroy()` from `onCleanup`). */
export function createXenolithGraph(el: HTMLElement, props: XenolithProps = {}): Promise<EditorBinding> {
  return createEditorBinding(el, props)
}
