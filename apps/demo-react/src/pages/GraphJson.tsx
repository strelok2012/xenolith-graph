import { DemoPage } from '../Layout.js'
import { GraphJsonDemo } from '../demos/GraphJsonDemo.js'

const code = `// The whole graph is serializable state — bind it like any other value.
const [json, setJson] = useState(() => JSON.stringify(editor.toJSON(), null, 2))

// JSON → editor: rebuild the canvas from edited state.
editor.loadJSON(JSON.parse(json))

// editor → JSON: any change refreshes the serialized graph.
<XenolithGraph
  onNodeMoved={() => setJson(JSON.stringify(editor.toJSON(), null, 2))}
  onEdgeConnected={() => setJson(JSON.stringify(editor.toJSON(), null, 2))}
  onWidgetChange={() => setJson(JSON.stringify(editor.toJSON(), null, 2))}
/>`

export function GraphJson() {
  return (
    <DemoPage
      title="3 · Graph ⇄ JSON"
      blurb="Not just widgets — the entire graph is bindable state. editor.toJSON() ⇄ editor.loadJSON(). Move nodes, connect pins, tweak widgets and watch the JSON update; edit the JSON and Apply to rebuild the canvas. This is your save/load, autosave, and collaborative-sync surface."
      code={code}
      githubPath="apps/demo-react/src/demos/GraphJsonDemo.tsx"
    >
      <GraphJsonDemo />
    </DemoPage>
  )
}
