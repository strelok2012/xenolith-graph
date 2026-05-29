// The XenolithGraph plugin: installs the runtime's pin types + primitive node schemas into the
// editor (so the COMPUTE graph is visible/editable and the primitives show in the Tab palette).
// Type-only imports from core/editor → erased at runtime, so the headless VM stays import-free.
//
// This is the registration layer only — driving the live graph (reading editor.graph each tick and
// running the VM) is the host's job, kept separate so the same VM can run headlessly.

import type { XenolithPlugin } from '@xenolith/editor'
import { PIN_TYPES, PRIMITIVE_SCHEMAS } from './schemas.js'
import { outputWidget } from './output-widget.js'

export const runtimePlugin: XenolithPlugin = {
  name: 'runtime',
  install(ctx) {
    for (const t of PIN_TYPES) ctx.types.register(t)
    for (const s of PRIMITIVE_SCHEMAS) ctx.registry.register(s)
    ctx.registerWidget('output', outputWidget)
    return () => {
      for (const s of PRIMITIVE_SCHEMAS) ctx.registry.unregister(s.type)
      for (const t of PIN_TYPES) ctx.types.unregister(t.id)
    }
  },
}
