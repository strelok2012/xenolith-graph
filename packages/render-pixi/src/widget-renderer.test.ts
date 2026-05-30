import { describe, it, expect } from 'vitest'
import { createNodeId, createPinId, type Node, type Pin, type WidgetSpec } from '@xenolith/core'
import { computeWidgetRects, type WidgetLayoutTokens } from './widget-renderer.js'

const GEO: WidgetLayoutTokens = {
  node:   { headerHeight: 21 },
  pin:    { rowSpacing: 10, rowHeight: 11, diameter: 8, labelGap: 7 },
  header: { toPinsGap: 15 },
  widget: { rowHeight: 22, gap: 6, paddingX: 8 },
}

// padX = pin.diameter/2 + labelGap = 4 + 7 = 11

const inPin = (label: string, id?: string): Pin => ({
  id: (id ?? createPinId()) as ReturnType<typeof createPinId>,
  kind: 'data', direction: 'in', type: 'string', multiple: false, label,
})
const outPin = (label: string, id?: string): Pin => ({
  id: (id ?? createPinId()) as ReturnType<typeof createPinId>,
  kind: 'data', direction: 'out', type: 'string', multiple: true, label,
})

function node(widgets: WidgetSpec[], pins: Pin[] = []): Node {
  return { id: createNodeId(), type: 'T', position: { x: 0, y: 0 }, state: {}, pins, widgets }
}

describe('computeWidgetRects — canon (every widget binds to one IN-pin)', () => {
  it('default-value widget on a free pin: visible, inside its pin row, right half', () => {
    const pins = [inPin('name'), outPin('self')]
    const n = node([{ id: 'w', type: 'text', label: '', key: 'name' }], pins)
    const rects = computeWidgetRects(n, 200, GEO, { isPinConnected: () => false })
    // pin row grows to widget.rowHeight (22). Row centre y = 21 + 15 + 22/2 = 47.
    expect(rects).toEqual([{ id: 'w', x: 100, y: Math.round(47 - 22 / 2), width: 89, height: 22 }])
  })

  it("default-value widget hides on connect (visibility = 'whenDisconnected')", () => {
    const pins = [inPin('name'), outPin('self')]
    const n = node([{ id: 'w', type: 'text', label: '', key: 'name' }], pins)
    const rects = computeWidgetRects(n, 200, GEO, { isPinConnected: (k) => k === 'name' })
    expect(rects).toEqual([])
  })

  it("display widget (custom) with explicit visibility='always' stays visible when its pin is connected", () => {
    const pins = [inPin('value'), outPin('out')]
    const n = node([{ id: 'w', type: 'custom', renderer: 'preview', label: '', key: 'value', height: 40, visibility: 'always' }], pins)
    const rects = computeWidgetRects(n, 200, GEO, { isPinConnected: () => true })
    expect(rects).toHaveLength(1)
    // Per-row heights: a custom widget declaring height: 40 grows ITS row to 40 AND renders as a
    // square (width = height) anchored to the right edge — curves/XY-pads/previews want 1:1.
    expect(rects[0]!.height).toBe(40)
    expect(rects[0]!.width).toBe(40)
    expect(rects[0]!.x).toBe(200 - 11 - 40)
  })

  it('hybrid rhythm: a tall custom widget grows ONLY its row; other rows stay at the base height', () => {
    const pins = [inPin('In'), inPin('curve'), outPin('Out')]
    const widgets: WidgetSpec[] = [
      { id: 'curve', type: 'custom', renderer: 'curve', label: '', key: 'curve', height: 120 },
    ]
    const n = node(widgets, pins)
    const rects = computeWidgetRects(n, 300, GEO, { isPinConnected: () => false })
    // Row 1 (curve) = 120 px, square. Row 0 (In/Out, no widget) stays at the base pin row (11).
    expect(rects[0]!.height).toBe(120)
    expect(rects[0]!.width).toBe(120)
    // Row 1 centre = headerH(21) + headerGap(15) + row0H(11) + rowSpacing(10) + row1H/2(60) = 117.
    expect(rects[0]!.y).toBe(Math.round(117 - 120 / 2))
  })

  it('hybrid rhythm: a STANDARD bound widget bumps the uniform base across all pin rows', () => {
    // Two pins, both bound — but only one is to a custom-height widget. The standard widget bumps
    // the base; the custom widget grows its row further. Rows: base = max(11,22)=22; row 0 = 22;
    // row 1 = max(22, 60) = 60.
    const pins = [inPin('flag'), inPin('chart'), outPin('Out')]
    const widgets: WidgetSpec[] = [
      { id: 'flag',  type: 'toggle', label: '', key: 'flag'  },
      { id: 'chart', type: 'custom', renderer: 'preview', label: '', key: 'chart', height: 60 },
    ]
    const n = node(widgets, pins)
    const rects = computeWidgetRects(n, 300, GEO, { isPinConnected: () => false })
    const flag  = rects.find((r) => r.id === 'flag')!
    const chart = rects.find((r) => r.id === 'chart')!
    expect(flag.height).toBe(22)
    expect(chart.height).toBe(60)
    // Row 0 (flag) centre = 21 + 15 + 22/2 = 47.
    expect(flag.y).toBe(Math.round(47 - 22 / 2))
    // Row 1 (chart) centre = 21 + 15 + 22 + 10 + 60/2 = 98.
    expect(chart.y).toBe(Math.round(98 - 60 / 2))
  })

  it('auto-binds via widget.key when pinKey override is absent', () => {
    const pins = [inPin('priority'), outPin('self')]
    const n = node([{ id: 'w', type: 'number', label: '', key: 'priority' }], pins)
    const rects = computeWidgetRects(n, 200, GEO, { isPinConnected: () => false })
    expect(rects).toHaveLength(1)
  })

  it('pinKey override wins over key for the binding', () => {
    const pins = [inPin('value'), outPin('self')]
    const n = node([{ id: 'w', type: 'text', label: '', key: 'whatever', pinKey: 'value' }], pins)
    const rects = computeWidgetRects(n, 200, GEO, { isPinConnected: () => false })
    expect(rects).toHaveLength(1)
  })

  it('a widget that cannot resolve its pin is silently dropped (no rect)', () => {
    const pins = [outPin('self')] // no IN-pin
    const n = node([{ id: 'w', type: 'text', label: '', key: 'name' }], pins)
    expect(computeWidgetRects(n, 200, GEO, { isPinConnected: () => false })).toEqual([])
  })
})

