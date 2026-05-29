import { describe, it, expect } from 'vitest'
import {
  createNodeId,
  createPinId,
  type Node,
  type Pin,
} from '@xenolith/core'
import { computeNodeLayout, type LayoutTokens, type NodeLayout } from './layout.js'

const TOKENS: LayoutTokens = {
  node: { minWidth: 150, headerHeight: 21, headerPadding: 2, innerPaddingX: 4, innerPaddingY: 4 },
  pin:  { diameter: 8, rowSpacing: 10, rowHeight: 11 },
  header: { toPinsGap: 15 },
}

function pin(direction: 'in' | 'out', id = createPinId()): Pin {
  return { id, kind: 'data', direction, type: 'float', multiple: false }
}

function node(opts: { position?: { x: number; y: number }; size?: { x: number; y: number }; pins?: Pin[] } = {}): Node {
  return {
    id: createNodeId(),
    type: 'Test',
    position: opts.position ?? { x: 100, y: 200 },
    size:     opts.size     ?? { x: 150, y: 80 },
    state: {},
    pins: opts.pins ?? [pin('in'), pin('out')],
  }
}

describe('computeNodeLayout — body and header', () => {
  it('body rect equals node.position + node.size', () => {
    const n = node({ position: { x: 100, y: 200 }, size: { x: 150, y: 80 } })
    const l = computeNodeLayout(n, TOKENS)
    expect(l.body).toEqual({ x: 100, y: 200, width: 150, height: 80 })
  })

  it('header sits on top of the body with token height', () => {
    const n = node({ position: { x: 100, y: 200 }, size: { x: 150, y: 80 } })
    const l = computeNodeLayout(n, TOKENS)
    expect(l.header).toEqual({ x: 100, y: 200, width: 150, height: 21 })
  })

  it('falls back to minWidth when node.size is missing', () => {
    const base = node()
    const n: Node = {
      id: base.id,
      type: base.type,
      position: base.position,
      state: base.state,
      pins: base.pins,
    }
    const l = computeNodeLayout(n, TOKENS)
    expect(l.body.width).toBe(150)
    expect(l.body.height).toBeGreaterThanOrEqual(TOKENS.node.headerHeight)
  })

  it('derives height from pin rows when node.size is missing — body contains every pin', () => {
    const n: Node = {
      id: createNodeId(), type: 'Test', position: { x: 0, y: 0 }, state: {},
      pins: [pin('in'), pin('in'), pin('in'), pin('out')], // 3 input rows
    }
    const l = computeNodeLayout(n, TOKENS)
    const bottom = l.body.y + l.body.height
    for (const p of l.pins) {
      expect(p.y).toBeLessThanOrEqual(bottom) // no pin floats below the body
    }
    // taller than a 1-row node
    const single: Node = { ...n, pins: [pin('in'), pin('out')] }
    expect(l.body.height).toBeGreaterThan(computeNodeLayout(single, TOKENS).body.height)
  })
})

