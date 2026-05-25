import { DemoPage } from '../Layout.js'
import { CanvasWidgetDemo } from '../demos/CanvasWidgetDemo.js'

const code = `import type { CanvasWidgetController } from '@xenolith/editor'

// A custom widget is just two functions: draw() paints, onPointer() returns the new value.
const levelWidget: CanvasWidgetController = {
  draw(ctx, { value, width, height, accent, muted }) {
    const v = typeof value === 'number' ? value : 0
    ctx.fillStyle = muted; ctx.font = '11px Inter'; ctx.textBaseline = 'top'
    ctx.fillText(\`\${Math.round(v*100)}%\`, 0, 0)                                   // readout (top)
    const barY = height - 10
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(0, barY, width, 8)        // track
    ctx.fillStyle = accent;                   ctx.fillRect(0, barY, width*v, 8)      // fill
  },
  onPointer(phase, x, _y, { width }) {
    if (phase === 'up') return undefined
    return Math.max(0, Math.min(1, x / width))   // click/drag → new value (editor commits it)
  },
}

editor.registerWidget('level', levelWidget)
// then on a node:  widgets: [{ id: 'gain', type: 'custom', renderer: 'level', key: 'gain' }]

// Catch the widget's value in React — it commits through the editor like any other widget:
<XenolithGraph onWidgetChange={(e) => { if (e.widgetId === 'gain') setGain(Number(e.value)) }} />`

export function CanvasWidget() {
  return (
    <DemoPage
      title="6 · Custom widget (canvas)"
      blurb="The simplest custom widget from scratch: a click-drag level bar. A CanvasWidgetController is two functions — draw paints a 2D canvas, onPointer returns the new value. No DOM, no framework. Drag the bar in the node."
      code={code}
      githubPath="apps/demo-react/src/demos/CanvasWidgetDemo.tsx"
    >
      <CanvasWidgetDemo />
    </DemoPage>
  )
}
