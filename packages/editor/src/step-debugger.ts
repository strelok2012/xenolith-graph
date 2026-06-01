import type { NodeId, Node, Edge, Graph } from '@xenolith/core'
import { topoOrder } from '@xenolith/core'

/** Per-node executor: receives the node + a map of inputs (pinId → upstream value),
 *  returns a map of outputs (pinId → produced value). Sync or async. Throw to mark
 *  the step as failed; the debugger transitions to 'error' and surfaces the message.
 *  `peek(nodeId)` returns prior outputs of any already-executed node, so a Macro step
 *  can surface its members' results without re-running them. */
export type StepExecutor = (ctx: {
  node: Node
  inputs: Map<string, unknown>
  peek: (nodeId: NodeId) => Map<string, unknown> | undefined
}) => Map<string, unknown> | Promise<Map<string, unknown>>

export interface StepRecord {
  nodeId: NodeId
  type: string
  inputs: Map<string, unknown>
  outputs: Map<string, unknown>
  durationMs: number
}

export type StepDebuggerStatus = 'idle' | 'paused' | 'running' | 'finished' | 'error'

export interface StepDebuggerEvents {
  /** Fires right BEFORE a node executes, after the debugger has paused on it (breakpoint
   *  hit, or a `step()` settled). Use this to update inspector panels. */
  paused: (info: { nodeId: NodeId; node: Node; inputs: Map<string, unknown> }) => void
  /** Fires right AFTER a node executes successfully. Use this to log outputs / draw a row. */
  stepped: (record: StepRecord) => void
  /** Fires when the run reaches the end of the graph (no node left to step into). */
  finished: (history: StepRecord[]) => void
  /** Fires when the executor throws. The debugger transitions to 'error' and stops. */
  error: (info: { nodeId: NodeId; message: string }) => void
}

type EventName = keyof StepDebuggerEvents

/** A pure, framework-agnostic single-step graph runner. Walks `topoOrder(graph)` one node at a
 *  time, calling the host-supplied executor and yielding back to the UI between steps so the
 *  user can inspect / breakpoint. Does NOT touch PIXI — visual highlighting is the renderer's
 *  job; subscribe to events and call `editor.setNodeStatus(...)` from there. */
