import { DemoPage } from '../Layout.js'
import { LoadDemo } from '../demos/LoadDemo.js'

const code = `import { demoGraph, demoSchemas, createCurveWidget, createXYPadWidget } from '@xenolith/demo'

onReady={(editor) => {
  // Register the custom widgets + node types this graph uses…
  editor.registerWidget('curve', createCurveWidget())
  editor.registerWidget('xypad', createXYPadWidget())
  for (const schema of demoSchemas) editor.registry.register(schema)

  // …then load the saved xenolith.v1 graph (a real 15-node workflow) and frame it.
  editor.loadJSON(demoGraph)
  editor.fitView({ padding: 48 })
}}`

export function Load() {
  return (
    <DemoPage
      title="1 · Load a graph"
      blurb="What's on screen is a real saved xenolith.v1 graph — 15 nodes. Register the widgets + node schemas it uses, then loadJSON + fitView. (ComfyUI workflows import the same way.)"
      code={code}
      githubPath="apps/demo-react/src/demos/LoadDemo.tsx"
    >
      <LoadDemo />
    </DemoPage>
  )
}
