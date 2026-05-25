import { DemoPage } from '../Layout.js'
import { ViewportDemo } from '../demos/ViewportDemo.js'

const code = `// Controls and the minimap live INSIDE the editor as overlay panels.
// Buttons inherit the active theme via the editor's --xeno-* CSS vars.
<XenolithGraph onReady={(e) => load(e)}>
  <XenolithControls position="top-right" />       {/* undo/redo · zoom · fit · reset */}
  {on && <XenolithMiniMap position={pos} />}      {/* declarative: mount = on */}

  <XenolithPanel position="top-left">
    <XenolithButton active={on} onClick={() => setOn(v => !v)}>
      {on ? 'Visible' : 'Hidden'}
    </XenolithButton>
  </XenolithPanel>
</XenolithGraph>`

export function Viewport() {
  return (
    <DemoPage
      title="5 · Viewport & minimap"
      blurb="The minimap is a themeable, toggleable prop. Drive the camera imperatively from the editor instance — fit, reset, zoom toward a point — or pan/zoom on the canvas directly."
      code={code}
      githubPath="apps/demo-react/src/demos/ViewportDemo.tsx"
    >
      <ViewportDemo />
    </DemoPage>
  )
}
