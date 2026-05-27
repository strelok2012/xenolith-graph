// A tiny Web Audio synth built ON the graph: Oscillator → Filter → Gain → Output. The graph is DATA
// (audio-synth.json, loaded with editor.loadJSON); the node widgets are the synth's knobs.
//
// Everything here is framework-agnostic editor + Web Audio API. play() owns an AudioContext, wires
// real AudioNodes from the current edges and lights the active chain; while playing, it subscribes to
// the editor's own events so any knob tweak retunes the matching AudioParam and any edge/node change
// re-wires the audio + re-lights the chain (cutting Filter→Gain silences and darkens everything past
// it). reachableFrom keeps a node past a broken/deleted edge out of the live chain.

import { reachableFrom } from '@xenolith/core'
import type { XenolithEditor, NodeId } from '@xenolith/editor'
import graph from './audio-synth.json'

export interface AudioSynthHandle {
  play(): void
  stop(): void
  /** Tear down audio + event subscriptions; call on host unmount. */
  dispose(): void
}

/** Build live Web Audio nodes from the graph and connect them per the edges. */
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

function teardownAudio(map: Map<NodeId, AudioNode> | null): void {
  if (!map) return
  for (const an of map.values()) {
    if (an instanceof OscillatorNode) { try { an.stop() } catch { /* already stopped */ } }
    if ('disconnect' in an && an !== an.context.destination) { try { an.disconnect() } catch { /* noop */ } }
  }
  map.clear()
}

export function buildAudioSynth(editor: XenolithEditor): AudioSynthHandle {
  editor.loadJSON(graph)
  editor.fitView({ padding: 64, maxZoom: 1 })

  let ctx: AudioContext | null = null
  let map: Map<NodeId, AudioNode> | null = null
  let offs: Array<() => void> = []

  const sourceId = (): NodeId | undefined => [...editor.graph.nodes()].find((n) => n.type === 'Oscillator')?.id

  // Light ONLY the nodes still reachable from the oscillator through connected edges — mirrors the
  // audible chain, so a node past a broken/deleted edge stops glowing.
  const lightActiveChain = (): void => {
    editor.clearNodeStatuses()
    const src = sourceId()
    if (!src) return
    for (const id of reachableFrom(editor.graph, src)) editor.setNodeStatus(id, 'running')
  }

  // (Re)build the audio graph from the CURRENT edges and re-light the chain.
  const rebuild = (): void => {
    if (!ctx) return
    teardownAudio(map)
    map = startAudio(editor, ctx)
    lightActiveChain()
  }

  const play = (): void => {
    if (ctx) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new Ctor()
    rebuild()
    // Debounce: a single user action (delete, and especially undo/redo of it) fires a burst of
    // graph events as the transaction restores the node + its edges one by one. Rebuilding on each
    // would wire the audio from a half-restored graph and leave it stuck on a partial chain. Coalesce
    // to one rebuild after the burst settles, when editor.graph is whole again. node:added is needed
    // so undo of a delete (which re-adds the node + cascades its edges) triggers it.
    let rebuildTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleRebuild = (): void => { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 0) }
    offs = [
      editor.on('edge:connected', scheduleRebuild),
      editor.on('edge:disconnected', scheduleRebuild),
      editor.on('node:removed', scheduleRebuild),
      editor.on('node:added', scheduleRebuild),
      // A knob moved → retune the matching AudioParam live.
      editor.on('widget:changed', ({ nodeId, widgetId, value }) => {
        const an = map?.get(nodeId)
        if (!an) return
        if (widgetId === 'freq') (an as OscillatorNode).frequency.value = Number(value)
        else if (widgetId === 'wave') (an as OscillatorNode).type = String(value) as OscillatorType
        else if (widgetId === 'cutoff') (an as BiquadFilterNode).frequency.value = Number(value)
        else if (widgetId === 'ftype') (an as BiquadFilterNode).type = String(value) as BiquadFilterType
        else if (widgetId === 'level') (an as GainNode).gain.value = Math.min(0.6, Number(value))
      }),
    ]
  }

  const stop = (): void => {
    for (const off of offs) off()
    offs = []
    teardownAudio(map)
    ctx?.close().catch(() => {})
    ctx = null; map = null
    editor.clearNodeStatuses()
  }

  return { play, stop, dispose: stop }
}
