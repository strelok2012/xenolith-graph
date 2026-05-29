// Plugin-driven twin of build-fairqueue.ts. IDENTICAL visuals/topology/UX — the ONLY difference is
// the compute: instead of the native step(), each tick seeds the @xenolith/plugin-runtime VM from
// the live graph and runs the fairqueue RUNTIME GRAPH (generic primitives + Allocate), then writes
// the result back. The native build-fairqueue.ts stays as the reference; this proves the same demo
// runs on the plugin engine. (runtime-graph.test.ts already proves the graph == step() bit-for-bit.)

import type { XenolithEditor, NodeId, Node } from '@xenolith/editor'
import { SetNodeState } from '@xenolith/core'
import { Runtime } from '@xenolith/plugin-runtime'
import { createSim, type Agent, type GoodieSpec } from './fairqueue.js'
import { simToGraph, AGENT_WIDGETS, GOODIE_WIDGETS, STATE_ID } from './sim-to-graph.js'
import { graphToSim, type NodeLike, type EdgeLike } from './graph-to-sim.js'
import { fairqueueStepGraph, FAIRQUEUE_DEFS } from './runtime-graph.js'
import { priorityBar } from './priority-bar.js'
import { warehouseWidget } from './warehouse-widget.js'
import { gini } from './metrics.js'
import type { FairqueueHandle, Metrics } from './build-fairqueue.js'

const TICK_MS = 340
const FLASH_MS = 320
const WAREHOUSE_ID = 'warehouse'

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

