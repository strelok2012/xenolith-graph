import { useEffect, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import type { WidgetProps } from '../react-widget.js'

// ---- 1. Async select with "server" search ------------------------------------------------------
const FRUITS = ['Apple', 'Apricot', 'Banana', 'Blueberry', 'Cherry', 'Date', 'Fig', 'Grape', 'Kiwi', 'Lemon', 'Mango', 'Orange', 'Peach', 'Pear', 'Plum', 'Raspberry', 'Strawberry', 'Watermelon']
function fakeSearch(q: string): Promise<string[]> {
  return new Promise((res) => setTimeout(() => res(FRUITS.filter((f) => f.toLowerCase().includes(q.toLowerCase())).slice(0, 6)), 350))
}

export function AsyncSelect({ value, setValue }: WidgetProps) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [opts, setOpts] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    setLoading(true)
    const t = setTimeout(() => { void fakeSearch(q).then((r) => { setOpts(r); setLoading(false) }) }, 250)
    return () => clearTimeout(t)
  }, [q, open])
  return (
    <div className="w-async">
      <input
        placeholder="Search fruit…"
        value={open ? q : String(value ?? '')}
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={(e) => setQ(e.target.value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="w-async-menu">
          {loading ? <div className="w-async-item muted">Searching…</div>
            : opts.length ? opts.map((o) => (
              <div key={o} className="w-async-item" onMouseDown={() => { setValue(o); setOpen(false) }}>{o}</div>
            ))
            : <div className="w-async-item muted">No matches</div>}
        </div>
      )}
    </div>
  )
}

// ---- 2. File / image drop with preview ---------------------------------------------------------
export function FileDrop({ value, setValue }: WidgetProps) {
  const onFile = (file?: File): void => {
    if (!file) return
    const r = new FileReader()
    r.onload = () => setValue(r.result as string)
    r.readAsDataURL(file)
  }
  const hasImg = typeof value === 'string' && value.startsWith('data:')
  return (
    <div className="w-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}>
      {hasImg
        ? <img src={value as string} className="w-drop-img" alt="" />
        : <label className="w-drop-empty">Drop image or <span>browse</span>
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>}
    </div>
  )
}

// ---- 3. Code / prompt editor (CodeMirror) ------------------------------------------------------
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

// ---- 4. Sparkline preview ----------------------------------------------------------------------
export function Sparkline({ value, setValue }: WidgetProps) {
  const data = Array.isArray(value) ? (value as number[]) : []
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${100 - v * 100}`).join(' ')
  return (
    <div className="w-spark">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-spark-svg">
        <polyline points={pts} fill="none" stroke="var(--xeno-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => setValue(Array.from({ length: 16 }, () => Math.random()))}>
        Shuffle
      </button>
    </div>
  )
}
