import { DemoPage } from '../Layout.js'
import { MountDemo } from '../demos/MountDemo.js'

const code = `import { XenolithGraph } from '@xenolith/react'

// The editor is WebGL/client-only — render it in the browser only.
export function Editor() {
  return (
    <XenolithGraph
      // No theme → Xen (the default design system). Pass \`theme\` only to change it.
      resizeToWindow={false}     // fit the host element, not the window
      style={{ width: '100%', height: '100%' }}
      onReady={(editor) => {
        // 'editor' is the live instance. Define a node type, drop one in, frame it.
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
  )
}`

export function Mount() {
  return (
    <DemoPage
      title="0 · Mount"
      blurb="The whole editor is one component. Here's the honest minimum: register a node type, add a single node, frame it. Default theme is Xen."
      code={code}
      githubPath="apps/demo-react/src/demos/MountDemo.tsx"
    >
      <MountDemo />
    </DemoPage>
  )
}
