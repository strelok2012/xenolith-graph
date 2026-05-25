import {
  createEditorBinding,
  EDITOR_EVENT_NAMES,
  type EditorBinding,
  type XenolithProps,
} from '@xenolith/adapter-core'

/** Editor `node:click` → DOM event `node-click` (Svelte's `on:` directive can't bind colon names). */
export function svelteEventName(event: string): string {
  return event.replace(':', '-')
}

export interface XenolithActionReturn {
  update(props: XenolithProps): void
  destroy(): void
}

/**
 * Svelte action: `<div use:xenolith={props} on:node-click on:selection-changed … />`. Mounts the
 * editor into the node, syncs props on change, and re-dispatches every editor event off the node as
 * a kebab-named CustomEvent (`node-click`, `edge-connected`, …). Editor is WebGL/client-only.
 */
export function xenolith(node: HTMLElement, props: XenolithProps = {}): XenolithActionReturn {
  let binding: EditorBinding | null = null
  let destroyed = false
  const offs: Array<() => void> = []

  void createEditorBinding(node, props).then((b) => {
    if (destroyed) { b.destroy(); return }
    binding = b
    for (const ev of EDITOR_EVENT_NAMES) {
      offs.push(b.on(ev, (detail) => node.dispatchEvent(new CustomEvent(svelteEventName(ev), { detail }))))
    }
  })

  return {
    update(next) { binding?.setProps(next) },
    destroy() { destroyed = true; for (const off of offs) off(); binding?.destroy(); binding = null },
  }
}
