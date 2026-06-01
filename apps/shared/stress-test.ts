// Perf flex: throw hundreds–thousands of WebGL nodes at the editor and pan/zoom at 60fps — the thing
// a DOM-node library (React Flow) chokes on. The graph here is PROCEDURALLY generated (the legitimate
// exception to format-first: a 1000-node JSON makes no sense), all framework-agnostic editor API. The
// built-in stats overlay shows live FPS + counts; the handle adds nodes or resets.

import type { XenolithEditor, Node, NodeSchema } from '@xenolith/editor'
import { ConnectPins, createEdgeId } from '@xenolith/core'

// 4 categories × 4 names × 1 glyph per category = 16 schemas. The variety makes the stress grid
// read as an actual graph instead of a wall of identical pills; the bake cache still ends up with
// only 16 unique sprites so memory stays bounded.
const POOL = {
  logic:   { glyph: '⚙', names: ['Process', 'Transform', 'Compute', 'Reduce'] },
  data:    { glyph: '◉', names: ['Source', 'Sample', 'Stream', 'Tap'] },
  macro:   { glyph: '⬢', names: ['Pipeline', 'Cluster', 'Stack', 'Bundle'] },
  utility: { glyph: '✦', names: ['Helper', 'Probe', 'Echo', 'Hook'] },
} as const
type CategoryId = keyof typeof POOL
const CATEGORIES = Object.keys(POOL) as CategoryId[]

const SCHEMAS: NodeSchema[] = CATEGORIES.flatMap((cat) =>
  POOL[cat].names.map((name) => ({
    type: `Box-${cat}-${name.toLowerCase()}`,
    title: `${POOL[cat].glyph} ${name}`,
    category: cat,
    pins: [
      { kind: 'data' as const, direction: 'in' as const, type: 'any', label: 'In' },
      { kind: 'data' as const, direction: 'out' as const, type: 'any', label: 'Out' },
    ],
    widgets: [],
  })),
)

// One stable column count for the lifetime of the demo — otherwise every `+N` re-derives `cols`
// from sqrt(total), the old nodes stay on the old grid, the new ones land on a tighter one, and
// you get a visible seam (the "denser bottom half" image #3 was showing).
const COLS = 32

/** Add `n` nodes in a grid (continuing from the current count) and chain consecutive ones with edges.
 *  Pushes through the command bus inside one transaction — so React hooks (`useNodes`) re-render and
 *  the whole burst undoes as a single Cmd+Z. */
function addNodes(editor: XenolithEditor, n: number): void {
  const existing = [...editor.graph.nodes()]
  const start = existing.length
  editor.commandBus.transaction(() => {
    const made: Node[] = []
    for (let i = 0; i < n; i++) {
      const idx = start + i
      // Cycle through all 16 (category, name) combinations so the grid mixes categories AND names
      // across consecutive cells — looks like a real, varied graph rather than category bands.
      const type = SCHEMAS[idx % SCHEMAS.length]!.type
      const node = editor.insertNode(type, { x: (idx % COLS) * 180, y: Math.floor(idx / COLS) * 110 })
      if (node) made.push(node)
    }
    // Sparse edges: link each new node to the previous one.
    const prev = start > 0 ? existing[existing.length - 1] : undefined
    const chain = prev ? [prev, ...made] : made
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i]!, b = chain[i + 1]!
      const outPin = a.pins.find((p) => p.direction === 'out')
      const inPin = b.pins.find((p) => p.direction === 'in')
      if (outPin && inPin) {
        editor.commandBus.apply(new ConnectPins({
          id: createEdgeId(), from: { node: a.id, pin: outPin.id }, to: { node: b.id, pin: inPin.id },
        }))
      }
    }
  })
  // Initial mount only — pin to 0.4 (the LOD threshold where nodes bake to sprites). fitView
  // would zoom out to ~0.16 for a 500-node grid which is past every interesting render path.
  // Subsequent `+N` keep the user's pan/zoom — re-fitting at large N is its own perf trap.
  if (start === 0) editor.setViewport({ x: 0, y: 0, zoom: 0.4 })
}

export interface StressHandle {
  /** Add `n` nodes; returns the new total. */
  add(n: number): number
  /** Bulk-clear via editor.clear() (one #clearAll pass + history drop); returns 0. */
  reset(): number
  count(): number
}

/** Set up the stress-test schema + stats overlay + initial node grid. Pass to `<XenolithGraph onReady>`. */
export function setupStressTest(editor: XenolithEditor, initial = 500): void {
  for (const s of SCHEMAS) editor.registry.register(s)
  editor.setStatsVisible(true)
  addNodes(editor, initial)
}

/** Add `n` more stress nodes to the existing grid. Pure operation — no handle needed. */
export function addStressNodes(editor: XenolithEditor, n: number): void {
  addNodes(editor, n)
}

/** @deprecated Use `setupStressTest` + `addStressNodes` + `editor.clear()` + `useNodes().length`. */
export function buildStressTest(editor: XenolithEditor, initial = 500): StressHandle {
  setupStressTest(editor, initial)
  const count = (): number => [...editor.graph.nodes()].length
  return {
    add: (n) => { addNodes(editor, n); return count() },
    reset: () => { editor.clear(); return count() },
    count,
  }
}
