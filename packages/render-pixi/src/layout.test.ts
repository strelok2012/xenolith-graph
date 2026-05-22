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
