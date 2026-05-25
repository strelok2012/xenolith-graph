import { XenolithGraph } from '@xenolith/react'
import { DemoStage } from '../Layout.js'

/** Island: the honest minimum — no theme (Xen is the default), register a node type, add one, frame. */
export function MountDemo() {
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={(editor) => {
          editor.registry.register({
            type: 'Greeter',
            title: 'Greeter',
            pins: [{ kind: 'data', direction: 'out', type: 'string', label: 'Out' }],
            widgets: [{ id: 'msg', type: 'text', key: 'msg', label: 'Message' }],
          })
          const node = editor.registry.instantiate('Greeter', { x: 0, y: 0 })
          node.state['msg'] = 'Hello, Xenolith'
          editor.addNode(node)
          editor.fitView({ padding: 80, maxZoom: 1 })
        }}
      />
    </DemoStage>
  )
}
