// Auto-layout showcase: ~14 ill-placed nodes wired as a fan-in/fan-out DAG. Calling `arrange()`
// runs the dagre engine and applies positions in a single transaction (one undo restores the
// messy original). Reused by both the React demo wrapper and the vanilla mounter — no framework
// in the core; same data + same setup + same plugin.

import type { XenolithEditor } from '@xenolith/editor'
import { autoLayoutPlugin, type AutoLayoutPlugin, type LayoutOpts } from '@xenolith/plugin-autolayout'
import { dagreEngine } from '@xenolith/plugin-autolayout/dagre'
import type { Node, Edge, NodeId, PinId, EdgeId } from '@xenolith/core'

const NODES: { id: string; title: string; x: number; y: number }[] = [
  { id: 'in',  title: 'Input',     x: 480, y: 60  },
  { id: 'a1',  title: 'Tokenize',  x: 80,  y: 320 },
  { id: 'a2',  title: 'Embed',     x: 730, y: 410 },
  { id: 'a3',  title: 'Encode',    x: 250, y: 80  },
  { id: 'b1',  title: 'Attention', x: 600, y: 220 },
  { id: 'b2',  title: 'Norm',      x: 30,  y: 200 },
  { id: 'b3',  title: 'FFN',       x: 410, y: 480 },
  { id: 'c1',  title: 'Residual',  x: 770, y: 100 },
  { id: 'c2',  title: 'Merge',     x: 120, y: 480 },
  { id: 'd1',  title: 'Project',   x: 340, y: 260 },
  { id: 'd2',  title: 'Logits',    x: 540, y: 350 },
  { id: 'd3',  title: 'Sample',    x: 200, y: 410 },
  { id: 'd4',  title: 'Decode',    x: 640, y: 60  },
  { id: 'out', title: 'Output',    x: 90,  y: 130 },
]
const EDGES: [string, string][] = [
  ['in', 'a1'], ['in', 'a3'], ['in', 'a2'],
  ['a1', 'b2'], ['a3', 'b1'], ['a2', 'b1'], ['a2', 'b3'],
  ['b1', 'c1'], ['b1', 'd1'], ['b2', 'c2'], ['b3', 'd1'], ['b3', 'd2'],
  ['c1', 'd4'], ['c2', 'd3'], ['d1', 'd2'], ['d2', 'd3'],
  ['d3', 'out'], ['d4', 'out'],
]

export interface AutoLayoutScene {
  /** Installed plugin instance — call `plugin.arrange(opts)` to lay out the graph. */
  plugin: AutoLayoutPlugin
  /** Convenience: run arrange + refit the viewport. */
  arrange: (opts?: LayoutOpts) => Promise<void>
}

// Per-editor plugin handle. The React panel reads this via `runAutoLayout(editor, opts)` so it
// doesn't have to keep a scene object around — `setupAutoLayout` is called in `onReady` and the
// plugin is stashed here for later operations.
const PLUGINS = new WeakMap<XenolithEditor, AutoLayoutPlugin>()

/** Idempotent setup: install the plugin, load the demo graph, fit the view. Safe to pass directly
 *  to `<XenolithGraph onReady>` — synchronous, no first-paint flicker. */
export function setupAutoLayout(editor: XenolithEditor): void {
  const plugin = autoLayoutPlugin({
    engine: dagreEngine(),
    defaults: { direction: 'LR', spacing: { node: 40, layer: 90 }, animate: { durationMs: 600 } },
  })
  editor.use(plugin)
  PLUGINS.set(editor, plugin)
  loadAutoLayoutGraph(editor)
}

/** Run the layout engine in the requested direction and refit. No-op if `setupAutoLayout` hasn't
 *  run yet on this editor. */
export async function runAutoLayout(editor: XenolithEditor, opts?: LayoutOpts): Promise<void> {
  const plugin = PLUGINS.get(editor)
  if (!plugin) return
  await plugin.arrange(opts)
  editor.fitView({ padding: 56, maxZoom: 1 })
}

function loadAutoLayoutGraph(editor: XenolithEditor): void {
  const nodes: Node[] = NODES.map((n) => ({
    id: n.id as NodeId, type: 'Step', position: { x: n.x, y: n.y }, size: { x: 160, y: 64 },
    state: {},
    render: { title: n.title, category: 'logic' } as never,
    pins: [
      { id: `${n.id}_in`  as PinId, kind: 'data', direction: 'in',  type: 'float', multiple: false, label: 'in'  },
      { id: `${n.id}_out` as PinId, kind: 'data', direction: 'out', type: 'float', multiple: true,  label: 'out' },
    ],
  }))
  const edges: Edge[] = EDGES.map(([from, to], i) => ({
    id: `e${i}` as EdgeId,
    from: { node: from as NodeId, pin: `${from}_out` as PinId },
    to:   { node: to   as NodeId, pin: `${to}_in`    as PinId },
  }))
  editor.loadJSON({ version: 'xenolith.v1', nodes, edges })
  editor.fitView({ padding: 56, maxZoom: 1 })
}

/** @deprecated Prefer `setupAutoLayout(editor)` + `runAutoLayout(editor, opts)`. Kept for the
 *  vanilla examples; will be removed in a follow-up. */
export function buildAutoLayout(editor: XenolithEditor): AutoLayoutScene {
  setupAutoLayout(editor)
  const plugin = PLUGINS.get(editor)!
  return {
    plugin,
    arrange: (opts) => runAutoLayout(editor, opts),
  }
}
