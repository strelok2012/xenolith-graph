// dagre is an OPTIONAL peer dep. We import the runtime lazily so users who never reach for the
// dagre adapter don't pay the install cost, and we provide a clear error if it's missing.
import type { LayoutEngine, LayoutOpts } from '../engine.js'

interface DagreModule {
  graphlib: { Graph: new () => DagreGraph }
  layout: (g: DagreGraph) => void
}
interface DagreGraph {
  setGraph: (opts: Record<string, unknown>) => DagreGraph
  setDefaultEdgeLabel: (fn: () => Record<string, unknown>) => DagreGraph
  setNode: (id: string, opts: { width: number; height: number }) => void
  setEdge: (from: string, to: string) => void
  node: (id: string) => { x: number; y: number; width: number; height: number }
}

let _dagre: DagreModule | undefined
async function loadDagre(): Promise<DagreModule> {
  if (_dagre) return _dagre
  try {
    const mod = await import('dagre' as string)
    _dagre = (mod.default ?? mod) as DagreModule
    return _dagre
  } catch {
    throw new Error('@xenolith/plugin-autolayout/dagre: peer dependency `dagre` is not installed. Run `pnpm add dagre`.')
  }
}

function mapDirection(d: LayoutOpts['direction']): 'LR' | 'RL' | 'TB' | 'BT' {
  return d ?? 'LR'
}

/** Dagre adapter — fast, ~30 kB gzipped, single algorithm (Sugiyama layered). Good default for
 *  DAG-shaped graphs (ComfyUI, LLM flow, blueprint, DSP). Ignores port hints and hierarchy. */
export interface DagreEngineOpts {
  /** Overrides applied to the dagre `setGraph()` call. See dagre docs for the full token list. */
  graphOverrides?: Record<string, unknown>
}

export function dagreEngine(opts: DagreEngineOpts = {}): LayoutEngine {
  return {
    name: 'dagre',
    async layout(g, layoutOpts) {
      const dagre = await loadDagre()
      const dg = new dagre.graphlib.Graph()
      dg.setGraph({
        rankdir:  mapDirection(layoutOpts.direction),
        nodesep:  layoutOpts.spacing?.node  ?? 50,
        ranksep:  layoutOpts.spacing?.layer ?? 80,
        edgesep:  layoutOpts.spacing?.edge  ?? 20,
        align:    layoutOpts.align,
        marginx:  0,
        marginy:  0,
        ...opts.graphOverrides,
      })
      dg.setDefaultEdgeLabel(() => ({}))
      for (const n of g.nodes) dg.setNode(n.id, { width: n.width, height: n.height })
      for (const e of g.edges) dg.setEdge(e.from.node, e.to.node)
      dagre.layout(dg)
      // dagre returns the CENTRE of each node; we want top-left to feed MoveNode.
      const positions = new Map<string, { x: number; y: number }>()
      for (const n of g.nodes) {
        const placed = dg.node(n.id)
        if (!placed) continue
        positions.set(n.id, {
          x: placed.x - n.width / 2,
          y: placed.y - n.height / 2,
        })
      }
      return { positions }
    },
  }
}
