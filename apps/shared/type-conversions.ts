// Type Conversions showcase (G2 — Baklava parity). Two nodes with mismatched typed pins:
//   NumberSource (out: number)  →  TextSink (in: text)
// Without a registered conversion the connection REFUSES to form (typed Blueprint behaviour).
// Call `toggleConversion()` and `editor.types.registerConversion('number', 'text', String)` lifts
// the wall — the connection is accepted AND `setPinLiveValueProvider` displays the converted
// value live on the consumer pin. Toggle off → existing edges are disconnected with a log line
// so the demo shows the round-trip, not just the one-way activation.

import type { XenolithEditor } from '@xenolith/editor'
import { DisconnectEdge, type Edge, type NodeId } from '@xenolith/core'

export interface TypeConversionsScene {
  /** Whether the `number → text` conversion is currently registered. */
  conversionEnabled: () => boolean
  /** Flip the conversion on/off; on OFF we also drop any live edge that depended on the cast so
   *  the user immediately sees the type-mismatch refusal. Returns the new state. */
  toggleConversion: () => boolean
  /** Append-only log of recent events (connect attempts, refusals, conversion changes). */
  log: () => readonly string[]
  onLogChange: (cb: () => void) => () => void
}

export function buildTypeConversions(editor: XenolithEditor): TypeConversionsScene {
  // Two custom types — the colours feed pin fill / wire colour automatically through TypeRegistry.
  editor.types.register({ id: 'number', color: '#FCB400', shape: 'circle' })
  editor.types.register({ id: 'text',   color: '#9F69FF', shape: 'circle' })

  const lines: string[] = []
  const listeners = new Set<() => void>()
  const append = (msg: string): void => {
    const stamp = new Date().toISOString().slice(11, 19)
    lines.push(`[${stamp}] ${msg}`)
    if (lines.length > 40) lines.splice(0, lines.length - 40)
    for (const cb of listeners) cb()
  }

  // Pin-live-value provider: for the TextSink's IN pin, find the upstream OUT pin (NumberSource)
  // and convert its current widget value through the type registry. The TextSink renders a
  // display widget on the IN pin (`visibility: 'always'`) which picks this value up automatically.
  editor.setPinLiveValueProvider((nodeId, pinKey) => {
    if (String(nodeId) !== 'sink' || pinKey !== 'in') return undefined
    // Find the edge feeding the sink's IN pin.
    const sink = editor.graph.getNode('sink' as NodeId)
    if (!sink) return undefined
    const sinkInPin = sink.pins.find((p) => p.label === 'in' || String(p.id) === 'sink_in')
    if (!sinkInPin) return undefined
    const incoming = [...editor.graph.edges()].find((e: Edge) => String(e.to.pin) === String(sinkInPin.id))
    if (!incoming) return undefined
    const src = editor.graph.getNode(incoming.from.node)
    if (!src) return undefined
    // Slider value lives on src.state under the widget's `key`. NumberSource exposes 'value'.
    const raw = (src.state as Record<string, unknown>)['value']
    try { return editor.types.convert(raw, 'number', 'text') } catch { return raw }
  })

  // Log every connect attempt — refused (because of type mismatch) and accepted alike.
  editor.on('edge:connected', (e) => append(`✓ connected ${String(e.edge.id).slice(0, 6)} (number → text via cast)`))

  // No per-widget polling needed: the editor's #propagateToDisplayConsumers walks downstream
  // display widgets on every setWidgetValue (=upstream slider move) and the renderer reads
  // pinLiveValue on the next render — built-in `text` widget included. The provider above is
  // all the wiring this demo owns.
  // The editor doesn't fire a "refused" event — but `setIsValidConnection` runs on every attempt,
  // so we can log refusals through that. It returns true to defer to the type system.
  editor.setIsValidConnection(() => true)

  // Load the scene as data — same shape as every other demo.
  editor.loadJSON({
    version: 'xenolith.v1',
    nodes: [
      {
        id: 'source', type: 'NumberSource', position: { x: 60, y: 80 }, size: { x: 200, y: 120 },
        state: { value: 42 },
        render: { title: 'NumberSource', category: 'data' },
        pins: [{ id: 'source_out', kind: 'data', direction: 'out', type: 'number', multiple: true, label: 'out' }],
        widgets: [{ id: 'value', type: 'slider', key: 'value', label: '', pinKey: 'out', min: 0, max: 100, step: 0.5, visibility: 'always' }],
      },
      {
        id: 'sink', type: 'TextSink', position: { x: 420, y: 80 }, size: { x: 220, y: 130 },
        state: {},
        render: { title: 'TextSink', category: 'utility' },
        pins: [{ id: 'sink_in', kind: 'data', direction: 'in', type: 'text', multiple: false, label: 'in' }],
        widgets: [{ id: 'shown', type: 'text', key: 'shown', label: '', pinKey: 'in', visibility: 'always' }],
      },
    ],
    edges: [],
  })
  editor.fitView({ padding: 80, maxZoom: 1 })

  let enabled = false
  const setEnabled = (next: boolean): void => {
    if (next === enabled) return
    enabled = next
    if (enabled) {
      editor.types.registerConversion('number', 'text', (v) => String(v))
      append('✓ conversion number → text registered — try connecting the pins now')
    } else {
      editor.types.unregisterConversion('number', 'text')
      // Drop any extant edge that depended on the cast — without the conversion the wire is
      // semantically invalid; leaving it would be lying about the type contract.
      let dropped = 0
      for (const e of [...editor.graph.edges()]) {
        const src = editor.graph.getNode(e.from.node)
        const dst = editor.graph.getNode(e.to.node)
        if (!src || !dst) continue
        const srcPin = src.pins.find((p) => String(p.id) === String(e.from.pin))
        const dstPin = dst.pins.find((p) => String(p.id) === String(e.to.pin))
        if (srcPin?.type === 'number' && dstPin?.type === 'text') {
          editor.commandBus.apply(new DisconnectEdge(e.id)); dropped++
        }
      }
      append(`✗ conversion removed${dropped > 0 ? ` (dropped ${dropped} stale edge${dropped === 1 ? '' : 's'})` : ''} — try connecting again, it refuses`)
    }
  }

  append('No conversion registered. Try dragging from NumberSource.out to TextSink.in — refused.')

  return {
    conversionEnabled: () => enabled,
    toggleConversion: () => { setEnabled(!enabled); return enabled },
    log: () => lines,
    onLogChange: (cb) => { listeners.add(cb); return () => { listeners.delete(cb) } },
  }
}
