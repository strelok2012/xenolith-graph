// Per-node canvas drawing (LiteGraph `onDrawBackground/Foreground` equivalent — G11). We don't
// need a new API: a custom canvas widget IS the hook. It gets the full {node, value, width,
// height, accent, ...} on every paint, and can draw whatever — image previews, sparklines,
// oscilloscopes, thermometers, sample swatches. This scene proves it:
//
//   Slider (number widget) ─→ Sparkline (custom canvas, rolling buffer of last N samples)
//   ColorPicker (color widget) ─→ ColorPreview (custom canvas, fills with the tint)
//
// Each "preview" node is just a normal node with one free-floating custom widget; the widget's
// `draw` is the per-node paint hook. No core API added — this closes G11 by demonstration.

import type { XenolithEditor, CanvasWidgetController } from '@xenolith/editor'

// ─── Sparkline ─────────────────────────────────────────────────────────────────────────────────
// Reads the upstream slider's current value through `setPinLiveValueProvider`, keeps a rolling
// buffer of recent samples in module state, and draws a min-to-max line plot. A poller pushes a
// new sample every 100ms so the line scrolls even when the slider isn't moving — gives the
// oscilloscope vibe.

const SAMPLES_PER_NODE = new Map<string, number[]>()
const SAMPLE_CAP = 80

export const sparklineWidget: CanvasWidgetController = {
  draw(ctx, { node, width, height, accent, muted }) {
    const buf = SAMPLES_PER_NODE.get(String(node.id)) ?? []
    ctx.clearRect(0, 0, width, height)
    // Grid: a single mid line + a baseline.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, height - 1); ctx.lineTo(width, height - 1); ctx.stroke()
    if (buf.length < 2) {
      ctx.fillStyle = muted
      ctx.font = '11px Inter'
      ctx.textBaseline = 'middle'
      ctx.fillText('connect a number', 6, height / 2)
      return
    }
    // Map samples in [0..1] to canvas y (flipped). The slider feeds 0..1 already.
    const stepX = width / (SAMPLE_CAP - 1)
    ctx.strokeStyle = accent
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let i = 0; i < buf.length; i++) {
      const x = i * stepX
      const y = height - 4 - (buf[i]! * (height - 8))
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
    }
    ctx.stroke()
    // Last-value dot + readout.
    const last = buf[buf.length - 1]!
    ctx.fillStyle = accent
    const lx = (buf.length - 1) * stepX
    const ly = height - 4 - (last * (height - 8))
    ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = accent
    ctx.font = '11px Inter'
    ctx.textBaseline = 'top'
    ctx.fillText(last.toFixed(2), 6, 4)
  },
}

// ─── Color swatch ──────────────────────────────────────────────────────────────────────────────
// Reads `node.state.tint` (set by a color widget on the same node) and paints a filled rounded
// rect. Demonstrates that the draw hook sees the full Node — state, widgets, pins, everything.

