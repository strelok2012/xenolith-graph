// Editor ↔ Runtime bridge. The bits a host shouldn't have to re-implement:
//   - Output node value mirroring: every `Output` writes its current value into VM var
//     `output:<nodeId>`; the bridge copies that into the node's `state.value` so the in-node
//     `output` widget shows the live value. WORKAROUND until core ships
//     `graphSnapshot({ shareState: true })` so Output can mutate its own state in-place.
//
// Hosts call `attachRuntimeBridge(editor, rt)` ONCE after creating the Runtime. From then on,
// every `rt.tick(...)` automatically refreshes Output widgets. No per-host loop.

import type { XenolithEditor } from '@xenolith/editor'
import type { Runtime } from '../vm/interpreter.js'
import { OUTPUT_VAR_PREFIX } from '../vm/collection.js'

/** Wire automatic post-tick behaviour into a Runtime: mirror Output VM vars into widget state.
 *  Returns a disposer that removes the listener (call on host teardown / engine switch). */
export function attachRuntimeBridge(editor: XenolithEditor, rt: Runtime): () => void {
  return rt.onAfterTick(() => {
    for (const n of editor.graph.nodes()) {
      if (n.type !== 'Output') continue
      const v = rt.getVar(`${OUTPUT_VAR_PREFIX}${String(n.id)}`)
      if (v === undefined) continue
      editor.setWidgetValue(n.id, 'value', v, { ephemeral: true })
    }
  })
}
