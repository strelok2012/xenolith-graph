// Headless interpreter for a Blueprint-style graph. Editor-agnostic: it consumes plain node/edge
// shapes (which core's Node/Edge satisfy structurally), so it unit-tests without PIXI or the editor.
//
// Pins are addressed BY INDEX (position among same-kind/direction pins), never by id — because the
// editor mints fresh pin ids when instantiating from a schema, so a node dropped from the palette
// has unpredictable ids. Edges still connect by pin id; the evaluator just maps "i-th input" → that
// pin's id → the incident edge.
//
// Execution model (UE K2):
//  • DATA pins pulled lazily — pure subgraphs evaluated on demand (pure = no exec pins).
//  • EXEC pins pushed from a `Tick` node along single exec wires (Branch picks, Sequence fires in
//    order, ForEach runs a body per element then a completed wire).
//  • STATE in `variables`, persisting across ticks — the ONLY cross-tick memory, so the data graph
//    stays acyclic (feedback = read a var early, write it late). No graph cycles needed.

import type { VmValue } from './value.js'

export interface RtPin {
  id: string
  kind: 'exec' | 'data'
  direction: 'in' | 'out'
  type?: string
  default?: unknown
}
export interface RtNode {
  id: string
  type: string
  state?: Record<string, unknown>
  pins: ReadonlyArray<RtPin>
}
export interface RtEdge {
  from: { node: string; pin: string }
  to: { node: string; pin: string }
}
export interface RtGraph {
  nodes: ReadonlyArray<RtNode>
  edges: ReadonlyArray<RtEdge>
}

/** Context for a pure node: read the i-th data input (pulled), widget literals, and variables.
 *  `nodes()` exposes the whole tick's node set so collection primitives (Gather/Scatter) can scan
 *  domain nodes by type — the one capability that reads across the graph, not just wired inputs. */
export interface PureIO {
  node: RtNode
  input(index: number): VmValue | undefined
  /** All values feeding a `multiple` data-in pin, one per connected edge (edge order). Empty if
   *  nothing is wired. This is what makes "subscriptions are wires" / a multi-input Gather work. */
  inputAll(index: number): VmValue[]
  state(key: string): unknown
  getVar(name: string): VmValue | undefined
  nodes(): readonly RtNode[]
}
/** Context for an impure (exec) node: pure's reads plus write state, publish the i-th data output,
 *  and continue control flow along the i-th exec out-pin. */
export interface ExecIO extends PureIO {
  setVar(name: string, value: VmValue): void
  setOutput(index: number, value: VmValue): void
  flow(execOutIndex: number): void
}

export interface NodeDef {
  type: string
  pure?: boolean
  /** Pure node: return a value per data-out index. */
  evalPure?(io: PureIO): Array<VmValue | undefined>
  /** Impure node: perform effects and drive exec flow via `io.flow(...)`. */
  run?(io: ExecIO): void
}

const MAX_PULL_DEPTH = 100_000

const dataIns = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'in')
const dataOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'out')
const execOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'exec' && p.direction === 'out')

export class Runtime {
  readonly #defs: Map<string, NodeDef>
  readonly #vars = new Map<string, VmValue>()
  #currentNodes: readonly RtNode[] = [] // the node set for the in-flight tick (for io.nodes())

  constructor(defs: ReadonlyArray<NodeDef>) {
    this.#defs = new Map(defs.map((d) => [d.type, d]))
  }