export const colorPreviewWidget: CanvasWidgetController = {
  // Reads the LIVE upstream color out of `value` (the poller pushes it via setWidgetValue every
  // tick). Falls back to the node's own state.tint so the swatch isn't empty before the first
  // tick lands.
  draw(ctx, { node, value, width, height, muted }) {
    const tint = (typeof value === 'string' && value.length > 0)
      ? value
      : ((node.state['tint'] as string | undefined) ?? '#444')
    ctx.clearRect(0, 0, width, height)
    const r = 8
    ctx.fillStyle = tint
    roundRect(ctx, 4, 4, width - 8, height - 16, r); ctx.fill()
    ctx.fillStyle = muted
    ctx.font = '10px Inter'
    ctx.textBaseline = 'bottom'
    ctx.fillText(String(tint).toUpperCase(), 6, height - 2)
  },
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// ─── Scene + plumbing ──────────────────────────────────────────────────────────────────────────

export interface PreviewNodesScene {
  /** Stop the sparkline poller — call on tear-down. */
  dispose: () => void
}

/** Idempotent setup: registers the two custom widgets, loads the graph, and installs the poller
 *  as a plugin so the editor's own destroy cleans up the interval. Safe to pass to `onReady`. */
export function setupPreviewNodes(editor: XenolithEditor): void { void buildPreviewNodes(editor) }

export function buildPreviewNodes(editor: XenolithEditor): PreviewNodesScene {
  editor.registerWidget('sparkline-preview', sparklineWidget)
  editor.registerWidget('color-preview',     colorPreviewWidget)

  editor.loadJSON({
    version: 'xenolith.v1',
    nodes: [
      // Number source (drives the sparkline).
      {
        id: 'src', type: 'Number', position: { x: 60, y: 80 }, size: { x: 200, y: 100 },
        state: { value: 0.5 },
        render: { title: 'Number', category: 'data' },
        pins: [{ id: 'src_out', kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'out' }],
        widgets: [{ id: 'value', type: 'slider', key: 'value', label: '', pinKey: 'out', min: 0, max: 1, step: 0.01, visibility: 'always' }],
      },
      // Sparkline node — one IN pin, one free-floating custom widget that paints.
      {
        id: 'spark', type: 'Sparkline', position: { x: 360, y: 60 }, size: { x: 220, y: 140 },
        state: {},
        render: { title: 'Sparkline', category: 'utility' },
        pins: [{ id: 'spark_in', kind: 'data', direction: 'in', type: 'float', multiple: false, label: 'in' }],
        widgets: [{ id: 'spark', type: 'custom', renderer: 'sparkline-preview', key: 'spark', label: '', height: 90 }],
      },
      // Color picker (drives the swatch).
      {
        id: 'pick', type: 'ColorPicker', position: { x: 60, y: 280 }, size: { x: 200, y: 100 },
        state: { tint: '#FCB400' },
        render: { title: 'ColorPicker', category: 'data' },
        pins: [{ id: 'pick_out', kind: 'data', direction: 'out', type: 'string', multiple: true, label: 'out' }],
        widgets: [{ id: 'tint', type: 'color', key: 'tint', label: '', pinKey: 'out', visibility: 'always' }],
      },
      // Color swatch preview — ONE free-floating custom widget. No bound color widget on the IN
      // pin: that would duplicate-show the same value AND fight the swatch for vertical space.
      {
        id: 'swatch', type: 'ColorPreview', position: { x: 360, y: 260 }, size: { x: 220, y: 140 },
        state: {},
        render: { title: 'ColorPreview', category: 'utility' },
        pins: [{ id: 'swatch_in', kind: 'data', direction: 'in', type: 'string', multiple: false, label: 'in' }],
        widgets: [
          { id: 'paint', type: 'custom', renderer: 'color-preview', key: 'paint', label: '', height: 90 },
        ],
      },
    ],
    edges: [
      { id: 'e1', from: { node: 'src',  pin: 'src_out'  }, to: { node: 'spark',  pin: 'spark_in'  } },
      { id: 'e2', from: { node: 'pick', pin: 'pick_out' }, to: { node: 'swatch', pin: 'swatch_in' } },
    ],
  })
  editor.fitView({ padding: 56, maxZoom: 1 })

  // Poll upstream node values every tick. Two purposes:
  //   1) Sparkline buffer — push the upstream slider value into the rolling buffer + bump the
  //      widget value so the custom widget redraws (the actual samples live in module state).
  //   2) ColorPreview live tint — push the upstream picker's `state.tint` into the swatch
  //      widget's `value`. The custom widget reads `value` directly so picking a colour upstream
  //      paints the swatch immediately.
  // A central poller is simpler than wiring widget:changed / edge:connected listeners and gives
  // a steady redraw cadence — important for the sparkline scroll effect.
  const sparkId = 'spark'
  const swatchId = 'swatch'
  const tick = (): void => {
    // Sparkline.
    const sparkEdge = [...editor.graph.edges()].find((e) => String(e.to.node) === sparkId)
    const sparkSrc = sparkEdge ? editor.graph.getNode(sparkEdge.from.node) : undefined
    const sparkVal = sparkSrc ? Number(((sparkSrc.state as Record<string, unknown>)['value'] ?? 0)) : 0
    const buf = SAMPLES_PER_NODE.get(sparkId) ?? []
    buf.push(sparkVal)
    while (buf.length > SAMPLE_CAP) buf.shift()
    SAMPLES_PER_NODE.set(sparkId, buf)
    editor.setWidgetValue(sparkId as never, 'spark', buf.length, { ephemeral: true })

    // ColorPreview.
    const swatchEdge = [...editor.graph.edges()].find((e) => String(e.to.node) === swatchId)
    const swatchSrc = swatchEdge ? editor.graph.getNode(swatchEdge.from.node) : undefined
    const tint = swatchSrc ? String(((swatchSrc.state as Record<string, unknown>)['tint'] ?? '')) : ''
    editor.setWidgetValue(swatchId as never, 'paint', tint, { ephemeral: true })
  }
  // Install the poller as a tiny plugin so its teardown is owned by the editor — when the React
  // component unmounts, the editor is destroyed, plugin disposers run, the interval is cleared.
  // No `dispose()` handle to forward through React state.
  editor.use({
    name: 'preview-nodes:poller',
    install: () => {
      const interval = setInterval(tick, 100)
      return () => { clearInterval(interval); SAMPLES_PER_NODE.delete('spark') }
    },
  })

  return {
    dispose: () => { SAMPLES_PER_NODE.delete('spark') },
  }
}
