import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useXenolithEditor } from '@xenolith/react'
import type { XenolithEditor, Node, NodeSchema } from '@xenolith/editor'
import { DemoStage } from '../Layout.js'

// Perf flex: throw hundreds–thousands of WebGL nodes at the editor and pan/zoom at 60fps — the
// thing a DOM-node library (React Flow) chokes on. The built-in stats overlay shows live FPS +
// node/edge counts during interaction; the panel adds more nodes or resets.

const SCHEMA: NodeSchema = {
  type: 'Box',
  title: 'Node',
  pins: [
    { kind: 'data', direction: 'in', type: 'any', label: 'In' },
    { kind: 'data', direction: 'out', type: 'any', label: 'Out' },
  ],
  widgets: [],
}

const CATEGORIES = ['logic', 'data', 'macro', 'utility'] as const

/** Add `n` nodes in a grid (continuing from the current count) and chain consecutive ones with edges. */
function addNodes(editor: XenolithEditor, n: number): void {
  const existing = [...editor.graph.nodes()]
  const start = existing.length
  const cols = Math.ceil(Math.sqrt(start + n))
  const made: Node[] = []
  for (let i = 0; i < n; i++) {
    const idx = start + i
    const node = editor.registry.instantiate('Box', { x: (idx % cols) * 180, y: Math.floor(idx / cols) * 110 })
    editor.addNode(node, { category: CATEGORIES[idx % CATEGORIES.length]! })
    made.push(node)
  }
  // Sparse edges: link each new node to the previous one.
  const prev = start > 0 ? existing[existing.length - 1] : undefined
  const chain = prev ? [prev, ...made] : made
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i]!, b = chain[i + 1]!
    const oi = a.pins.findIndex((p) => p.direction === 'out')
    const ii = b.pins.findIndex((p) => p.direction === 'in')
    if (oi >= 0 && ii >= 0) editor.connect(a, oi, b, ii)
  }
  editor.fitView({ padding: 40 })
}

function StressPanel() {
  const editor = useXenolithEditor()
  const [count, setCount] = useState(0)
  const busy = useRef(false)
  const sync = (): void => setCount(editor ? [...editor.graph.nodes()].length : 0)
  // Reflect the initial graph (generated in onReady, before this panel mounts).
  useEffect(() => { sync() }, [editor])

  const add = (n: number): void => {
    if (!editor || busy.current) return
    busy.current = true
    addNodes(editor, n)
    sync()
    busy.current = false
  }
  // Bulk-clear via editor.clear() — one #clearAll pass + history drop; NOT selectAll+deleteSelected
  // (which on thousands of nodes draws every selection glow and builds a giant undo transaction).
  const reset = (): void => {
    if (!editor) return
    editor.clear()
    sync()
  }

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 168 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Stress test</p>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--xeno-accent)', fontVariantNumeric: 'tabular-nums' }}>{count}<span style={{ fontSize: 12, color: 'var(--xeno-muted)', fontWeight: 400 }}> nodes</span></div>
      <div style={{ display: 'flex', gap: 6 }}>
        <XenolithButton onClick={() => add(500)} style={{ flex: 1 }}>+500</XenolithButton>
        <XenolithButton onClick={() => add(1000)} style={{ flex: 1 }}>+1000</XenolithButton>
      </div>
      <XenolithButton onClick={reset} style={{ width: '100%' }}>Reset</XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
        Generate nodes, pan and zoom. Live stats top-right. WebGL, render-on-demand.
      </span>
    </XenolithPanel>
  )
}

/** Showcase: WebGL performance under load. */
export function StressTestDemo() {
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={(editor) => {
          editor.registry.register(SCHEMA)
          editor.setStatsVisible(true)
          addNodes(editor, 500)
        }}
      >
        <StressPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