export function buildFairqueueRuntime(editor: XenolithEditor): FairqueueHandle {
  const { agents, goodies } = defaultScenario()
  editor.registerWidget('priorityBar', priorityBar)
  editor.registerWidget('warehouse', warehouseWidget)

  editor.registry.register({
    type: 'Agent', title: 'Agent', category: 'agent', description: 'A person in the queue',
    pins: [
      { kind: 'data', direction: 'in', type: 'goodie', multiple: true, label: 'in' },
      { kind: 'data', direction: 'out', type: 'tax', multiple: false, label: 'tax' },
    ],
    widgets: AGENT_WIDGETS,
  })
  editor.registry.register({
    type: 'Goodie', title: 'Goodie', category: 'goodie', description: 'A good that spawns and is claimed',
    pins: [{ kind: 'data', direction: 'out', type: 'goodie', multiple: true, label: 'out' }],
    widgets: GOODIE_WIDGETS,
  })

  editor.loadJSON(simToGraph(createSim(agents, goodies, { taxAlpha: 0.1 })))
  editor.fitView({ padding: 90, maxZoom: 1 })

  editor.setIsValidConnection((c) => {
    const s = editor.graph.getNode(c.source)
    const t = editor.graph.getNode(c.target)
    return !!s && !!t && s.type === 'Goodie' && t.type === 'Agent'
  })

  let goodieCounter = 0
  const offNodeAdded = editor.on('node:added', ({ node }) => {
    if (node.type === 'Agent') {
      editor.setWidgetValue(node.id, 'salary', 0.5)
      editor.setWidgetValue(node.id, 'priority', 0)
      const st = editor.graph.getNode(STATE_ID as NodeId)
      if (st) editor.connect(node as Node, 1, st as Node, 0, { animated: false })
    } else if (node.type === 'Goodie') {
      editor.setWidgetValue(node.id, 'cost', 2)
      editor.setWidgetValue(node.id, 'rate', 0.3)
      editor.commandBus.apply(new SetNodeState(node.id, { gtype: `good-${++goodieCounter}` }))
      const wh = editor.graph.getNode(WAREHOUSE_ID as NodeId)
      if (wh) editor.connect(node as Node, 0, wh as Node, 0, { animated: false })
    }
  })

  let tickCount = 0
  const cumAwards = new Map<string, number>(agents.map((a) => [a.id, 0]))
  const warehouse = new Map<string, number>(goodies.map((g) => [g.type, 0]))
  const acc = new Map<string, number>()

  // The plugin engine: one VM + the fairqueue runtime graph, reused every tick.
  const rt = new Runtime(FAIRQUEUE_DEFS)
  const graph = fairqueueStepGraph()

  const snapshot = (): { nodes: NodeLike[]; edges: EdgeLike[] } => ({
    nodes: [...editor.graph.nodes()].map((n) => ({ id: String(n.id), type: n.type, state: n.state })),
    edges: [...editor.graph.edges()].map((e) => ({ from: { node: String(e.from.node) }, to: { node: String(e.to.node) } })),
  })

  const arrivalsFor = (goodieList: GoodieSpec[]): string[] => {
    const out: string[] = []
    for (const g of goodieList) {
      let a = (acc.get(g.type) ?? 0) + g.rate
      while (a >= 1) { out.push(g.type); a -= 1 }
      acc.set(g.type, a)
    }
    return out
  }

  const flashes = new Map<string, ReturnType<typeof setTimeout>>()
  const flash = (id: string): void => {
    editor.setNodeStatus(id as NodeId, 'ok')
    clearTimeout(flashes.get(id))
    flashes.set(id, setTimeout(() => editor.setNodeStatus(id as NodeId, 'idle'), FLASH_MS))
  }

  const agentPriorities = (): number[] =>
    [...editor.graph.nodes()].filter((n) => n.type === 'Agent').map((n) => Number(n.state['priority'] ?? 0))

  const metricsSubs = new Set<(m: Metrics) => void>()
  const emitMetrics = (running: boolean): void => {
    let stored = 0
    for (const v of warehouse.values()) stored += v
    const p = agentPriorities()
    for (const cb of metricsSubs) {
      cb({ step: tickCount, meanPriority: p.reduce((s, v) => s + v, 0) / (p.length || 1), gini: gini([...cumAwards.values()]), warehouse: stored, running })
    }
  }

  // --- the ONE difference vs the reference: compute via the plugin VM, not native step() ---------
  const tick = (): void => {
    tickCount++
    const { nodes, edges } = snapshot()
    const sim = graphToSim(nodes, edges) // graph → model (agents/goodies/α), same mapping as the reference
    const list = Object.values(sim.goodies)
    rt.setVar('priorities', sim.agents.map((a) => a.priority))
    rt.setVar('salaries', sim.agents.map((a) => a.salary))
    rt.setVar('subs', sim.agents.map((a) => a.subscriptions))
    rt.setVar('costs', Object.fromEntries(list.map((g) => [g.type, g.cost])))
    rt.setVar('arrivals', arrivalsFor(list))
    rt.setVar('alpha', sim.params.taxAlpha)
    rt.tick(graph)

    const newP = rt.getVar('priorities') as number[]
    const awards = (rt.getVar('awards') as { type: string; to: number }[]) ?? []
    const leftovers = (rt.getVar('leftovers') as string[]) ?? []
    sim.agents.forEach((a, i) => editor.setWidgetValue(a.id as NodeId, 'priority', newP[i] ?? a.priority, { ephemeral: true }))
    for (const aw of awards) {
      const id = sim.agents[aw.to]!.id
      cumAwards.set(id, (cumAwards.get(id) ?? 0) + 1)
      flash(id)
    }
    if (leftovers.length > 0) {
      for (const t of leftovers) warehouse.set(t, (warehouse.get(t) ?? 0) + 1)
      editor.setWidgetValue(WAREHOUSE_ID as NodeId, 'stock', Object.fromEntries(warehouse), { ephemeral: true })
    }
    emitMetrics(timer !== null)
  }

  const setAnimated = (animated: boolean): void => {
    for (const e of editor.graph.edges()) editor.setEdgeAnimated(e.id, animated)
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const start = (): void => { if (timer === null) timer = setInterval(tick, TICK_MS) }

  emitMetrics(false)
  start()

  return {
    pause: () => { if (timer !== null) { clearInterval(timer); timer = null; setAnimated(false); emitMetrics(false) } },
    resume: () => { if (timer === null) setAnimated(true); start() },
    stepOnce: () => { if (timer === null) tick() },
    onMetrics: (cb) => { metricsSubs.add(cb); return () => metricsSubs.delete(cb) },
    dispose: () => {
      if (timer !== null) clearInterval(timer)
      timer = null
      for (const t of flashes.values()) clearTimeout(t)
      flashes.clear()
      metricsSubs.clear()
      offNodeAdded()
    },
  }
}