export class StepDebugger {
  #graph: { graph: Graph } | Graph
  #executor: StepExecutor
  #status: StepDebuggerStatus = 'idle'
  #order: NodeId[] = []
  #cursor = 0
  #values = new Map<NodeId, Map<string, unknown>>() // node → its produced outputs
  #breakpoints = new Set<NodeId>()
  #history: StepRecord[] = []
  // Set when continue() paused us ON a breakpoint. The NEXT continue() ignores the breakpoint
  // for this single node so we don't re-pause forever in place. Cleared after one resume.
  #skipBreakpointOnce: NodeId | null = null
  #handlers: { [K in EventName]: Set<StepDebuggerEvents[K]> } = {
    paused: new Set(), stepped: new Set(), finished: new Set(), error: new Set(),
  }

  constructor(graphOrEditor: { graph: Graph } | Graph, executor: StepExecutor) {
    this.#graph = graphOrEditor
    this.#executor = executor
  }

  get status(): StepDebuggerStatus { return this.#status }
  get currentNodeId(): NodeId | null { return this.#cursor < this.#order.length ? this.#order[this.#cursor]! : null }
  get history(): readonly StepRecord[] { return this.#history }
  get breakpoints(): ReadonlySet<NodeId> { return this.#breakpoints }
  get order(): readonly NodeId[] { return this.#order }

  on<K extends EventName>(event: K, handler: StepDebuggerEvents[K]): () => void {
    this.#handlers[event].add(handler)
    return () => { this.#handlers[event].delete(handler) }
  }

  #emit<K extends EventName>(event: K, ...args: Parameters<StepDebuggerEvents[K]>): void {
    for (const h of this.#handlers[event]) (h as (...a: unknown[]) => void)(...args)
  }

  setBreakpoint(id: NodeId): void { this.#breakpoints.add(id) }
  clearBreakpoint(id: NodeId): void { this.#breakpoints.delete(id) }
  toggleBreakpoint(id: NodeId): boolean {
    if (this.#breakpoints.has(id)) { this.#breakpoints.delete(id); return false }
    this.#breakpoints.add(id); return true
  }

  /** Reset internal state and recompute topological order from the current graph. Pauses on the
   *  first node (after firing `paused`). The first `step()` / `continue()` actually executes it.
   *
   *  Macros are first-class:
   *    - COLLAPSED: external edges go to proxy pins on the macro → topoOrder naturally places
   *      it between upstream and downstream. Members are hidden from the trace (the macro IS
   *      the unit; executor decides what running it means — usually "walk my internals").
   *    - EXPANDED: external edges go to members directly. Members are the units in the trace;
   *      the macro itself is just a visual frame — it has no edges, no data flow, no IO, so
   *      adding it as a step would mean a "pause on nothing". We skip it.
   *  Templates are always opaque (definitions live outside `graph`) — no special handling. */
  async start(): Promise<void> {
    this.#reset()
    const g = this.#g()
    const all = [...g.nodes()] as Node[]
    const skip = new Set<string>()
    for (const n of all) {
      if (n.type !== 'Macro') continue
      const state = (n.state ?? {}) as { collapsed?: boolean; members?: NodeId[] }
      const members = (state.members ?? []) as NodeId[]
      if (state.collapsed) {
        // Collapsed: members hidden, macro is the step (already wired between upstream/downstream).
        for (const m of members) skip.add(String(m))
      } else {
        // Expanded: macro is just a frame; members are the steps.
        skip.add(String(n.id))
      }
    }
    const { order } = topoOrder(g)
    this.#order = order.filter((id) => !skip.has(String(id)))
    this.#cursor = 0
    this.#status = 'paused'
    this.#firePaused()
  }

  /** Execute exactly the current node, advance, and pause on the next (firing `paused`).
   *  At the end fires `finished` and transitions to 'finished'. No-op if not paused. */
  async step(): Promise<StepRecord | null> {
    if (this.#status !== 'paused') return null
    const cur = this.currentNodeId
    if (cur === null) { this.#finish(); return null }
    this.#status = 'running'
    const record = await this.#executeCurrent()
    if ((this.#status as StepDebuggerStatus) === 'error') { return record }
    this.#cursor++
    if (this.#cursor >= this.#order.length) { this.#finish(); return record }
    this.#status = 'paused'
    this.#firePaused()
    return record
  }

  /** Run nodes until a breakpoint is hit or the end. Pauses BEFORE the breakpointed node
   *  so the user can inspect its inputs before it executes. */
  async continue(): Promise<void> {
    if (this.#status !== 'paused') return
    this.#status = 'running'
    while (this.#cursor < this.#order.length) {
      const id = this.#order[this.#cursor]!
      // Pause on a breakpoint BEFORE executing the node — unless we just resumed off this
      // same breakpoint, in which case execute it once and move on.
      if (this.#breakpoints.has(id) && this.#skipBreakpointOnce !== id) {
        this.#status = 'paused'
        this.#skipBreakpointOnce = id
        this.#firePaused()
        return
      }
      this.#skipBreakpointOnce = null
      await this.#executeCurrent()
      if ((this.#status as StepDebuggerStatus) === 'error') return
      this.#cursor++
    }
    this.#finish()
  }

  /** Stop the run and reset to idle. Clears highlights via the next subscriber's reaction
   *  to status — keep state minimal here. */
  stop(): void {
    this.#reset()
    this.#status = 'idle'
  }

  /** Move the cursor forward WITHOUT executing the current node. Use this after `start()` to
   *  fast-forward past nodes that were already executed in a prior session (e.g. after a macro
   *  expand/collapse toggle mid-debug that rebuilt the order). Re-pauses on the next node
   *  (firing `paused`) or transitions to `finished` if the order is exhausted. */
  advance(): void {
    if (this.#status !== 'paused') return
    this.#cursor++
    if (this.#cursor >= this.#order.length) { this.#finish(); return }
    this.#firePaused()
  }

  // — internals —

  #g(): Graph {
    return (this.#graph as { graph: Graph }).graph ?? (this.#graph as Graph)
  }

  #reset(): void {
    this.#order = []
    this.#cursor = 0
    this.#values.clear()
    this.#history = []
    this.#skipBreakpointOnce = null
  }

  #firePaused(): void {
    const id = this.currentNodeId
    if (id === null) return
    const node = this.#g().getNode(id)
    if (!node) return
    this.#emit('paused', { nodeId: id, node: node as Node, inputs: this.#collectInputs(id) })
  }

  #finish(): void {
    this.#status = 'finished'
    this.#emit('finished', this.#history.slice())
  }

  async #executeCurrent(): Promise<StepRecord | null> {
    const id = this.currentNodeId
    if (id === null) return null
    const g = this.#g()
    const node = g.getNode(id)
    if (!node) return null
    const inputs = this.#collectInputs(id)
    const t0 = nowMs()
    let outputs: Map<string, unknown>
    try {
      const out = await this.#executor({
        node: node as Node,
        inputs,
        peek: (nodeId) => this.#values.get(nodeId),
      })
      outputs = out instanceof Map ? out : new Map(Object.entries(out as Record<string, unknown>))
    } catch (err) {
      this.#status = 'error'
      this.#emit('error', { nodeId: id, message: err instanceof Error ? err.message : String(err) })
      return null
    }
    const durationMs = nowMs() - t0
    this.#values.set(id, outputs)
    const record: StepRecord = { nodeId: id, type: (node as Node).type, inputs, outputs, durationMs }
    this.#history.push(record)
    this.#emit('stepped', record)
    return record
  }

  /** For each input pin of `id`, walk every incoming edge to its source node, and (if that
   *  source has produced an output for that pin) record it. Disconnected pins are absent
   *  from the result map — host can show "—" in the inspector. */
  #collectInputs(id: NodeId): Map<string, unknown> {
    const g = this.#g()
    const out = new Map<string, unknown>()
    for (const e of g.edges()) {
      const edge = e as Edge
      if (edge.to.node !== id) continue
      const sourceOutputs = this.#values.get(edge.from.node)
      if (!sourceOutputs) continue
      const value = sourceOutputs.get(String(edge.from.pin))
      if (value !== undefined) out.set(String(edge.to.pin), value)
    }
    return out
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
