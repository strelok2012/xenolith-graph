// Framework-agnostic builder (the buildAudioSynth pattern): wires Рома's distribution sim onto a
// XenolithEditor purely through the public API — registerWidget, loadJSON, setWidgetValue,
// setNodeStatus, on('widget:changed'). The React page is just panels bound to the returned handle.

import type { XenolithEditor, NodeId } from '@xenolith/editor'
import type { Unsubscribe } from '@xenolith/core'
import { createSim, step, type Agent, type GoodieSpec, type SimState } from './fairqueue.js'
import { simToGraph } from './sim-to-graph.js'
import { priorityBar } from './priority-bar.js'
import { geometricMean, gini } from './metrics.js'

export interface Metrics {
  step: number
  meanPriority: number
  gini: number // of cumulative goodies received — fairness of the distribution so far
  running: boolean
}

export interface FairqueueHandle {
  setSalary(v: number): void
  setTaxAlpha(v: number): void
  setCost(v: number): void // uniform cost across goodie types (demo simplification)
  setRate(v: number): void // goodie units that fall per tick
  pause(): void
  resume(): void
  stepOnce(): void
  onMetrics(cb: (m: Metrics) => void): Unsubscribe
  dispose(): void
}

const TICK_MS = 340
const FLASH_MS = 320

function defaultScenario(): { agents: Agent[]; goodies: GoodieSpec[] } {
  const goodies: GoodieSpec[] = [
    { type: 'gift', cost: 3 },
    { type: 'coin', cost: 2 },
    { type: 'star', cost: 5 },
  ]
  const subs: Record<string, string[]> = {
    Ada: ['gift', 'coin'],
    Boris: ['coin'],
    Cleo: ['gift', 'star'],
    Dmitri: ['coin', 'star'],
    Esra: ['gift', 'coin', 'star'],
    Finn: ['star'],
  }
  const agents: Agent[] = Object.entries(subs).map(([id, subscriptions]) => ({
    id,
    priority: 1,
    subscriptions,
  }))
  return { agents, goodies }
}

export function buildFairqueue(editor: XenolithEditor): FairqueueHandle {
  const { agents, goodies } = defaultScenario()
  const sim = { current: createSim(agents, goodies, { salary: 1, taxAlpha: 0.12 }) }
  const goodieTypes = goodies.map((g) => g.type)
  const cumAwards = new Map<string, number>(agents.map((a) => [a.id, 0]))

  editor.registerWidget('priorityBar', priorityBar)
  editor.loadJSON(simToGraph(sim.current))
  editor.fitView({ padding: 90, maxZoom: 1 })

  let rate = 2
  let arrivalCursor = 0
  const nextArrivals = (): string[] => {
    const out: string[] = []
    for (let i = 0; i < rate; i++) out.push(goodieTypes[arrivalCursor++ % goodieTypes.length]!)
    return out
  }

  // --- two-way binding: a dragged bar (relative ×) is committed by the editor and reported here;
  // convert back to absolute priority and write it into the sim so the tax can relax it. ---
  let applyingTick = false
  const offWidget = editor.on('widget:changed', (e) => {
    if (applyingTick || e.widgetId !== 'priority') return
    const agent = sim.current.agents.find((a) => a.id === String(e.nodeId))
    if (!agent) return
    const gm = geometricMean(sim.current.agents.map((a) => a.priority))
    agent.priority = Math.max(sim.current.params.minPriority, Number(e.value) * gm)
  })

  const flashes = new Map<string, ReturnType<typeof setTimeout>>()
  const flash = (id: string): void => {
    editor.setNodeStatus(id as NodeId, 'ok')
    clearTimeout(flashes.get(id))
    flashes.set(id, setTimeout(() => editor.setNodeStatus(id as NodeId, 'idle'), FLASH_MS))
  }

  const pushBars = (): void => {
    const gm = geometricMean(sim.current.agents.map((a) => a.priority))
    applyingTick = true
    for (const a of sim.current.agents) editor.setWidgetValue(a.id as NodeId, 'priority', a.priority / gm)
    applyingTick = false
  }

  // No public toggle for edge animation, so re-emit the graph with `animated` flipped — only on the
  // Run/Pause transition (cheap for this graph), never per tick. Re-push bars after the reload.
  const reload = (animated: boolean): void => {
    editor.loadJSON(simToGraph(sim.current, { animated }))
    pushBars()
  }

  const metricsSubs = new Set<(m: Metrics) => void>()
  const emitMetrics = (running: boolean): void => {
    const priorities = sim.current.agents.map((a) => a.priority)
    const m: Metrics = {
      step: sim.current.step,
      meanPriority: priorities.reduce((s, v) => s + v, 0) / (priorities.length || 1),
      gini: gini([...cumAwards.values()]),
      running,
    }
    for (const cb of metricsSubs) cb(m)
  }

  let timer: ReturnType<typeof setInterval> | null = null
  const tick = (): void => {
    const { state, awards } = step(sim.current, nextArrivals())
    sim.current = state
    for (const aw of awards) {
      cumAwards.set(aw.to, (cumAwards.get(aw.to) ?? 0) + 1)
      flash(aw.to)
    }
    pushBars()
    emitMetrics(timer !== null)
  }

  const start = (): void => {
    if (timer === null) timer = setInterval(tick, TICK_MS)
  }
  pushBars()
  emitMetrics(false)
  start()

  return {
    setSalary: (v) => { sim.current.params.salary = v },
    setTaxAlpha: (v) => { sim.current.params.taxAlpha = v },
    setCost: (v) => { for (const t of goodieTypes) sim.current.goodies[t]!.cost = v },
    setRate: (v) => { rate = Math.max(0, Math.round(v)) },
    pause: () => { if (timer !== null) { clearInterval(timer); timer = null; reload(false); emitMetrics(false) } },
    resume: () => { if (timer === null) reload(true); start(); emitMetrics(true) },
    stepOnce: () => { if (timer === null) tick() },
    onMetrics: (cb) => { metricsSubs.add(cb); return () => metricsSubs.delete(cb) },
    dispose: () => {
      if (timer !== null) clearInterval(timer)
      timer = null
      for (const t of flashes.values()) clearTimeout(t)
      flashes.clear()
      metricsSubs.clear()
      offWidget()
    },
  }
}
