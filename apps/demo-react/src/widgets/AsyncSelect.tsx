import { useEffect, useState } from 'react'
import type { WidgetProps } from '@xenolith/react'

// A select whose options come from an async "server" search — debounced, with a loading state.
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
