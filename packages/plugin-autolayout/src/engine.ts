/** The contract every layout backend (dagre / elkjs / WebCola / custom) must implement. Pure: a
 *  function from the structural sub-graph the plugin extracts to a per-node position map. The
 *  plugin handles everything else — pulling the snapshot, applying positions through MoveNode in
 *  one transaction, undo, events. Adapters live next door (`/dagre`, `/elk`) and are ~50 lines each.
 *  Swap engine without touching the plugin or the editor. */
export interface LayoutEngine {
  /** Human-readable backend tag, e.g. `'dagre'`, `'elk:layered'`. Surfaced in logs / UI. */
  readonly name: string
  /** Compute final positions for every node in `graph`. Async because some engines (ELK) are
   *  worker-backed. May honour `opts.signal` to bail out on cancellation. */
  layout(graph: LayoutGraph, opts: LayoutOpts): Promise<LayoutResult>
}

/** Engine-neutral structural view of the graph. Coordinates intentionally absent — that's the
 *  engine's job. Per-node `parent` lets nested layouts (macros, comments) inform engines that
 *  understand hierarchy (ELK); engines that don't (dagre) just ignore it. */
export interface LayoutGraph {
  nodes: ReadonlyArray<LayoutNode>
  edges: ReadonlyArray<LayoutEdge>
}

export interface LayoutNode {
  id: string
  width: number
  height: number
  /** Containment for hierarchical engines. Omit for flat layout. */
  parent?: string
  /** Optional port hints — engines that route per-port (ELK) use them; dagre ignores. */
  ports?: ReadonlyArray<{ id: string; side: 'in' | 'out' }>
}

export interface LayoutEdge {
  id: string
  from: { node: string; port?: string }
  to: { node: string; port?: string }
}

export interface LayoutAnimateOpts {
  /** Total animation duration in milliseconds. Skip / set to 0 for an instant move. */
  durationMs?: number
  /** Easing function `t ∈ [0,1] → eased ∈ [0,1]`. Default: cubic ease-in-out. */
  easing?: (t: number) => number
}

export interface LayoutOpts {
  /** Flow direction. Default `'LR'` (left-to-right) — matches DAG editors. */
  direction?: 'LR' | 'RL' | 'TB' | 'BT'
  spacing?: {
    /** Min gap between sibling nodes (same layer / branch). Default 50. */
    node?: number
    /** Min gap between layers / rows. Default 80. */
    layer?: number
    /** Min gap between routed edges (engines that route). Default 20. */
    edge?: number
  }
  /** Alignment within a layer for engines that support it (dagre). */
  align?: 'UL' | 'UR' | 'DL' | 'DR' | 'center'
  /** Cancel a long-running layout (ELK on big nested graphs can take seconds). */
  signal?: AbortSignal
  /** When set, tween from current positions to the target over `durationMs` instead of snapping.
   *  Each per-frame step is committed ephemerally (no undo entry per frame); only the FINAL
   *  positions land as one MoveNode-per-node transaction (still ONE undo for the whole arrange).
   *  Rete `TransitionApplier` parity. */
  animate?: LayoutAnimateOpts
}

export interface LayoutResult {
  /** Top-left position per node id. The plugin translates these into MoveNode commands. */
  positions: ReadonlyMap<string, { x: number; y: number }>
}
