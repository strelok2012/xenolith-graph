import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useXenolithEditor } from '@xenolith/react'
import type { XenolithEditor, NodeId, Node, NodeSchema } from '@xenolith/editor'
import { reachableFrom } from '@xenolith/core'
import { DemoStage } from '../Layout.js'

// A tiny Web Audio synth built ON the graph: Oscillator → Filter → Gain → Output. The node widgets
// are the synth's knobs; Play walks the graph to wire real AudioNodes and lights the active chain
// with setNodeStatus. Showcases typed pins, built-in widgets, graph traversal + node status, and a
// real, audible output — "look what you can build".

const SCHEMAS: NodeSchema[] = [
  {
    type: 'Oscillator', title: 'Oscillator',
    pins: [{ kind: 'data', direction: 'out', type: 'audio', label: 'Out' }],
    widgets: [
      { id: 'wave', type: 'combo', key: 'wave', label: 'Wave', values: ['sine', 'square', 'sawtooth', 'triangle'] },
      { id: 'freq', type: 'slider', key: 'freq', label: 'Freq', min: 50, max: 1200, step: 1 },
    ],
  },
  {
    type: 'Filter', title: 'Filter',
    pins: [{ kind: 'data', direction: 'in', type: 'audio', label: 'In' }, { kind: 'data', direction: 'out', type: 'audio', label: 'Out' }],
    widgets: [
      { id: 'ftype', type: 'combo', key: 'ftype', label: 'Type', values: ['lowpass', 'highpass', 'bandpass'] },
      { id: 'cutoff', type: 'slider', key: 'cutoff', label: 'Cutoff', min: 80, max: 8000, step: 10 },
    ],
  },
  {
    type: 'Gain', title: 'Gain',
    pins: [{ kind: 'data', direction: 'in', type: 'audio', label: 'In' }, { kind: 'data', direction: 'out', type: 'audio', label: 'Out' }],
    widgets: [{ id: 'level', type: 'slider', key: 'level', label: 'Level', min: 0, max: 1, step: 0.01 }],
  },
  {
    type: 'Output', title: '🔊 Output',
    pins: [{ kind: 'data', direction: 'in', type: 'audio', label: 'In' }],
    widgets: [],
  },
]

const DEFAULTS: Record<string, Record<string, unknown>> = {
  Oscillator: { wave: 'sawtooth', freq: 220 },
  Filter: { ftype: 'lowpass', cutoff: 900 },
  Gain: { level: 0.25 },
  Output: {},
}

function buildGraph(editor: XenolithEditor): void {
  for (const s of SCHEMAS) editor.registry.register(s)
  const place: Record<string, { x: number; y: number }> = {
    Oscillator: { x: 0, y: 60 }, Filter: { x: 260, y: 60 }, Gain: { x: 520, y: 60 }, Output: { x: 780, y: 90 },
  }
  const made: Node[] = []
  for (const s of SCHEMAS) {
    const n = editor.registry.instantiate(s.type, place[s.type]!)
    Object.assign(n.state, DEFAULTS[s.type])
    editor.addNode(n)
    made.push(n)
  }
  // wire Osc → Filter → Gain → Output
  const link = (a: Node, b: Node): void => {
    const oi = a.pins.findIndex((p) => p.direction === 'out')
    const ii = b.pins.findIndex((p) => p.direction === 'in')
    if (oi >= 0 && ii >= 0) editor.connect(a, oi, b, ii)
  }
  for (let i = 0; i < made.length - 1; i++) link(made[i]!, made[i + 1]!)
  editor.fitView({ padding: 64, maxZoom: 1 })
}

/** Build live Web Audio nodes from the graph and connect them per the edges. Returns a node→AudioNode
 *  map so params can be tweaked live. Oscillators are started; Gains are clamped for safe volume. */
function startAudio(editor: XenolithEditor, ctx: AudioContext): Map<NodeId, AudioNode> {
  const map = new Map<NodeId, AudioNode>()
  for (const n of editor.graph.nodes()) {
    if (n.type === 'Oscillator') {
      const o = ctx.createOscillator()
      o.type = String(n.state['wave']) as OscillatorType
      o.frequency.value = Number(n.state['freq']) || 220
      o.start()
      map.set(n.id, o)
    } else if (n.type === 'Filter') {
      const f = ctx.createBiquadFilter()
      f.type = String(n.state['ftype']) as BiquadFilterType
      f.frequency.value = Number(n.state['cutoff']) || 900
      map.set(n.id, f)
    } else if (n.type === 'Gain') {
      const g = ctx.createGain()
      g.gain.value = Math.min(0.6, Number(n.state['level']) || 0)
      map.set(n.id, g)
    } else if (n.type === 'Output') {
      map.set(n.id, ctx.destination)
    }
  }
  for (const e of editor.graph.edges()) {
    const a = map.get(e.from.node), b = map.get(e.to.node)
    if (a && b && 'connect' in a) (a as AudioNode).connect(b)
  }
  return map
}

