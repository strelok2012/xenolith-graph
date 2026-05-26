import { describe, it, expect } from 'vitest'
import { computeEdgePath, sampleBezier, endTangent, arrowHead, type EdgeTokens, type EdgePath } from './bezier.js'
import { createPinId, type PinId } from '@xenolith/core'
import type { PinLayout } from './layout.js'

const TOKENS: EdgeTokens = {
  bezierTension: 0.5,
  minHorizontalSpread: 50,
}

function out(x: number, y: number, id: PinId = createPinId()): PinLayout {
  return { id, x, y, side: 'right' }
}

function inp(x: number, y: number, id: PinId = createPinId()): PinLayout {
  return { id, x, y, side: 'left' }
}

describe('computeEdgePath — endpoints', () => {
  it('start equals the from-pin coordinate', () => {
    const path = computeEdgePath(out(10, 20), inp(200, 80), TOKENS)
    expect(path.start).toEqual({ x: 10, y: 20 })
  })

  it('end equals the to-pin coordinate', () => {
    const path = computeEdgePath(out(10, 20), inp(200, 80), TOKENS)
    expect(path.end).toEqual({ x: 200, y: 80 })
  })
})

describe('computeEdgePath — control-point direction by pin side', () => {
  it('right-side from-pin places c1 to the right of start', () => {
    const path = computeEdgePath(out(100, 50), inp(400, 50), TOKENS)
    expect(path.c1.x).toBeGreaterThan(path.start.x)
  })

  it('left-side to-pin places c2 to the left of end', () => {
    const path = computeEdgePath(out(100, 50), inp(400, 50), TOKENS)
    expect(path.c2.x).toBeLessThan(path.end.x)
  })

  it('left-side from-pin places c1 to the left of start (reverse connection)', () => {
    const path = computeEdgePath(inp(400, 50), out(100, 50), TOKENS)
    expect(path.c1.x).toBeLessThan(path.start.x)
  })

  it('right-side to-pin places c2 to the right of end (reverse connection)', () => {
    const path = computeEdgePath(inp(400, 50), out(100, 50), TOKENS)
    expect(path.c2.x).toBeGreaterThan(path.end.x)
  })

  it('control points have the same y as their anchor (UE-style horizontal handles)', () => {
    const path = computeEdgePath(out(100, 50), inp(400, 200), TOKENS)
    expect(path.c1.y).toBe(50)
    expect(path.c2.y).toBe(200)
  })
})

describe('computeEdgePath — spread scaling', () => {
  it('horizontal spread scales with horizontal distance', () => {
    const close = computeEdgePath(out(0, 0), inp(200, 0), TOKENS)
    const far   = computeEdgePath(out(0, 0), inp(1000, 0), TOKENS)
    const closeSpread = close.c1.x - close.start.x
    const farSpread   = far.c1.x - far.start.x
    expect(farSpread).toBeGreaterThan(closeSpread)
  })

  it('minimum spread is enforced even for very close pins', () => {
    const path = computeEdgePath(out(100, 0), inp(110, 0), TOKENS)
    expect(path.c1.x - path.start.x).toBeGreaterThanOrEqual(TOKENS.minHorizontalSpread)
  })

  it('backward edge (target to the left of source) still bulges outward', () => {
    // from is a right-side out at x=400, to is a left-side in at x=100 — the wire goes BACK.
    const path = computeEdgePath(out(400, 50), inp(100, 50), TOKENS)
    // c1 should still go RIGHT of start (because from.side is 'right')
    expect(path.c1.x).toBeGreaterThan(path.start.x)
    // c2 should still go LEFT of end (because to.side is 'left')
    expect(path.c2.x).toBeLessThan(path.end.x)
  })

  it('spread magnitude is symmetric for the two handles when both are bounded by the same dx', () => {
    const path = computeEdgePath(out(100, 0), inp(500, 0), TOKENS)
    const spread1 = path.c1.x - path.start.x
    const spread2 = path.end.x - path.c2.x
    expect(spread1).toBeCloseTo(spread2, 6)
  })
})

