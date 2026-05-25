import { DemoPage } from '../Layout.js'
import { ThemingDemo } from '../demos/ThemingDemo.js'

const code = `const [theme, setTheme] = useState(xenTheme)
// Switching the prop calls editor.setTheme() under the hood — fully runtime.
<XenolithGraph theme={theme} />
<button onClick={() => setTheme(liquidGlassTheme)}>Liquid Glass</button>`

export function Theming() {
  return (
    <DemoPage
      title="4 · Theming"
      blurb="Theme is a reactive prop. Flip it at runtime — the default is Xen (dark/gold); Liquid Glass is the Apple-inspired translucent material."
      code={code}
      githubPath="apps/demo-react/src/demos/ThemingDemo.tsx"
    >
      <ThemingDemo />
    </DemoPage>
  )
}
