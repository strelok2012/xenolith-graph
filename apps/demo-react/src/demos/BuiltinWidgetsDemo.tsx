import { XenolithGraph } from '@xenolith/react'
import { buildBuiltinWidgets } from '@xenolith/demo/builtin-widgets'
import { DemoStage } from '../Layout.js'

/** Every built-in widget type on one node — slider, number, toggle, combo, color, text — rendered in
 *  WebGL and editable inline. The node is just DATA (@xenolith/demo/builtin-widgets, builtin-widgets.json). */
export function BuiltinWidgetsDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={(editor) => buildBuiltinWidgets(editor)} />
    </DemoStage>
  )
}