  getVar(name: string): VmValue | undefined { return this.#vars.get(name) }
  setVar(name: string, value: VmValue): void { this.#vars.set(name, value) }
  get variables(): ReadonlyMap<string, VmValue> { return this.#vars }

  /** Run one step: fire every entry node of `entryType` (default `Tick`) and walk the exec graph.
   *  Variables persist; per-tick output overrides are fresh. Use `entryType: 'Init'` once at start
   *  to run a construction flow that seeds variables. */
  tick(graph: RtGraph, entryType = 'Tick'): void {
    this.#currentNodes = graph.nodes
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))
    const incoming = new Map<string, { node: string; pin: string }>()
    const incomingAll = new Map<string, { node: string; pin: string }[]>() // pin -> every source (multiple)
    const execTarget = new Map<string, string>() // `${node}:${outPinId}` -> target node id
    for (const e of graph.edges) {
      const key = `${e.to.node}:${e.to.pin}`
      if (!incoming.has(key)) incoming.set(key, e.from)
      ;(incomingAll.get(key) ?? incomingAll.set(key, []).get(key)!).push(e.from)
      execTarget.set(`${e.from.node}:${e.from.pin}`, e.to.node)
    }
    const overrides = new Map<string, VmValue>() // `${node}:${dataOutIndex}` -> latched value

    // Pull the value on a node's data-out (by output index): a latched override, else evaluate it.
    const pullOut = (nodeId: string, outIndex: number, depth: number): VmValue | undefined => {
      if (overrides.has(`${nodeId}:${outIndex}`)) return overrides.get(`${nodeId}:${outIndex}`)
      if (depth > MAX_PULL_DEPTH) throw new Error('Runtime: pure-pull depth exceeded (cycle?)')
      const node = nodeById.get(nodeId)
      if (!node) return undefined
      const def = this.#defs.get(node.type)
      if (def?.evalPure) return def.evalPure(this.#pureIO(node, resolveInput, resolveInputAll, depth + 1))[outIndex]
      // Source nodes without an evaluator (e.g. domain `Agent`/`Goodie`) expose their own `state`
      // record on every data-out pin — lets a wire from `Agent.self` carry the agent's record.
      if (!def && node.state) return node.state as VmValue
      return undefined
    }
    const pullSrc = (src: { node: string; pin: string }, depth: number): VmValue | undefined => {
      const srcNode = nodeById.get(src.node)
      if (!srcNode) return undefined
      const outIndex = dataOuts(srcNode).findIndex((p) => p.id === src.pin)
      return outIndex >= 0 ? pullOut(src.node, outIndex, depth) : undefined
    }
    const resolveInput = (node: RtNode, index: number, depth: number): VmValue | undefined => {
      const pin = dataIns(node)[index]
      if (!pin) return undefined
      const src = incoming.get(`${node.id}:${pin.id}`)
      return src ? pullSrc(src, depth) : (pin.default as VmValue | undefined)
    }
    const resolveInputAll = (node: RtNode, index: number, depth: number): VmValue[] => {
      const pin = dataIns(node)[index]
      if (!pin) return []
      const srcs = incomingAll.get(`${node.id}:${pin.id}`) ?? []
      return srcs.map((s) => pullSrc(s, depth)).filter((v): v is VmValue => v !== undefined)
    }
    const runExec = (nodeId: string): void => {
      const node = nodeById.get(nodeId)
      const def = node && this.#defs.get(node.type)
      if (!node || !def?.run) return
      def.run({
        ...this.#pureIO(node, resolveInput, resolveInputAll, 0),
        setVar: (name, value) => this.#vars.set(name, value),
        setOutput: (index, value) => overrides.set(`${node.id}:${index}`, value),
        flow: (execOutIndex) => {
          const pin = execOuts(node)[execOutIndex]
          const target = pin && execTarget.get(`${node.id}:${pin.id}`)
          if (target) runExec(target)
        },
      })
    }

    for (const node of graph.nodes) if (node.type === entryType) runExec(node.id)
  }

  #pureIO(
    node: RtNode,
    resolveInput: (node: RtNode, index: number, depth: number) => VmValue | undefined,
    resolveInputAll: (node: RtNode, index: number, depth: number) => VmValue[],
    depth: number,
  ): PureIO {
    return {
      node,
      input: (index) => resolveInput(node, index, depth),
      inputAll: (index) => resolveInputAll(node, index, depth),
      state: (key) => node.state?.[key],
      getVar: (name) => this.#vars.get(name),
      nodes: () => this.#currentNodes,
    }
  }
}