describe('sampleBezier', () => {
  it('returns steps + 1 points', () => {
    const path = computeEdgePath(out(0, 0), inp(100, 0), TOKENS)
    expect(sampleBezier(path, 10)).toHaveLength(11)
  })

  it('first sample equals start, last equals end', () => {
    const path: EdgePath = {
      start: { x: 0, y: 0 },
      c1:    { x: 30, y: 0 },
      c2:    { x: 70, y: 0 },
      end:   { x: 100, y: 0 },
    }
    const pts = sampleBezier(path, 8)
    expect(pts[0]).toEqual(path.start)
    expect(pts[pts.length - 1]).toEqual(path.end)
  })

  it('throws for steps < 1', () => {
    const path: EdgePath = {
      start: { x: 0, y: 0 },
      c1:    { x: 0, y: 0 },
      c2:    { x: 0, y: 0 },
      end:   { x: 0, y: 0 },
    }
    expect(() => sampleBezier(path, 0)).toThrow(/steps/i)
    expect(() => sampleBezier(path, -1)).toThrow(/steps/i)
  })

  it('produces monotonic-x samples for a straight horizontal edge', () => {
    const path = computeEdgePath(out(0, 0), inp(400, 0), TOKENS)
    const pts = sampleBezier(path, 20)
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.x).toBeGreaterThanOrEqual(pts[i - 1]!.x)
    }
  })

  it('samples follow the curve, not the chord, for non-straight paths', () => {
    // The chord midpoint at t=0.5 happens to coincide with the curve midpoint
    // for symmetric S-bends (right-out → left-in with equal handle spreads), so
    // we probe at t=0.25 where the curve clearly bulges away from the chord.
    const path = computeEdgePath(out(0, 0), inp(400, 200), TOKENS)
    const pts = sampleBezier(path, 20)
    const t = 0.25
    const sample = pts[5]!
    const chordAtT = { x: 400 * t, y: 200 * t }
    const distance = Math.hypot(sample.x - chordAtT.x, sample.y - chordAtT.y)
    expect(distance).toBeGreaterThan(10)
  })
})

import { bezierMidpoint } from './bezier.js'

describe('bezierMidpoint', () => {
  it('is the curve point at t=0.5', () => {
    const path: EdgePath = {
      start: { x: 0, y: 0 }, c1: { x: 0, y: 0 }, c2: { x: 0, y: 0 }, end: { x: 0, y: 0 },
    }
    // straight degenerate path → midpoint at origin
    expect(bezierMidpoint(path)).toEqual({ x: 0, y: 0 })
  })

  it('matches the analytic 1/8·3/8·3/8·1/8 weighting', () => {
    const path: EdgePath = {
      start: { x: 0, y: 0 }, c1: { x: 0, y: 100 }, c2: { x: 200, y: 100 }, end: { x: 200, y: 0 },
    }
    const m = bezierMidpoint(path)
    expect(m.x).toBeCloseTo(100, 6)
    expect(m.y).toBeCloseTo(75, 6) // 0.375*100 + 0.375*100 = 75
  })

  it('agrees with the middle sampleBezier sample', () => {
    const path: EdgePath = {
      start: { x: 10, y: 20 }, c1: { x: 60, y: 20 }, c2: { x: 150, y: 80 }, end: { x: 200, y: 80 },
    }
    const mid = sampleBezier(path, 2)[1]!
    const m = bezierMidpoint(path)
    expect(m.x).toBeCloseTo(mid.x, 6)
    expect(m.y).toBeCloseTo(mid.y, 6)
  })
})

describe('endTangent', () => {
  it('points in the direction of travel into the end (horizontal right)', () => {
    const path = computeEdgePath(out(0, 0), inp(200, 0), TOKENS)
    const t = endTangent(path)
    expect(t.x).toBeCloseTo(1, 5)
    expect(t.y).toBeCloseTo(0, 5)
  })

  it('is a unit vector', () => {
    const path = computeEdgePath(out(0, 0), inp(120, 90), TOKENS)
    const t = endTangent(path)
    expect(Math.hypot(t.x, t.y)).toBeCloseTo(1, 5)
  })
})

describe('arrowHead', () => {
  it('places the tip at the path end and the base `size` behind it', () => {
    const path = computeEdgePath(out(0, 0), inp(200, 0), TOKENS)
    const [tip, left, right] = arrowHead(path, 10)
    expect(tip).toEqual({ x: 200, y: 0 })
    expect(left.x).toBeCloseTo(190, 5)
    expect(right.x).toBeCloseTo(190, 5)
    expect(left.y).toBeCloseTo(-5, 5)
    expect(right.y).toBeCloseTo(5, 5)
  })
})
