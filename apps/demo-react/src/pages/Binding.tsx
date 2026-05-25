import { DemoPage } from '../Layout.js'
import { BindingDemo } from '../demos/BindingDemo.js'

const code = `function Inspector({ editor, nodeId }) {
  const [, rerender] = useReducer((n) => n + 1, 0)

  // editor → form: a widget dragged inside the canvas refreshes the inputs.
  useEffect(() => editor.on('widget:changed', rerender), [editor])

  const node = editor.graph.getNode(nodeId)
  return node.widgets.map((w) => (
    <label key={w.id}>
      {w.label}
      <input
        value={editor.getWidgetValue(nodeId, w.id)}                       // read current value
        onChange={(e) => editor.setWidgetValue(nodeId, w.id, e.target.value)} // form → editor
      />
    </label>
  ))
}

// nodeId comes from the selection event:
<XenolithGraph onSelectionChange={(e) => setNodeId(e.nodeIds[0])} />`

export function Binding() {
  return (
    <DemoPage
      title="3 · Two-way binding"
      blurb="Select a node and edit its widgets from the React form — sliders, toggles, and even custom canvas widgets (type JSON, blur to commit, watch the curve/pad redraw). Or drag the widgets inside the editor. Both directions stay in sync; the editor is the single source of truth (every change undoable)."
      code={code}
      githubPath="apps/demo-react/src/demos/BindingDemo.tsx"
    >
      <BindingDemo />
    </DemoPage>
  )
}