describe('computeNodeLayout — pin positions', () => {
  it('places an input pin on the left edge of the body', () => {
    const inPin = pin('in')
    const n = node({ position: { x: 100, y: 200 }, pins: [inPin] })
    const l = computeNodeLayout(n, TOKENS)
    const p = l.pins.find((x) => x.id === inPin.id)!
    expect(p.side).toBe('left')
    expect(p.x).toBe(100)
  })

  it('places an output pin on the right edge of the body', () => {
    const outPin = pin('out')
    const n = node({ position: { x: 100, y: 200 }, size: { x: 150, y: 80 }, pins: [outPin] })
    const l = computeNodeLayout(n, TOKENS)
    const p = l.pins.find((x) => x.id === outPin.id)!
    expect(p.side).toBe('right')
    expect(p.x).toBe(250)
  })

  it('first input pin lives below header + header-to-pins gap', () => {
    const inPin = pin('in')
    const n = node({ position: { x: 0, y: 0 }, pins: [inPin] })
    const l = computeNodeLayout(n, TOKENS)
    const p = l.pins.find((x) => x.id === inPin.id)!
    const expectedY = TOKENS.node.headerHeight + TOKENS.header.toPinsGap + TOKENS.pin.rowHeight / 2
    expect(p.y).toBeCloseTo(expectedY, 6)
  })

  it('stacks multiple inputs with rowSpacing between rows', () => {
    const a = pin('in')
    const b = pin('in')
    const n = node({ position: { x: 0, y: 0 }, pins: [a, b] })
    const l = computeNodeLayout(n, TOKENS)
    const pa = l.pins.find((x) => x.id === a.id)!
    const pb = l.pins.find((x) => x.id === b.id)!
    expect(pb.y - pa.y).toBeCloseTo(TOKENS.pin.rowSpacing + TOKENS.pin.rowHeight, 6)
  })

  it('inputs and outputs are independently indexed (each side starts at row 0)', () => {
    const a = pin('in')
    const b = pin('out')
    const n = node({ position: { x: 0, y: 0 }, pins: [a, b] })
    const l = computeNodeLayout(n, TOKENS)
    const pa = l.pins.find((x) => x.id === a.id)!
    const pb = l.pins.find((x) => x.id === b.id)!
    expect(pa.y).toBeCloseTo(pb.y, 6)
  })

  it('pin order follows the node.pins array order within each side', () => {
    const a = pin('in')
    const b = pin('in')
    const c = pin('in')
    const n = node({ pins: [c, a, b] })
    const l = computeNodeLayout(n, TOKENS)
    const ys = [c, a, b].map((p) => l.pins.find((x) => x.id === p.id)!.y)
    expect(ys[0]).toBeLessThan(ys[1]!)
    expect(ys[1]).toBeLessThan(ys[2]!)
  })

  it('emits one layout entry per pin', () => {
    const pins = [pin('in'), pin('in'), pin('out'), pin('out'), pin('out')]
    const n = node({ pins })
    const l = computeNodeLayout(n, TOKENS)
    expect(l.pins.map((p) => p.id).sort()).toEqual(pins.map((p) => p.id).sort())
  })

  it('shifts with node.position — pin x/y move together with the node', () => {
    const p = pin('in')
    const a = computeNodeLayout(node({ position: { x: 0, y: 0 }, pins: [p] }), TOKENS)
    const b = computeNodeLayout(node({ position: { x: 50, y: 70 }, pins: [p] }), TOKENS)
    const pa = a.pins.find((x) => x.id === p.id)!
    const pb = b.pins.find((x) => x.id === p.id)!
    expect(pb.x - pa.x).toBe(50)
    expect(pb.y - pa.y).toBe(70)
  })
})

describe('computeNodeLayout — return type sanity', () => {
  it('returns a fresh object each call (no aliasing)', () => {
    const n = node()
    const a: NodeLayout = computeNodeLayout(n, TOKENS)
    const b: NodeLayout = computeNodeLayout(n, TOKENS)
    expect(a).not.toBe(b)
    expect(a.pins).not.toBe(b.pins)
  })
})

import { measureNodeSize, type NodeSizeTokens, type TextMeasurer } from './layout.js'

// Fake monospace-ish measurer: every glyph is `fontSize * 0.6` wide. Deterministic, no canvas.
const fakeMeasure: TextMeasurer = (text, fontSize) => text.length * fontSize * 0.6

const SIZE_TOKENS: NodeSizeTokens = {
  node:   { minWidth: 150, headerHeight: 21, headerPadding: 2 },
  pin:    { diameter: 8, rowSpacing: 10, rowHeight: 11, labelGap: 7 },
  header: { toPinsGap: 15, chevronSize: 16, titleGap: 5 },
  typography: { titleSize: 12, titleWeight: 700, labelSize: 10, labelWeight: 400 },
}

function labelledPin(direction: 'in' | 'out', label: string): Pin {
  return { id: createPinId(), kind: 'data', direction, type: 'object', multiple: direction === 'out', label }
}

