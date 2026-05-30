// The MERGED view (`?engine=merged`): the two demos become one. Agents and Goodies are generic
// `Struct` instances (no bespoke node types). The compute graph is fully wire-driven:
//   - `Goodie.self → Gather Goodies`              feeds the algorithm with goodie records
//   - `Agent.self  → Gather Agents`               feeds the algorithm with agent records
//   - `Goodie.self → Agent.subscribe` (multi)     IS each agent's subscription set
//   - `Scatter.oN  → Agent.priority`              IS the per-agent priority feedback
// Host plumbing left over today:
//   - Mirror `subscribe` wires into `data.subs` (a domain alias the algorithm/widget reads as the
//     subscriptions list). Driven by `edge:connected/disconnected`. Will go when subscriptions are
//     consumed directly via the multi-pin.
//   - Read `leftovers` VM var into the warehouse counter (until the warehouse becomes a node).

import type { XenolithEditor } from '@xenolith/editor'
import { Runtime, runtimePlugin, attachRuntimeBridge } from '@xenolith/plugin-runtime'
import { fairqueueMergedGraph, MERGED_DEFS } from './runtime-graph.js'
import { subscriptionsFromWires, type SubEdge } from './subscriptions.js'
import type { Agent, GoodieSpec } from './fairqueue.js'

const TICK_MS = 340

export interface MergedMetrics {
  step: number
  meanPriority: number
  warehouse: number
  running: boolean
}
export interface MergedHandle {
  onMetrics(cb: (m: MergedMetrics) => void): () => void
  pause(): void
  resume(): void
  dispose(): void
}

function defaultScenario(): { agents: Agent[]; goodies: GoodieSpec[] } {
  const goodies: GoodieSpec[] = [
    { type: 'gift', cost: 2, rate: 0.4 },
    { type: 'coin', cost: 1.5, rate: 0.6 },
    { type: 'star', cost: 4, rate: 0.2 },
  ]
  const def: Record<string, { salary: number; subs: string[] }> = {
    Ada: { salary: 0.5, subs: ['gift', 'coin'] },
    Boris: { salary: 0.4, subs: ['coin'] },
    Cleo: { salary: 0.6, subs: ['gift', 'star'] },
    Dmitri: { salary: 0.5, subs: ['coin', 'star'] },
    Esra: { salary: 0.55, subs: ['gift', 'coin', 'star'] },
    Finn: { salary: 0.45, subs: ['star'] },
  }
  const agents: Agent[] = Object.entries(def).map(([id, { salary, subs }]) => ({ id, priority: 0, salary, subscriptions: subs }))
  return { agents, goodies }
}

// Pick out the agent / goodie Struct nodes. All merged-graph nodes are generic Structs; `state.kind`
// is the discriminator the host uses (NOT `render.category` — `render` lives in a separate map on
// the editor, not on Node, so it's invisible to host code that reads `editor.graph.nodes()`).
export const isAgentStruct = (n: { type: string; state: Record<string, unknown> }): boolean =>
  n.type === 'Struct' && n.state['kind'] === 'agent'
export const isGoodieStruct = (n: { type: string; state: Record<string, unknown> }): boolean =>
  n.type === 'Struct' && n.state['kind'] === 'goodie'

export function buildMerged(editor: XenolithEditor): MergedHandle {
  const { agents, goodies } = defaultScenario()
  editor.use(runtimePlugin) // primitives (incl. Struct) + pin types + struct/output widgets
  // Domain pin types: `agent` (whole agent record), `goodie-rec` (whole goodie record) — distinct
  // colours so wires read at a glance even though both records are Structs underneath.
  editor.types.register({ id: 'agent', color: '#7C5CFF', shape: 'circle' })
  editor.types.register({ id: 'goodie-rec', color: '#FFB020', shape: 'circle' })

  editor.loadJSON(fairqueueMergedGraph(agents, goodies))
  editor.fitView({ padding: 80, maxZoom: 0.9 })

  // Wires ARE the subscriptions: re-derive every agent's `state.subs` from the current edge set
  // whenever a wire is added or removed. Ephemeral writes (no undo spam — the wires themselves are
  // the undoable record of intent). Goodie type lives in each Goodie Struct's `state.type`.
  // NOTE: bypasses setWidgetValue because `subs` is not user-editable here (no widget bound to it);
  // we mutate state directly so Struct V3's fallback reads it on the next tick.
  const rebuildSubs = (): void => {
    const all = [...editor.graph.nodes()]
    const agentIds = all.filter(isAgentStruct).map((n) => String(n.id))
    const goodieTypeByNodeId = new Map<string, string>()
    for (const g of all.filter(isGoodieStruct)) {
      const t = g.state['type']
      if (typeof t === 'string') goodieTypeByNodeId.set(String(g.id), t)
    }
    const edges: SubEdge[] = [...editor.graph.edges()].map((edge) => ({
      from: { node: String(edge.from.node), pin: String(edge.from.pin) },
      to:   { node: String(edge.to.node),   pin: String(edge.to.pin)   },
    }))
    const perAgent = subscriptionsFromWires(agentIds, edges, goodieTypeByNodeId)
    for (const a of all.filter(isAgentStruct)) {
      const next = perAgent.get(String(a.id)) ?? []
      const old  = Array.isArray(a.state['subs']) ? (a.state['subs'] as string[]) : []
      if (old.length === next.length && old.every((v, i) => v === next[i])) continue
      // Use setWidgetValue (not direct state mutation) so the bound `field:subs` widget re-renders
      // with the new value. Ephemeral = no undo (the subscribe wires themselves are the undoable
      // record of intent).
      editor.setWidgetValue(a.id, 'field:subs', next, { ephemeral: true })
    }
  }
  const offConn = editor.on('edge:connected',    rebuildSubs)
  const offDisc = editor.on('edge:disconnected', rebuildSubs)

  const rt = new Runtime(MERGED_DEFS)
  // Auto-mirror Output VM vars → widget state on every tick. One line, no per-host loop.
  const offBridge = attachRuntimeBridge(editor, rt)

  let tickCount = 0
  const subs = new Set<(m: MergedMetrics) => void>()
  // Panel reads the SAME VM vars that the Output widgets read — single source of truth, can't
  // drift apart. Mean = `output:meanOut` (set by Mean → Output chain in the graph); warehouse =
  // `warehouse` variable (set by the Length+Add+SetVar accumulator in the graph). No host math.
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
  const emit = (running: boolean): void => {
    const mean      = num(rt.getVar('output:meanOut'))
    const warehouse = num(rt.getVar('warehouse'))
    for (const cb of subs) cb({ step: tickCount, meanPriority: mean, warehouse, running })
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const tick = (): void => {
    tickCount++
    rt.tick(editor.graphSnapshot({ expandMacros: true, expandTemplates: true }))
    // All aggregates live in VM vars now (Mean Output, warehouse accumulator). Output widget mirror
    // happens via attachRuntimeBridge. No host arithmetic.
    emit(timer !== null)
  }
  const start = (): void => { if (timer === null) timer = setInterval(tick, TICK_MS) }

  emit(false)
  start()

  return {
    onMetrics: (cb) => { subs.add(cb); return () => subs.delete(cb) },
    pause: () => { if (timer !== null) { clearInterval(timer); timer = null; emit(false) } },
    resume: () => start(),
    dispose: () => {
      if (timer !== null) clearInterval(timer)
      timer = null
      subs.clear()
      offConn(); offDisc(); offBridge()
    },
  }
}
