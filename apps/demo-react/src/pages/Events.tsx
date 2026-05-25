import { DemoPage } from '../Layout.js'
import { EventsDemo } from '../demos/EventsDemo.js'

const code = `<XenolithGraph
  theme={xenTheme}
  onNodeClick={(e) => console.log('clicked', e.nodeId)}
  onSelectionChange={(e) => setSelected(e.nodeIds)}
  onNodeMoved={(e) => console.log('moved', e.nodeId, e.position)}
  onEdgeConnected={(e) => console.log('connected', e.edge.id)}
  onWidgetChange={(e) => setValue(e.nodeId, e.widgetId, e.value)}
  onHistoryChange={(e) => setCanUndo(e.canUndo)}
/>`

export function Events() {
  return (
    <DemoPage
      title="2 · Events → your state"
      blurb="Every interaction is a typed React callback. Wire them to your own state — a live event log, a selection inspector, and live widget values. Drag a slider, type in a field, connect pins, delete."
      code={code}
      githubPath="apps/demo-react/src/demos/EventsDemo.tsx"
    >
      <EventsDemo />
    </DemoPage>
  )
}