describe('computeWidgetRects — free-floating custom widgets (no matching pin)', () => {
  it('a custom widget whose key matches no pin renders in a body band with its declared height', () => {
    const pins = [outPin('definition')] // no IN-pin labeled "fields"
    const w: WidgetSpec[] = [
      { id: 'fields', type: 'custom', renderer: 'schema', label: '', key: 'fields', height: 200 },
    ]
    const n = node(w, pins)
    const rects = computeWidgetRects(n, 300, GEO, { isPinConnected: () => false })
    expect(rects).toHaveLength(1)
    expect(rects[0]!.height).toBe(200)
    // Free band spans full content column (padX = 11).
    expect(rects[0]!.x).toBe(11)
    expect(rects[0]!.width).toBe(300 - 22)
    // yStart = headerH(21) + headerGap(15) + pinBand(1 row * 11) + widgetGap(6) = 53.
    expect(rects[0]!.y).toBe(53)
  })

  it('a standard widget with no matching pin stays orphan-dropped (free band is custom-only)', () => {
    const pins = [outPin('out')]
    const w: WidgetSpec[] = [{ id: 'orphan', type: 'number', label: '', key: 'missing' }]
    const n = node(w, pins)
    expect(computeWidgetRects(n, 200, GEO, { isPinConnected: () => false })).toEqual([])
  })
})

describe('computeWidgetRects — actions row (button widgets)', () => {
  it('a single button stretches across the label columns under the pin block', () => {
    const pins = [inPin('name'), outPin('self')]
    const w: WidgetSpec[] = [
      { id: 'name', type: 'text', label: '', key: 'name' },
      { id: 'add', type: 'button', label: '+ add field', action: 'addField' },
    ]
    const n = node(w, pins)
    const rects = computeWidgetRects(n, 200, GEO, { isPinConnected: () => false })
    const btn = rects.find((r) => r.id === 'add')!
    // pinRowsHeight (rowH 22, 1 row) = 22. yStart = 21 + 15 + 22 + gap(6) = 64.
    expect(btn).toEqual({ id: 'add', x: 11, y: 64, width: 178, height: 22 })
  })

  it('multiple buttons stack with widget.gap between them', () => {
    const pins = [inPin('name'), outPin('self')]
    const w: WidgetSpec[] = [
      { id: 'a', type: 'button', label: '+', action: 'a' },
      { id: 'b', type: 'button', label: '-', action: 'b' },
    ]
    const n = node(w, pins)
    const rects = computeWidgetRects(n, 200, GEO, { isPinConnected: () => false })
    expect(rects[0]!.y).toBe(53) // pinRow with no visible bound widget → rowH stays 11; y = 21+15+11+6 = 53
    expect(rects[1]!.y).toBe(53 + 22 + 6)
  })
})

describe('computeWidgetRects — degenerate inputs', () => {
  it('returns [] when the node has no widgets', () => {
    expect(computeWidgetRects(node([]), 200, GEO)).toEqual([])
    const bare: Node = { id: createNodeId(), type: 'T', position: { x: 0, y: 0 }, state: {}, pins: [] }
    expect(computeWidgetRects(bare, 200, GEO)).toEqual([])
  })
})
