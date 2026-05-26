import { XenolithGraph } from '@xenolith/react'
import { DemoStage } from '../Layout.js'

/** Every built-in widget type on one node — slider, number, toggle, combo, color, text — rendered in
 *  WebGL and editable inline. No custom code; just a node schema with a `widgets` array. */
export function BuiltinWidgetsDemo() {
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={(editor) => {
          editor.registry.register({
            type: 'Controls',
            title: 'All widgets',
            pins: [{ kind: 'data', direction: 'out', type: 'any', label: 'Out' }],
            widgets: [
              { id: 'amount', type: 'slider', key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01 },
              { id: 'count', type: 'number', key: 'count', label: 'Count', min: 0, max: 100, step: 1 },
              { id: 'enabled', type: 'toggle', key: 'enabled', label: 'Enabled' },
              { id: 'mode', type: 'combo', key: 'mode', label: 'Mode', values: ['Add', 'Subtract', 'Multiply'] },
              { id: 'tint', type: 'color', key: 'tint', label: 'Tint' },
              { id: 'name', type: 'text', key: 'name', label: 'Name' },
            ],
          })
          const node = editor.registry.instantiate('Controls', { x: 0, y: 0 })
          Object.assign(node.state, { amount: 0.6, count: 8, enabled: true, mode: 'Multiply', tint: '#FCB400', name: 'node' })
          editor.addNode(node)
          editor.fitView({ padding: 90, maxZoom: 1 })
        }}
      />
    </DemoStage>
  )
}