describe('measureNodeSize', () => {
  it('never shrinks below minWidth for short content', () => {
    const n: Node = {
      id: createNodeId(), type: 'X', position: { x: 0, y: 0 }, state: {},
      pins: [labelledPin('in', 'a'), labelledPin('out', 'b')],
    }
    expect(measureNodeSize(n, 'X', SIZE_TOKENS, fakeMeasure).x).toBe(150)
  })

  it('widens to fit a title up to a cap, then caps (renderer ellipsises instead of growing)', () => {
    const make = (title: string): number =>
      measureNodeSize({ id: createNodeId(), type: 'T', position: { x: 0, y: 0 }, state: {}, pins: [] }, title, SIZE_TOKENS, fakeMeasure).x
    // A title past minWidth widens the node…
    expect(make('ConditioningCombine')).toBeGreaterThan(150)
    // …but two very long titles of DIFFERENT lengths cap to the SAME width — the node stops growing
    // and the renderer ellipsises the title instead.
    const a = make('ConditioningCombineAdvancedVeryLong')
    const b = make(`${'ConditioningCombineAdvancedVeryLong'}EvenMoreAndMoreAndMore`)
    expect(a).toBe(b)
  })

  it('widens (uncapped) to fit a long PIN label — pins always fit', () => {
    const longLabel = 'a_really_long_pin_label_that_exceeds_the_title_cap_by_a_lot'
    const n: Node = {
      id: createNodeId(), type: 'X', position: { x: 0, y: 0 }, state: {},
      pins: [labelledPin('in', longLabel)],
    }
    const w = measureNodeSize(n, 'X', SIZE_TOKENS, fakeMeasure).x
    const sidePad = SIZE_TOKENS.pin.diameter / 2 + SIZE_TOKENS.pin.labelGap
    expect(w).toBeGreaterThanOrEqual(sidePad + fakeMeasure(longLabel, 10, 400) + sidePad)
  })

  it('widens so an input label and the opposite output label never overlap', () => {
    const inL = 'conditioning_to'
    const outL = 'CONDITIONING'
    const n: Node = {
      id: createNodeId(), type: 'ConditioningConcat', position: { x: 0, y: 0 }, state: {},
      pins: [labelledPin('in', inL), labelledPin('in', 'conditioning_from'), labelledPin('out', outL)],
    }
    const w = measureNodeSize(n, 'ConditioningConcat', SIZE_TOKENS, fakeMeasure).x
    const sidePad = SIZE_TOKENS.pin.diameter / 2 + SIZE_TOKENS.pin.labelGap
    const inW = fakeMeasure(inL, 10, 400)
    const outW = fakeMeasure(outL, 10, 400)
    // left label right edge must clear the right label's left edge
    expect(w).toBeGreaterThanOrEqual(sidePad + inW + outW + sidePad)
  })

  it('returns naturalHeight for y (matches a node carrying no explicit size)', () => {
    const n: Node = {
      id: createNodeId(), type: 'X', position: { x: 0, y: 0 }, state: {},
      pins: [labelledPin('in', 'a'), labelledPin('in', 'b'), labelledPin('out', 'c')],
    }
    const { y } = measureNodeSize(n, 'X', SIZE_TOKENS, fakeMeasure)
    // 2 input rows → headerHeight + toPinsGap + (2*rowHeight + rowSpacing) + toPinsGap
    expect(y).toBe(21 + 15 + (2 * 11 + 10) + 15)
  })
})

const WIDGET_TOKENS: NodeSizeTokens = {
  ...SIZE_TOKENS,
  widget: { rowHeight: 18, gap: 6, controlMinWidth: 60 },
}

describe('measureNodeSize — widgets', () => {
  const base: Pick<Node, 'id' | 'type' | 'position' | 'state'> = {
    id: createNodeId(), type: 'X', position: { x: 0, y: 0 }, state: {},
  }
  const oneRow = [labelledPin('in', 'a'), labelledPin('out', 'b')]

  it('adds a widget block below the pins (taller than the same node without widgets)', () => {
    const without: Node = { ...base, pins: oneRow }
    const withW: Node = {
      ...base, pins: oneRow,
      widgets: [
        { id: 'n', type: 'number', label: 'N', key: 'n' },
        { id: 't', type: 'toggle', label: 'T', key: 't' },
      ],
    }
    const h0 = measureNodeSize(without, 'X', WIDGET_TOKENS, fakeMeasure).y
    const h2 = measureNodeSize(withW, 'X', WIDGET_TOKENS, fakeMeasure).y
    // block = leading gap + 2*rowHeight + 1 between-gap = 6 + 36 + 6 = 48
    expect(h2).toBe(h0 + (6 + 2 * 18 + 6))
  })

  it('multiline text widget is taller than a single-row widget', () => {
    const single: Node = { ...base, pins: oneRow, widgets: [{ id: 't', type: 'text', label: 'T', key: 't' }] }
    const multi: Node = { ...base, pins: oneRow, widgets: [{ id: 't', type: 'text', label: 'T', key: 't', multiline: true }] }
    expect(measureNodeSize(multi, 'X', WIDGET_TOKENS, fakeMeasure).y)
      .toBeGreaterThan(measureNodeSize(single, 'X', WIDGET_TOKENS, fakeMeasure).y)
  })

  it('widens to fit a wide widget (label + control)', () => {
    const n: Node = {
      ...base, pins: [],
      widgets: [{ id: 's', type: 'slider', label: 'A very long widget label indeed', key: 's', min: 0, max: 1 }],
    }
    const w = measureNodeSize(n, 'X', WIDGET_TOKENS, fakeMeasure).x
    expect(w).toBeGreaterThan(150)
  })
})

