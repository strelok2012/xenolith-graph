import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useEditor } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import type { NodeId, NodeSchema } from '@xenolith/core'
import { DemoStage } from '../Layout.js'

// Per-node "cost / latency" overlay rendered as a colored dot in editor.overlayRoot positioned
// at the node corner. Color is a cool→hot gradient over the [0..1] metric. Simulated workload
// animates the metrics so the heatmap pulses — landing-ready visual moat (no OSS competitor
// has this out of the box).

const SCHEMAS: NodeSchema[] = [
  { type: 'Source',    title: 'Source',    category: 'data',
    pins: [{ kind: 'data', direction: 'out', type: 'object', label: 'Out' }] },
  { type: 'Embed',     title: 'Embed',     category: 'logic',
    pins: [
      { kind: 'data', direction: 'in',  type: 'object', label: 'In' },
      { kind: 'data', direction: 'out', type: 'object', label: 'Out' },
    ] },
  { type: 'Retrieve',  title: 'Retrieve',  category: 'logic',
    pins: [
      { kind: 'data', direction: 'in',  type: 'object', label: 'In' },
      { kind: 'data', direction: 'out', type: 'object', label: 'Out' },
    ] },
  { type: 'Rerank',    title: 'Rerank',    category: 'logic',
    pins: [
      { kind: 'data', direction: 'in',  type: 'object', label: 'In' },
      { kind: 'data', direction: 'out', type: 'object', label: 'Out' },
    ] },
  { type: 'Prompt',    title: 'Prompt',    category: 'data',
    pins: [
      { kind: 'data', direction: 'in',  type: 'object', label: 'In' },
      { kind: 'data', direction: 'out', type: 'object', label: 'Out' },
    ] },
  { type: 'Model',     title: 'Model',     category: 'macro',
    pins: [
      { kind: 'data', direction: 'in',  type: 'object', label: 'In' },
      { kind: 'data', direction: 'out', type: 'object', label: 'Out' },
    ] },
  { type: 'Output',    title: 'Output',    category: 'utility',
    pins: [{ kind: 'data', direction: 'in', type: 'object', label: 'In' }] },
]

interface NodeMetric {
  nodeId: NodeId
  /** Stable baseline metric — never mutated. Pulse oscillates AROUND this value, so the
   *  initial color ordering survives an unbounded animation. */
  base: number
  /** Per-node phase offset so the pulse doesn't beat in lockstep. */
  phase: number
  /** Live displayed metric = base + sin(t + phase)*amp. Recomputed each animation tick. */
  metric: number
  label: string
}

function buildPipeline(editor: XenolithEditor): NodeMetric[] {
  for (const s of SCHEMAS) editor.registry.register(s)
  const order: { type: string; x: number; y: number; cost: number; label: string }[] = [
    { type: 'Source',   x: 0,    y: 100, cost: 0.05, label: '5ms' },
    { type: 'Embed',    x: 220,  y: 100, cost: 0.4,  label: '320ms' },
    { type: 'Retrieve', x: 440,  y: 100, cost: 0.6,  label: '480ms' },
    { type: 'Rerank',   x: 660,  y: 100, cost: 0.25, label: '180ms' },
    { type: 'Prompt',   x: 880,  y: 100, cost: 0.1,  label: '50ms' },
    { type: 'Model',    x: 1100, y: 100, cost: 0.95, label: '2.3s' },
    { type: 'Output',   x: 1340, y: 100, cost: 0.05, label: '8ms' },
  ]
  const created = order.map((spec) => ({ spec, node: editor.insertNode(spec.type, { x: spec.x, y: spec.y })! }))
  const o0 = (n: { pins: { id: unknown; direction: string }[] }) => n.pins.find((p) => p.direction === 'out')!.id
  const i0 = (n: { pins: { id: unknown; direction: string }[] }) => n.pins.find((p) => p.direction === 'in')!.id
  for (let i = 0; i < created.length - 1; i++) {
    const a = created[i]!.node, b = created[i + 1]!.node
    editor.addEdge({ id: crypto.randomUUID(), from: { node: a.id, pin: o0(a) as never }, to: { node: b.id, pin: i0(b) as never } } as never)
  }
  editor.fitView({ padding: 80 })
  return created.map(({ spec, node }, i) => ({
    nodeId: node.id, base: spec.cost, phase: i * 0.7, metric: spec.cost, label: spec.label,
  }))
}

/** Map a 0..1 metric to a HSL color: 200° (cool blue) → 0° (hot red). */
function heatColor(t: number): string {
  const c = Math.max(0, Math.min(1, t))
  const hue = 200 - 200 * c
  return `hsl(${hue}deg, 80%, 55%)`
}

interface HeatDot { el: HTMLDivElement; label: HTMLSpanElement }
function makeDot(): HeatDot {
  const el = document.createElement('div')
  Object.assign(el.style, {
    position: 'absolute', width: '16px', height: '16px', borderRadius: '16px',
    pointerEvents: 'none', transform: 'translate(-50%, -50%)', zIndex: '15',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 12px currentColor',
  } as Partial<CSSStyleDeclaration>)
  const label = document.createElement('span')
  Object.assign(label.style, {
    position: 'absolute', top: '14px', left: '50%', transform: 'translateX(-50%)',
    fontSize: '10px', color: 'var(--xeno-text, #cfcfcf)', whiteSpace: 'nowrap',
    fontFamily: 'ui-monospace, monospace', pointerEvents: 'none', fontWeight: '600',
  } as Partial<CSSStyleDeclaration>)
  el.appendChild(label)
  return { el, label }
}

