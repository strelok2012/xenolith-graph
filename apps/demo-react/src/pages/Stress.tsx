import { XenolithGraph } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'

// E2E fixture (the SPA is the e2e source, not a shipped product page): load a large graph via
// loadJSON and leave the viewport at a working zoom so most nodes are off-screen. Used by
// virtualize.spec.ts to assert editor.renderedNodeCount stays O(visible) ≪ graph.nodeCount and that
// panning stays responsive. The editor is exposed on window for the test to read counts.

const COLS = 40
const ROWS = 25 // 1000 nodes
const STEP_X = 220
const STEP_Y = 130

function makeGraph(): unknown {
  const nodes = []
  const edges = []
  for (let i = 0; i < COLS * ROWS; i++) {
    const id = `n${i}`
    nodes.push({
      id, type: 'Box',
      position: { x: (i % COLS) * STEP_X, y: Math.floor(i / COLS) * STEP_Y },
      render: { title: `Node ${i}`, category: ['logic', 'data', 'macro', 'utility'][i % 4] },
      pins: [
        { id: `${id}:in`, kind: 'data', direction: 'in', type: 'any', multiple: false, label: 'In' },
        { id: `${id}:out`, kind: 'data', direction: 'out', type: 'any', multiple: true, label: 'Out' },
      ],
    })
    if (i % COLS !== 0) edges.push({ id: `e${i}`, from: { node: `n${i - 1}`, pin: `n${i - 1}:out` }, to: { node: id, pin: `${id}:in` } })
  }
  return { version: 'xenolith.v1', nodes, edges }
}

export function Stress() {
  return (
    <div className="editor-wrap" style={{ flex: 1, minWidth: 0 }}>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        style={{ width: '100%', height: '100%' }}
        onReady={(editor: XenolithEditor) => {
          editor.loadJSON(makeGraph())
          editor.setViewport({ x: 0, y: 0, zoom: 1 }) // working zoom — most of the grid is off-screen
          ;(window as unknown as { __xenoTest: XenolithEditor }).__xenoTest = editor
        }}
      />
    </div>
  )
}
