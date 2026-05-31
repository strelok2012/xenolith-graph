import { describe, it, expect } from 'vitest'
import {
  computeLinearPolyline,
  computeStepPolyline,
  computeSmoothStepPolyline,
  polylineMidpoint,
  polylineEndTangent,
  polylineArrowHead,
} from './edge-paths.js'
import type { PinLayout } from './layout.js'

const pin = (x: number, y: number, side: 'left' | 'right' = 'right'): PinLayout =>
  ({ x, y, side, id: 'p' as never, label: '' } as never)

describe('computeLinearPolyline', () => {
  it('returns exactly [from, to]', () => {
    const r = computeLinearPolyline(pin(0, 0, 'right'), pin(200, 50, 'left'))
    expect(r).toEqual([{ x: 0, y: 0 }, { x: 200, y: 50 }])
  })
})

describe('computeStepPolyline', () => {
  it('builds a 4-point Z (from → elbow1 → elbow2 → to) with horizontal entry & exit', () => {
    const r = computeStepPolyline(pin(0, 0, 'right'), pin(200, 80, 'left'))
    expect(r).toHaveLength(4)
    expect(r[0]).toEqual({ x: 0, y: 0 })
    expect(r[3]).toEqual({ x: 200, y: 80 })
    // The two elbows share the meet-x; first elbow rides the source y, second rides the target y.
    expect(r[1]!.x).toBe(r[2]!.x)
    expect(r[1]!.y).toBe(0)
    expect(r[2]!.y).toBe(80)
  })

  it('respects pin side — a left-side pin extends leftwards before turning', () => {
    // Source on the LEFT face of its node: the first elbow retreats LEFT of the pin so the
    // wire doesn't route through the node body.
    const r = computeStepPolyline(pin(100, 0, 'left'), pin(300, 0, 'right'))
    expect(r[1]!.x).toBeLessThan(100)
  })
})

describe('computeSmoothStepPolyline', () => {
  it('returns more than 4 points (rounded corners) for a non-degenerate elbow', () => {
    const r = computeSmoothStepPolyline(pin(0, 0, 'right'), pin(200, 80, 'left'))
    expect(r.length).toBeGreaterThan(4)
    expect(r[0]).toEqual({ x: 0, y: 0 })
    expect(r.at(-1)).toEqual({ x: 200, y: 80 })
  })

  it('does NOT throw on a colinear source/target (same y) — falls back to the bare step shape', () => {
    // Regression: my first cut destructured `step` as [a, b, c, d]; when from.y === to.y the
    // step polyline dedups to 3 points (a straight line through the meet x) and c/d became
    // undefined → "Cannot read properties of undefined (reading 'x')" inside the rounding code.
    // Demo (`edge-paths`) hit this on every wire because the showcase rows are y-aligned.
    expect(() => computeSmoothStepPolyline(pin(0, 10, 'right'), pin(200, 10, 'left'))).not.toThrow()
    const r = computeSmoothStepPolyline(pin(0, 10, 'right'), pin(200, 10, 'left'))
    expect(r[0]).toEqual({ x: 0, y: 10 })
    expect(r.at(-1)).toEqual({ x: 200, y: 10 })
  })

  it('falls back to plain step on a degenerate elbow (segment too short to round)', () => {
    // Coincident pins produce a zero-length vertical run; rounding requires non-zero segments,
    // so the smoothed call collapses back to the bare step polyline.
    const a = pin(0, 0, 'right'), b = pin(0, 0, 'left')
    expect(computeSmoothStepPolyline(a, b, 100)).toEqual(computeStepPolyline(a, b))
  })
})

describe('polylineMidpoint', () => {
  it('exact half on a straight segment', () => {
    expect(polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual({ x: 50, y: 0 })
  })

  it('finds the half-arc point across an L (correct seg, not segment midpoint)', () => {
    // Two segs of length 100 each → half = 100 along total arc → exactly the elbow.
    const r = polylineMidpoint([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }])
    expect(r).toEqual({ x: 100, y: 0 })
  })

  it('handles a zero-length segment without dividing by zero', () => {
    const r = polylineMidpoint([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }])
    expect(Number.isFinite(r.x)).toBe(true)
    expect(Number.isFinite(r.y)).toBe(true)
  })

  it('single-point polyline returns that point (graceful)', () => {
    expect(polylineMidpoint([{ x: 7, y: 9 }])).toEqual({ x: 7, y: 9 })
  })
})

describe('polylineEndTangent + polylineArrowHead', () => {
  it('end tangent is the last-segment unit vector', () => {
    const r = polylineEndTangent([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])
    expect(r.x).toBeCloseTo(0)
    expect(r.y).toBeCloseTo(1)
  })

  it('arrowhead tip lands on the last point', () => {
    const [tip] = polylineArrowHead([{ x: 0, y: 0 }, { x: 50, y: 0 }], 8)
    expect(tip).toEqual({ x: 50, y: 0 })
  })
})
