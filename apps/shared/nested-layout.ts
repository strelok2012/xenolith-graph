// Nested Auto-Layout showcase — 3 levels of hierarchy (Encoder/Decoder macros, each containing
// Attention + FFN sub-macros, each containing leaf ops). With **ELK** the hierarchy survives:
// children stay inside their parent frame, parents stay separated by direction. With **dagre**
// the same graph flattens — `parent` is ignored, so all 14 nodes pile into one row and the
// macro frames smear across everything. That's the whole demo: same data, two engines, one
// visibly correct.

import type { XenolithEditor } from '@xenolith/editor'
import { autoLayoutPlugin, type AutoLayoutPlugin, type LayoutOpts } from '@xenolith/plugin-autolayout'
import { dagreEngine } from '@xenolith/plugin-autolayout/dagre'
import { elkEngine } from '@xenolith/plugin-autolayout/elk'
import type { Node, Edge, NodeId, PinId, EdgeId } from '@xenolith/core'

type Pos = { x: number; y: number }
const at = (x: number, y: number): Pos => ({ x, y })

// Leaf ops: small generic nodes with one in / one out pin. `render` is a loadJSON-only metadata
// channel for title/category (stripped onto editor.#renderOpts during materialisation), not part
// of the core Node interface — hence the `as Node` cast on the whole literal.
function leaf(id: string, title: string, pos: Pos): Node {
  return {
    id: id as NodeId, type: 'Op', position: pos, size: { x: 140, y: 56 },
    state: {},
    render: { title, category: 'logic' },
    pins: [
      { id: `${id}_in`  as PinId, kind: 'data', direction: 'in',  type: 'float', multiple: false, label: 'in'  },
      { id: `${id}_out` as PinId, kind: 'data', direction: 'out', type: 'float', multiple: true,  label: 'out' },
    ],
  } as Node
}
// Expanded macro = an in-graph container whose `state.members` is rendered as a frame around
// the listed nodes. Position is per-macro but the visual frame follows the member bounds.
function macro(id: string, title: string, members: string[], pos: Pos): Node {
  return {
    id: id as NodeId, type: 'Macro', position: pos, pins: [],
    state: { members, collapsed: false },
    render: { title, category: 'macro' } as never,
  } as Node
}
const wire = (id: string, from: string, to: string): Edge => ({
  id: id as EdgeId,
  from: { node: from as NodeId, pin: `${from}_out` as PinId },
  to:   { node: to   as NodeId, pin: `${to}_in`    as PinId },
})

// 2 top-level macros (Encoder, Decoder), each with 2 sub-macros (Attn, FFN), each with 2 leaves.
// Edges run leaf→leaf across all boundaries — that's what makes a flat layout look like a knot.
// Starting positions are deliberately scrambled so any auto-arrange has visible work to do.
const NODES: Node[] = [
  // Encoder/Attn
  leaf('e_a_norm', 'Norm',   at(120, 380)),
  leaf('e_a_proj', 'Q/K/V',  at(420, 60)),
  macro('e_attn', 'Attention', ['e_a_norm', 'e_a_proj'], at(120, 220)),
  // Encoder/FFN
  leaf('e_f_lin',  'Linear', at(620, 410)),
  leaf('e_f_act',  'GELU',   at(40,  60)),
  macro('e_ffn', 'FFN', ['e_f_lin', 'e_f_act'], at(540, 110)),
  // Encoder top
  macro('encoder', 'Encoder', ['e_attn', 'e_ffn'], at(220, 50)),

  // Decoder/Attn
  leaf('d_a_norm', 'Norm',     at(880, 360)),
  leaf('d_a_proj', 'Q/K/V',    at(320, 540)),
  macro('d_attn', 'Cross-Attn', ['d_a_norm', 'd_a_proj'], at(820, 240)),
  // Decoder/FFN
  leaf('d_f_lin',  'Linear', at(20,  500)),
  leaf('d_f_act',  'GELU',   at(960, 100)),
  macro('d_ffn', 'FFN', ['d_f_lin', 'd_f_act'], at(820, 460)),
  // Decoder top
  macro('decoder', 'Decoder', ['d_attn', 'd_ffn'], at(700, 200)),
]

const EDGES: Edge[] = [
  // Inside Encoder/Attn
  wire('ea1', 'e_a_proj', 'e_a_norm'),
  // Inside Encoder/FFN
  wire('eb1', 'e_f_act',  'e_f_lin'),
  // Encoder/Attn → Encoder/FFN
  wire('ec1', 'e_a_norm', 'e_f_act'),
  // Inside Decoder/Attn
  wire('da1', 'd_a_proj', 'd_a_norm'),
  // Inside Decoder/FFN
  wire('db1', 'd_f_act',  'd_f_lin'),
  // Decoder/Attn → Decoder/FFN
  wire('dc1', 'd_a_norm', 'd_f_act'),
  // Encoder → Decoder (cross-attention input)
  wire('xed1', 'e_f_lin', 'd_a_proj'),
]

export type LayoutEngineId = 'dagre' | 'elk'

export interface NestedLayoutScene {
  plugin: AutoLayoutPlugin
  /** Arrange the graph with the currently-selected engine; switch via `setEngine`. */
  arrange: (opts?: LayoutOpts) => Promise<void>
  /** Swap the underlying engine in place. Subsequent `arrange()` calls use the new one. */
  setEngine: (id: LayoutEngineId) => void
  getEngine: () => LayoutEngineId
}

export function buildNestedLayout(editor: XenolithEditor): NestedLayoutScene {
  // Per-engine plugin instances — swapping plugin engines on the fly isn't part of the public
  // API, so we just keep two installed and dispatch arrange() to the active one. Both share the
  // same defaults so the visual comparison is fair.
  const defaults: LayoutOpts = { direction: 'LR', spacing: { node: 60, layer: 120 }, animate: { durationMs: 700 } }
  const dagrePlugin = autoLayoutPlugin({ engine: dagreEngine(), defaults, name: 'autolayout:dagre' })
  const elkPlugin   = autoLayoutPlugin({ engine: elkEngine({ algorithm: 'layered' }), defaults, name: 'autolayout:elk' })
  editor.use(dagrePlugin)
  editor.use(elkPlugin)
  let active: LayoutEngineId = 'elk'

  editor.loadJSON({
    version: 'xenolith.v1',
    nodes: NODES.map((n) => ({ ...n, position: { ...n.position }, state: { ...n.state } })),
    edges: EDGES.map((e) => ({ ...e })),
  })
  editor.fitView({ padding: 56, maxZoom: 1 })

  return {
    plugin: elkPlugin,
    arrange: async (opts) => {
      const p = active === 'elk' ? elkPlugin : dagrePlugin
      await p.arrange(opts)
      editor.fitView({ padding: 56, maxZoom: 1 })
    },
    setEngine: (id) => { active = id },
    getEngine: () => active,
  }
}
