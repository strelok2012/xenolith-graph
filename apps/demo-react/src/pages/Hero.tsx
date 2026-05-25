import { DemoPage } from '../Layout.js'
import { HeroDemo } from '../demos/HeroDemo.js'

const code = `import { reactWidget } from './react-widget' // mounts a React component as a widget

// Any React component is a widget. Style it with the editor's CSS vars so it tracks the theme:
function AsyncSelect({ value, setValue }) {
  const [opts, setOpts] = useState([])
  // ...debounced fetch to your server...
  return (
    <div style={{ background: 'var(--xeno-bg)', color: 'var(--xeno-text)',
                  border: '1px solid var(--xeno-border)', borderRadius: 'var(--xeno-radius)' }}>
      <input value={value} onChange={...} />
      {opts.map((o) => <div onMouseDown={() => setValue(o)}>{o}</div>)}
    </div>
  )
}

editor.registerWidget('async-select', reactWidget(AsyncSelect))
// node: widgets: [{ id: 'fruit', type: 'custom', renderer: 'async-select', key: 'fruit' }]`

export function Hero() {
  return (
    <DemoPage
      title="7 · Bring your own UI"
      blurb="Custom widgets are real React components mounted inside nodes via reactWidget: a select with server-side search, an image drop-zone, a CodeMirror editor, a live sparkline. They style themselves with the editor's --xeno-* CSS variables, so the theme switcher (top) restyles them automatically — Xen and Liquid Glass, no extra work. This is the plugin ecosystem."
      code={code}
      githubPath="apps/demo-react/src/widgets/hero.tsx"
    >
      <HeroDemo />
    </DemoPage>
  )
}