function HeatmapPanel() {
  const editor = useEditor()
  const metricsRef = useRef<NodeMetric[]>([])
  const dotsRef = useRef<Map<string, HeatDot>>(new Map())
  const sizeCacheRef = useRef<Map<string, { w: number; h: number }>>(new Map())
  const applyMetricsRef = useRef<(() => void) | null>(null)
  const [pulsing, setPulsing] = useState(false)

  // Setup: build pipeline (idempotent — once per editor), create dots, wire viewport listeners.
  useEffect(() => {
    metricsRef.current = buildPipeline(editor)

    const reposition = (): void => {
      // Each node's measured size lands on `n.size` asynchronously — the FIRST paint may have
      // `n.size === undefined`. Cache the measured value the moment it becomes defined and
      // stick to that forever. This pins the badge under the node's TRUE centre (instead of
      // a hardcoded width that doesn't match wider node types) AND prevents the "jump on
      // micro-zoom" we saw when `n.size` first appeared.
      const FALLBACK_W = 220, FALLBACK_H = 80
      for (const [id, dot] of dotsRef.current) {
        const n = editor.graph.getNode(id as never)
        if (!n) continue
        let cached = sizeCacheRef.current.get(id)
        if (!cached && n.size) {
          cached = { w: n.size.x, h: n.size.y }
          sizeCacheRef.current.set(id, cached)
        }
        const w = cached?.w ?? FALLBACK_W
        const h = cached?.h ?? FALLBACK_H
        const bottomCentre = editor.worldToScreen({ x: n.position.x + w / 2, y: n.position.y + h })
        dot.el.style.left = `${bottomCentre.x}px`
        dot.el.style.top  = `${bottomCentre.y + 12}px`
      }
    }
    const applyMetrics = (): void => {
      for (const m of metricsRef.current) {
        let dot = dotsRef.current.get(String(m.nodeId))
        if (!dot) {
          dot = makeDot()
          editor.overlayRoot.appendChild(dot.el)
          dotsRef.current.set(String(m.nodeId), dot)
        }
        dot.el.style.color = heatColor(m.metric)
        dot.el.style.background = heatColor(m.metric)
        dot.label.textContent = m.label
      }
      reposition()
      ;(window as unknown as { __xenoHeatmap?: { metrics: { id: string; metric: number; label: string }[] } }).__xenoHeatmap = {
        metrics: metricsRef.current.map((m) => ({ id: String(m.nodeId), metric: m.metric, label: m.label })),
      }
    }

    applyMetricsRef.current = applyMetrics
    applyMetrics()
    editor.on('viewport:changed', reposition)
    editor.on('node:moved', reposition)
    // PIXI measures node footprint lazily — `n.size` is undefined on the synchronous insertNode
    // path but becomes defined a frame or two later. Fire a couple of re-positions so the cache
    // captures the REAL measured width instead of sticking to the fallback (badge looked
    // off-centre on wider node types — image #37 Prompt).
    requestAnimationFrame(() => requestAnimationFrame(() => { reposition(); setTimeout(reposition, 100) }))

    return () => {
      for (const [, d] of dotsRef.current) d.el.remove()
      dotsRef.current.clear()
      sizeCacheRef.current.clear()
      applyMetricsRef.current = null
      ;(window as unknown as { __xenoHeatmap?: unknown }).__xenoHeatmap = undefined
    }
  }, [editor])

  // Pulse: oscillate around each node's BASE cost. Computing from `base` (not the last metric)
  // means the color ordering stays stable forever — even after thousands of frames the Model
  // stays red and Source stays blue. Amplitude 0.08 lets each ring breathe ~+/-10%.
  useEffect(() => {
    if (!pulsing) return
    let raf = 0
    const step = (): void => {
      const t = performance.now() / 500
      metricsRef.current = metricsRef.current.map((m) => ({
        ...m,
        metric: Math.max(0.02, Math.min(1, m.base + Math.sin(t + m.phase) * 0.08)),
      }))
      applyMetricsRef.current?.()
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [pulsing])

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, padding: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--xeno-text)', fontWeight: 600 }}>Per-node cost heatmap</div>
      <div style={{ fontSize: 11, color: 'var(--xeno-muted)', lineHeight: 1.4 }}>
        A simulated RAG pipeline. Each node has a per-call latency badge —
        <span style={{ color: 'hsl(200deg,80%,55%)' }}> cool blue</span> for cheap,
        <span style={{ color: 'hsl(40deg,80%,55%)' }}> warm</span> for medium,
        <span style={{ color: 'hsl(0deg,80%,55%)' }}> hot red</span> for the bottleneck.
        Press Pulse to animate live metrics.
      </div>
      <XenolithButton active={pulsing} onClick={() => setPulsing(!pulsing)}>
        {pulsing ? '⏸ Pause pulse' : '▶ Pulse'}
      </XenolithButton>
    </XenolithPanel>
  )
}

export function HeatmapDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false}>
        <HeatmapPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
