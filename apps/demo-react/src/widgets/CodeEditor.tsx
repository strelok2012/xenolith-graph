import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import type { WidgetProps } from '@xenolith/react'

// A real CodeMirror editor mounted inside a node — proof that any DOM-heavy component works.
export function CodeEditor({ value, setValue }: WidgetProps) {
  return (
    <div className="w-code">
      <CodeMirror
        value={String(value ?? '')}
        theme="dark"
        height="100%"
        extensions={[json()]}
        basicSetup={{ lineNumbers: false, foldGutter: false, highlightActiveLine: false }}
        onChange={(v) => setValue(v)}
      />
    </div>
  )
}