describe('computeNodeLayout — exec pins at top (UE layout)', () => {
  const execPin = (direction: 'in' | 'out', id = createPinId()): Pin =>
    ({ id, kind: 'exec', direction, type: 'exec', multiple: false })

  it('places exec pins in the top row and data below, regardless of declaration order', () => {
    const eIn = createPinId(), eOut = createPinId(), dIn = createPinId(), dOut = createPinId()
    // declared data-first to prove ordering is by KIND, not declaration order
    const n = node({ pins: [pin('in', dIn), execPin('in', eIn), pin('out', dOut), execPin('out', eOut)] })
    const l = computeNodeLayout(n, TOKENS)
    const Y = (id: Pin['id']) => l.pins.find((p) => p.id === id)!.y
    const side = (id: Pin['id']) => l.pins.find((p) => p.id === id)!.side
    expect(Y(eIn)).toBe(Y(eOut))         // exec in/out share the top row
    expect(Y(dIn)).toBe(Y(dOut))         // data in/out share their row
    expect(Y(eIn)).toBeLessThan(Y(dIn))  // exec row sits above the data row
    expect(side(eIn)).toBe('left')
    expect(side(eOut)).toBe('right')
  })

  it('stacks multiple exec outputs (Sequence) above the data band (not hoisted)', () => {
    const eIn = createPinId(), e0 = createPinId(), e1 = createPinId(), d = createPinId()
    const n = node({ pins: [execPin('in', eIn), execPin('out', e0), execPin('out', e1), pin('out', d)] })
    const l = computeNodeLayout(n, TOKENS)
    const Y = (id: Pin['id']) => l.pins.find((p) => p.id === id)!.y
    expect(Y(e0)).toBeGreaterThan(n.position.y + TOKENS.node.headerHeight) // 2 exec-outs stay in body
    expect(Y(e0)).toBeLessThan(Y(e1)) // two stacked exec-out rows
    expect(Y(e1)).toBeLessThan(Y(d))  // data pin below the 2-row exec band
  })
})

describe('computeNodeLayout — single exec hoisted onto the header line', () => {
  const execPin = (direction: 'in' | 'out', id = createPinId(), label?: string): Pin =>
    ({ id, kind: 'exec', direction, type: 'exec', multiple: false, ...(label ? { label } : {}) })
  const noSize = (pins: Pin[]): Node =>
    ({ id: createNodeId(), type: 'T', position: { x: 100, y: 200 }, state: {}, pins })

  it('places a lone exec-in/out on the header line (y = headerHeight/2) at the side edges', () => {
    const eIn = createPinId(), eOut = createPinId(), dIn = createPinId(), dOut = createPinId()
    const n = node({ pins: [execPin('in', eIn), execPin('out', eOut), pin('in', dIn), pin('out', dOut)] })
    const l = computeNodeLayout(n, TOKENS)
    const P = (id: Pin['id']) => l.pins.find((p) => p.id === id)!
    expect(P(eIn).y).toBe(n.position.y + TOKENS.node.headerHeight / 2) // on the header line
    expect(P(eOut).y).toBe(n.position.y + TOKENS.node.headerHeight / 2)
    expect(P(eIn).x).toBe(n.position.x)                // header left edge
    expect(P(eOut).x).toBe(n.position.x + n.size!.x)   // header right edge
    expect(P(dIn).y).toBeGreaterThan(n.position.y + TOKENS.node.headerHeight) // data in the body
    expect(P(dIn).y).toBe(P(dOut).y)
  })

  it('a LABELLED single exec stays in the body band (not hoisted)', () => {
    const eOut = createPinId()
    const n = node({ pins: [execPin('out', eOut, 'then'), pin('in')] })
    const l = computeNodeLayout(n, TOKENS)
    expect(l.pins.find((p) => p.id === eOut)!.y).toBeGreaterThan(n.position.y + TOKENS.node.headerHeight)
  })

  it('hoisting a single exec pair saves a body row (naturalHeight)', () => {
    const hoisted = noSize([execPin('in'), execPin('out'), pin('in'), pin('out')]) // 1 data body row
    const dataOnly = noSize([pin('in'), pin('out')])                                // 1 data body row
    expect(computeNodeLayout(hoisted, TOKENS).body.height).toBe(computeNodeLayout(dataOnly, TOKENS).body.height)
  })
})
