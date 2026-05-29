// The MERGED view (`?engine=merged`): the two demos become one. Agents and Goodies are REAL editable
// nodes in the same graph as the algorithm. `Gather` scans them by type each tick (no wires needed),
// so adding an Agent/Goodie via Tab joins the simulation automatically and editing its salary/cost
// slider changes the model live. `Scatter Agent.priority` publishes the result; the host harvests the
// `scatter:Agent:priority` var and writes it back onto each agent's priority bar (ephemeral, no undo).

import type { XenolithEditor, NodeId, Node } from '@xenolith/editor'
import { SetNodeState } from '@xenolith/core'
import { Runtime, runtimePlugin, domainNodes, SCATTER_VAR_PREFIX } from '@xenolith/plugin-runtime'
import { fairqueueMergedGraph, MERGED_DEFS } from './runtime-graph.js'
import { AGENT_WIDGETS, GOODIE_WIDGETS } from './sim-to-graph.js'
import { priorityBar } from './priority-bar.js'
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

const goodieTypes = (editor: XenolithEditor): string[] =>
  [...editor.graph.nodes()].filter((n) => n.type === 'Goodie').map((n) => String(n.state['type'] ?? ''))

export function buildMerged(editor: XenolithEditor): MergedHandle {
  const { agents, goodies } = defaultScenario()
  editor.use(runtimePlugin) // primitives + pin types
  // Domain pin types: `agent` (whole agent record), `goodie-rec` (whole goodie record) — distinct
  // colours so wires read at a glance. `scalar` already comes from runtimePlugin (used for priority).
  editor.types.register({ id: 'agent', color: '#7C5CFF', shape: 'circle' })
  editor.types.register({ id: 'goodie-rec', color: '#FFB020', shape: 'circle' })
  editor.registerWidget('priorityBar', priorityBar)

  // Domain node kinds in the palette (Tab). REAL pins, not "Gather-by-type": each Agent exposes
  // `self` (the whole record out) and `priority` (in, scattered back). Goodie exposes `self` only.
  editor.registry.register({
    type: 'Agent', title: 'Agent', category: 'agent', description: 'A person in the queue',
    pins: [
      { kind: 'data', direction: 'out', type: 'agent', multiple: true, label: 'self' },
      { kind: 'data', direction: 'in', type: 'scalar', multiple: false, label: 'priority' },
    ],
    widgets: AGENT_WIDGETS,
  })
  editor.registry.register({
    type: 'Goodie', title: 'Goodie', category: 'goodie', description: 'A good that spawns and is claimed',
    pins: [{ kind: 'data', direction: 'out', type: 'goodie-rec', multiple: true, label: 'self' }],
    widgets: GOODIE_WIDGETS,
  })

  editor.loadJSON(fairqueueMergedGraph(agents, goodies))
  editor.fitView({ padding: 80, maxZoom: 0.9 })

  // Seed sane defaults for palette-added nodes (node:added fires only on real inserts).
  let goodieCounter = 0
  const offNodeAdded = editor.on('node:added', ({ node }) => {
    if (node.type === 'Agent') {
      editor.setWidgetValue(node.id, 'salary', 0.5)
      editor.setWidgetValue(node.id, 'priority', 0)
      editor.commandBus.apply(new SetNodeState(node.id, { subs: goodieTypes(editor) })) // subscribe to all by default
    } else if (node.type === 'Goodie') {
      const type = `good-${++goodieCounter}`
      editor.setWidgetValue(node.id, 'cost', 2)
      editor.setWidgetValue(node.id, 'rate', 0.3)
      editor.commandBus.apply(new SetNodeState(node.id, { type }))
    }
  })

  const rt = new Runtime(MERGED_DEFS)

  let tickCount = 0
  let warehouse = 0
  const subs = new Set<(m: MergedMetrics) => void>()
  const agentPriorities = (): number[] =>
    domainNodes(
      [...editor.graph.nodes()].map((n) => ({ id: String(n.id), type: n.type, state: n.state ?? {}, pins: [] })),
      'Agent',
    ).map((n) => Number(n.state?.['priority'] ?? 0))
  const emit = (running: boolean): void => {
    const p = agentPriorities()
    const mean = p.length ? p.reduce((s, v) => s + v, 0) / p.length : 0
    for (const cb of subs) cb({ step: tickCount, meanPriority: mean, warehouse, running })
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const tick = (): void => {
    tickCount++
    rt.tick(editor.graphSnapshot({ expandMacros: true }))
    // ScatterToOutputs writes its array into `scatter-out:<nodeId>`; pin i in declared order maps
    // to the i-th Agent (Scatter's data-outs were created with agents[] in fairqueueMergedGraph).
    const scattered = (rt.getVar('scatter-out:scatter') as number[] | undefined) ?? []
    const orderedAgentIds = [...editor.graph.nodes()].filter((n) => n.type === 'Agent').map((n) => String(n.id))
    orderedAgentIds.forEach((id, i) => { if (i < scattered.length) editor.setWidgetValue(id as NodeId, 'priority', scattered[i]!, { ephemeral: true }) })
    const leftovers = (rt.getVar('leftovers') as unknown[] | undefined) ?? []
    if (leftovers.length > 0) warehouse += leftovers.length
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
      offNodeAdded()
    },
  }
}