/** Disconnect and stop every AudioNode in a map (oscillators are stopped; destination is left). */
function teardownAudio(map: Map<NodeId, AudioNode> | null): void {
  if (!map) return
  for (const an of map.values()) {
    if (an instanceof OscillatorNode) { try { an.stop() } catch { /* already stopped */ } }
    if ('disconnect' in an && an !== an.context.destination) { try { an.disconnect() } catch { /* noop */ } }
  }
  map.clear()
}

/** The oscillator id — the source the live chain is measured from. */
function sourceId(editor: XenolithEditor): NodeId | undefined {
  return [...editor.graph.nodes()].find((n) => n.type === 'Oscillator')?.id
}

/** Transport (Play / Stop) — a separate in-editor control. Owns the AudioContext; lights the chain
 *  with setNodeStatus while playing and pushes live widget edits to the matching AudioParam. */
function Transport() {
  const editor = useXenolithEditor()
  const ctxRef = useRef<AudioContext | null>(null)
  const mapRef = useRef<Map<NodeId, AudioNode> | null>(null)
  const [playing, setPlaying] = useState(false)

  // Light ONLY the nodes still reachable from the oscillator through connected edges — so a node
  // past a broken edge (or a deleted one) stops glowing. Mirrors the audible chain.
  const lightActiveChain = (): void => {
    if (!editor) return
    editor.clearNodeStatuses()
    const src = sourceId(editor)
    if (!src) return
    for (const id of reachableFrom(editor.graph, src)) editor.setNodeStatus(id, 'running')
  }

  // (Re)build the audio graph from the CURRENT edges and re-light the chain. Called on Play and on
  // every structural change while playing, so cutting Filter→Gain silences + darkens everything past it.
  const rebuild = (): void => {
    const ctx = ctxRef.current
    if (!editor || !ctx) return
    teardownAudio(mapRef.current)
    mapRef.current = startAudio(editor, ctx)
    lightActiveChain()
  }

  const stop = (): void => {
    teardownAudio(mapRef.current)
    ctxRef.current?.close().catch(() => {})
    ctxRef.current = null; mapRef.current = null
    editor?.clearNodeStatuses()
    setPlaying(false)
  }
  const play = (): void => {
    if (!editor) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctxRef.current = new Ctor()
    rebuild()
    setPlaying(true)
  }

  // While playing, any edge add/remove or node removal re-wires the audio + re-lights the live chain.
  useEffect(() => {
    if (!editor || !playing) return
    const offs = [
      editor.on('edge:connected', rebuild),
      editor.on('edge:disconnected', rebuild),
      editor.on('node:removed', rebuild),
    ]
    return () => { for (const off of offs) off() }
  }, [editor, playing])

  // Live: a knob moved on a node → update the matching AudioParam while playing.
  useEffect(() => {
    if (!editor) return
    return editor.on('widget:changed', ({ nodeId, widgetId, value }) => {
      const an = mapRef.current?.get(nodeId)
      if (!an) return
      if (widgetId === 'freq') (an as OscillatorNode).frequency.value = Number(value)
      else if (widgetId === 'wave') (an as OscillatorNode).type = String(value) as OscillatorType
      else if (widgetId === 'cutoff') (an as BiquadFilterNode).frequency.value = Number(value)
      else if (widgetId === 'ftype') (an as BiquadFilterNode).type = String(value) as BiquadFilterType
      else if (widgetId === 'level') (an as GainNode).gain.value = Math.min(0.6, Number(value))
    })
  }, [editor])

  useEffect(() => () => { teardownAudio(mapRef.current); ctxRef.current?.close().catch(() => {}) }, [])

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>
      <XenolithButton active={playing} onClick={() => (playing ? stop() : play())} style={{ width: '100%' }}>
        {playing ? '■ Stop' : '▶ Play'}
      </XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
        Tweak the knobs while it plays — the chain is wired from the graph; the active path glows.
      </span>
    </XenolithPanel>
  )
}

/** Showcase: a real Web Audio synth built on the node graph. */
export function AudioSynthDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={buildGraph}>
        <Transport />
      </XenolithGraph>
    </DemoStage>
  )
}
