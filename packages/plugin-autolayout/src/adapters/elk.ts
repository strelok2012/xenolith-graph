// elkjs is an OPTIONAL peer dep — lazy-loaded so users who never reach for ELK don't pay the
// ~465 kB gzipped install or runtime cost. Where it earns its weight vs dagre: NESTED layout
// (LayoutNode.parent → ELK children), orthogonal edge routing, 9 algorithms (layered/mrtree/
// stress/force/radial/disco/...). Same `LayoutEngine` contract as dagre — the plugin doesn't
// know or care which is wired in.
import type { LayoutEngine, LayoutGraph, LayoutNode, LayoutOpts, LayoutResult } from '../engine.js'

interface ElkNode {
  id: string
  width?: number
  height?: number
  x?: number
  y?: number
  children?: ElkNode[]
  edges?: ElkEdge[]
  layoutOptions?: Record<string, string>
}
interface ElkEdge { id: string; sources: string[]; targets: string[] }
interface ElkLib { layout(g: ElkNode, opts?: { layoutOptions?: Record<string, string> }): Promise<ElkNode> }
interface ElkCtor { new (opts?: { defaultLayoutOptions?: Record<string, string> }): ElkLib }

let _ElkCtor: ElkCtor | undefined
async function loadElk(): Promise<ElkCtor> {
  if (_ElkCtor) return _ElkCtor
  try {
    const mod = await import('elkjs/lib/elk.bundled.js' as string)
    _ElkCtor = ((mod as { default?: ElkCtor }).default ?? (mod as unknown as ElkCtor))
    return _ElkCtor!
  } catch {
    throw new Error('@xenolith/plugin-autolayout/elk: peer dependency `elkjs` is not installed. Run `pnpm add elkjs`.')
  }
}

function mapDirection(d: LayoutOpts['direction']): string {
  switch (d ?? 'LR') {
    case 'LR': return 'RIGHT'
    case 'RL': return 'LEFT'
    case 'TB': return 'DOWN'
    case 'BT': return 'UP'
  }
}

export interface ElkEngineOpts {
  /** ELK algorithm. Default `'layered'` (Sugiyama — what dagre does, plus orthogonal routing).
   *  Others: `'mrtree'`, `'stress'`, `'force'`, `'radial'`, `'disco'`, `'sporeOverlap'`,
   *  `'sporeCompaction'`, `'rectpacking'`. See https://eclipse.dev/elk/reference/algorithms.html. */
  algorithm?: 'layered' | 'mrtree' | 'stress' | 'force' | 'radial' | 'disco'
  /** Merge these into ELK's `layoutOptions` after our defaults — last write wins.
   *  Example: `{ 'elk.layered.spacing.edgeNodeBetweenLayers': '40' }`. */
  layoutOverrides?: Record<string, string>
}

export function elkEngine(opts: ElkEngineOpts = {}): LayoutEngine {
  const algorithm = opts.algorithm ?? 'layered'
  return {
    name: `elk:${algorithm}`,
    async layout(g, layoutOpts): Promise<LayoutResult> {
      const Elk = await loadElk()
      const elk = new Elk()
      const layoutOptions: Record<string, string> = {
        'elk.algorithm': algorithm,
        'elk.direction': mapDirection(layoutOpts.direction),
        'elk.spacing.nodeNode': String(layoutOpts.spacing?.node  ?? 50),
        'elk.layered.spacing.nodeNodeBetweenLayers': String(layoutOpts.spacing?.layer ?? 80),
        'elk.spacing.edgeNode': String(layoutOpts.spacing?.edge  ?? 20),
        'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        ...(opts.layoutOverrides ?? {}),
      }
      // Build nested ELK tree from flat (id, parent?) list. Roots: nodes without a parent we know
      // about; children: bucket by their parent id. Each ElkNode declares only its OWN width/height
      // — ELK computes parent sizes from contained children.
      const byId = new Map<string, LayoutNode>(g.nodes.map((n) => [n.id, n]))
      const childrenOf = new Map<string, LayoutNode[]>()
      const roots: LayoutNode[] = []
      for (const n of g.nodes) {
        const parent = n.parent && byId.has(n.parent) ? n.parent : undefined
        if (parent) { (childrenOf.get(parent) ?? (childrenOf.set(parent, []), childrenOf.get(parent)!)).push(n) }
        else roots.push(n)
      }
      const toElk = (n: LayoutNode): ElkNode => {
        const kids = childrenOf.get(n.id) ?? []
        return {
          id: n.id,
          width:  n.width,
          height: n.height,
          ...(kids.length > 0 ? { children: kids.map(toElk) } : {}),
        }
      }
      const root: ElkNode = {
        id: '$root',
        children: roots.map(toElk),
        edges: g.edges.map((e) => ({ id: e.id, sources: [e.from.node], targets: [e.to.node] })),
        layoutOptions,
      }
      const laid = await elk.layout(root)
      // Walk the laid-out tree and flatten ABSOLUTE positions. ELK reports each node's position
      // relative to its parent, so accumulate offsets while descending. (top-left convention,
      // matches dagre's normalised output — `MoveNode` consumes top-left.)
      const positions = new Map<string, { x: number; y: number }>()
      const walk = (n: ElkNode, ox: number, oy: number): void => {
        const ax = ox + (n.x ?? 0)
        const ay = oy + (n.y ?? 0)
        if (n.id !== '$root') positions.set(n.id, { x: ax, y: ay })
        for (const c of n.children ?? []) walk(c, ax, ay)
      }
      walk(laid, 0, 0)
      return { positions }
    },
  }
}
