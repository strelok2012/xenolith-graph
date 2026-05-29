// Framework-agnostic builder (the buildAudioSynth pattern). The editor graph is the source of truth
// for topology: each tick we derive a SimState from the live nodes/edges (graphToSim), step it, and
// write the new priorities back into the nodes. So connecting a Goodie→Agent wire subscribes that
// agent, disconnecting it unsubscribes; per-agent salary and per-goodie cost/rate are the in-node
// widgets the editor already persists in node.state. Goodies whose node has no subscriber pile up in
// the Warehouse. Everything rides the public API — no core changes.

import type { XenolithEditor, NodeId, Node } from '@xenolith/editor'
import { SetNodeState, type Unsubscribe } from '@xenolith/core'
import { createSim, step, type Agent, type GoodieSpec } from './fairqueue.js'
import { simToGraph, AGENT_WIDGETS, GOODIE_WIDGETS, STATE_ID } from './sim-to-graph.js'
import { graphToSim, type NodeLike, type EdgeLike } from './graph-to-sim.js'
import { priorityBar } from './priority-bar.js'
import { warehouseWidget } from './warehouse-widget.js'
import { gini } from './metrics.js'

export interface Metrics {
  step: number
  meanPriority: number
  gini: number // of cumulative goodies received — fairness of the distribution so far
  warehouse: number // total unclaimed goodies stored
  running: boolean
}

export interface FairqueueHandle {
  pause(): void
  resume(): void
  stepOnce(): void
  onMetrics(cb: (m: Metrics) => void): Unsubscribe
  dispose(): void
}

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
  const agents: Agent[] = Object.entries(def).map(([id, { salary, subs }]) => ({
    id,
    priority: 0,
    salary,
    subscriptions: subs,
  }))
  return { agents, goodies }
}

export function buildFairqueue(editor: XenolithEditor): FairqueueHandle {
  const { agents, goodies } = defaultScenario()
  editor.registerWidget('priorityBar', priorityBar)
  editor.registerWidget('warehouse', warehouseWidget)

  // Insert palette (Tab): register the two node kinds so users can grow the graph. New nodes carry
  // the same in-node widgets graphToSim reads, so a freshly-added + wired node is consumed next tick.
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

  // Subscriptions are edges, but only Goodie(out) → Agent(in) ones make sense.
  editor.setIsValidConnection((c) => {
    const s = editor.graph.getNode(c.source)
    const t = editor.graph.getNode(c.target)
    return !!s && !!t && s.type === 'Goodie' && t.type === 'Agent'
  })

  // Palette-inserted nodes seed their slider/number widgets to the min (0) — useless for the sim.
  // node:added fires ONLY on real inserts (loadJSON adds data-only → graph:loaded), so seed sane
  // starting values here without clobbering loaded/reloaded nodes.
  let goodieCounter = 0
  const offNodeAdded = editor.on('node:added', ({ node }) => {
    if (node.type === 'Agent') {
      editor.setWidgetValue(node.id, 'salary', 0.5)
      editor.setWidgetValue(node.id, 'priority', 0)
      // Wire the agent's "tax" out-pin (index 1) into the State, like the built-in agents.
      const st = editor.graph.getNode(STATE_ID as NodeId)
      if (st) editor.connect(node as Node, 1, st as Node, 0, { animated: false })
    } else if (node.type === 'Goodie') {
      editor.setWidgetValue(node.id, 'cost', 2)
      editor.setWidgetValue(node.id, 'rate', 0.3)
      // Short stable type (avoids a raw uuid in the warehouse) + wire it to the Warehouse so the
      // overflow path is visible, like the built-in goodies.
      editor.commandBus.apply(new SetNodeState(node.id, { gtype: `good-${++goodieCounter}` }))
      const wh = editor.graph.getNode(WAREHOUSE_ID as NodeId)
      if (wh) editor.connect(node as Node, 0, wh as Node, 0, { animated: false })
    }
  })

  let tickCount = 0
  const cumAwards = new Map<string, number>(agents.map((a) => [a.id, 0]))
  const warehouse = new Map<string, number>(goodies.map((g) => [g.type, 0]))
  const acc = new Map<string, number>() // fractional-rate spawn accumulator, per goodie type

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
    for (const n of warehouse.values()) stored += n
    const p = agentPriorities()
    for (const cb of metricsSubs) {
      cb({
        step: tickCount,
        meanPriority: p.reduce((s, v) => s + v, 0) / (p.length || 1),
        gini: gini([...cumAwards.values()]),
        warehouse: stored,
        running,
      })
    }
  }

  const tick = (): void => {
    tickCount++
    const { nodes, edges } = snapshot()
    const sim = graphToSim(nodes, edges) // α comes from the Government node
    const { state, awards, leftovers } = step(sim, arrivalsFor(Object.values(sim.goodies)))
    // ephemeral: per-tick value writes that must NOT pile onto the undo stack (animation, not edits).
    for (const a of state.agents) editor.setWidgetValue(a.id as NodeId, 'priority', a.priority, { ephemeral: true })
    for (const aw of awards) { cumAwards.set(aw.to, (cumAwards.get(aw.to) ?? 0) + 1); flash(aw.to) }
    if (leftovers.length > 0) {
      for (const t of leftovers) warehouse.set(t, (warehouse.get(t) ?? 0) + 1)
      editor.setWidgetValue(WAREHOUSE_ID as NodeId, 'stock', Object.fromEntries(warehouse), { ephemeral: true })
    }
    emitMetrics(timer !== null)
  }

  // Toggle animated flow per edge on Run/Pause — the public API, no graph round-trip.
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
