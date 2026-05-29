// The "assemble the model" view: the WHOLE fairqueue model rendered as a node graph of
// @xenolith/plugin-runtime primitives (+ the Allocate verb). Installs the runtime plugin (primitives
// in the Tab palette, semantic pin colours), loads the runtime graph as renderable nodes, and DRIVES
// THE ON-SCREEN GRAPH: each tick it snapshots editor.graph and runs the VM on it. The model's state
// (priorities, …) lives in VM variables and feeds back through the Set/Get nodes — rewire the graph
// and the simulation changes. Same model proven == native step() (runtime-graph.test.ts).

import type { XenolithEditor, NodeId } from '@xenolith/editor'
import { Runtime, runtimePlugin } from '@xenolith/plugin-runtime'
import { fairqueueComputeGraph, FAIRQUEUE_DEFS } from './runtime-graph.js'
import type { Agent, GoodieSpec } from './fairqueue.js'

const TICK_MS = 340

export interface ComputeMetrics {
  step: number
  meanPriority: number
  warehouse: number
  running: boolean
  /** Live VM variable store — what `Get` reads and `Set` writes (priorities feeds back each tick). */
  vars: { priorities: number[]; lastAwards: number; lastLeftovers: number }
}
export interface ComputeHandle {
  onMetrics(cb: (m: ComputeMetrics) => void): () => void
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

export function buildCompute(editor: XenolithEditor): ComputeHandle {
  const { agents, goodies } = defaultScenario()
  editor.use(runtimePlugin) // primitives → palette + pin-type colours
  editor.loadJSON(fairqueueComputeGraph(agents, goodies)) // static inputs are Const data nodes IN the graph
  // Group the tax factor (Const 1 + α + Subtract) into one collapsed node "1 − α" — a Macro (in-place
  // group, not a reusable template). The VM still runs its members (snapshot flattens the macro), so
  // grouping is purely cosmetic. α rarely changes, so it lives inside the group.
  editor.createMacroFromSelection(['one' as NodeId, 'alpha' as NodeId, 'gain' as NodeId], '1 − α')
  editor.fitView({ padding: 70, maxZoom: 1 })

  const rt = new Runtime(FAIRQUEUE_DEFS)
  // The graph is fully self-sufficient now: the Init flow seeds `priorities`, the Spawn node makes
  // `arrivals`, the Const nodes supply salaries/subs/costs/alpha. The host only runs Init once, then
  // ticks. No host-side seeding of state or arrivals.
  //
  // `graphSnapshot({ expandMacros: true })` is the editor's flat, execution-ready view: collapsed
  // macros are flattened to their members (proxy-pin edges remapped), so the VM runs the group's
  // contents in place and grouping stays purely visual. (Was a hand-rolled flatten — now core.)
  const snapshot = () => editor.graphSnapshot({ expandMacros: true })

  let tickCount = 0
  let warehouse = 0
  const subs = new Set<(m: ComputeMetrics) => void>()
  const emit = (running: boolean): void => {
    const p = (rt.getVar('priorities') as number[] | undefined) ?? []
    const mean = p.length ? p.reduce((s, v) => s + v, 0) / p.length : 0
    const vars = {
      priorities: p.map((v) => Number(Number(v).toFixed(2))),
      lastAwards: ((rt.getVar('awards') as unknown[] | undefined) ?? []).length,
      lastLeftovers: ((rt.getVar('leftovers') as unknown[] | undefined) ?? []).length,
    }
    for (const cb of subs) cb({ step: tickCount, meanPriority: mean, warehouse, running, vars })
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const tick = (): void => {
    tickCount++
    rt.tick(snapshot()) // Spawn produces arrivals in-graph; priorities feeds back via Set/Get
    warehouse += ((rt.getVar('leftovers') as unknown[] | undefined) ?? []).length
    emit(timer !== null)
  }
  const start = (): void => { if (timer === null) timer = setInterval(tick, TICK_MS) }

  rt.tick(snapshot(), 'Init') // construction pass: seed priorities once
  emit(false)
  start()

  return {
    onMetrics: (cb) => { subs.add(cb); return () => subs.delete(cb) },
    pause: () => { if (timer !== null) { clearInterval(timer); timer = null; emit(false) } },
    resume: () => start(),
    dispose: () => { if (timer !== null) clearInterval(timer); timer = null; subs.clear() },
  }
}
