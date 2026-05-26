import { DemoPage } from '../Layout.js'
import { GraphJsonDemo } from '../demos/GraphJsonDemo.js'

const code = `// The whole graph as reactive state — one hook, no event wiring.
function JsonPanel() {
  const editor = useXenolithEditor()
  const json = useGraphJSON()          // re-emits on move / connect / widget edit / undo

  return (
    <XenolithPanel position="top-right">
      <button onClick={() => editor.loadJSON(/* edited */ json)}>Apply →</button>
      <pre>{JSON.stringify(json, null, 2)}</pre>
    </XenolithPanel>
  )
}

// Drop it inside the editor — it reads the live graph from context:
<XenolithGraph onReady={load}><JsonPanel /></XenolithGraph>`

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
