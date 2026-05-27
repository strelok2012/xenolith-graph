// Perf flex: throw hundreds–thousands of WebGL nodes at the editor and pan/zoom at 60fps — the thing
// a DOM-node library (React Flow) chokes on. The graph here is PROCEDURALLY generated (the legitimate
// exception to format-first: a 1000-node JSON makes no sense), all framework-agnostic editor API. The
// built-in stats overlay shows live FPS + counts; the handle adds nodes or resets.

import type { XenolithEditor, Node, NodeSchema } from '@xenolith/editor'

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

export interface StressHandle {
  /** Add `n` nodes; returns the new total. */
  add(n: number): number
  /** Bulk-clear via editor.clear() (one #clearAll pass + history drop); returns 0. */
  reset(): number
  count(): number
}

export function buildStressTest(editor: XenolithEditor, initial = 500): StressHandle {
  editor.registry.register(SCHEMA)
  editor.setStatsVisible(true)
  addNodes(editor, initial)
  const count = (): number => [...editor.graph.nodes()].length
  return {
    add: (n) => { addNodes(editor, n); return count() },
    reset: () => { editor.clear(); return count() },
    count,
  }
}
