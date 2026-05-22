import { describe, it, expect } from 'vitest'
import { createNodeId, createPinId, type Node } from '@xenolith/core'
import { rectFromPoints, rectIntersects, nodeBounds, type Rect } from './geom.js'

describe('rectFromPoints', () => {
  it('builds a rect from two corner points regardless of order', () => {
    const r = rectFromPoints({ x: 10, y: 20 }, { x: 100, y: 200 })
    expect(r).toEqual<Rect>({ x: 10, y: 20, width: 90, height: 180 })
  })

  it('handles reversed coordinates (drag up-left)', () => {
    const r = rectFromPoints({ x: 100, y: 200 }, { x: 10, y: 20 })
    expect(r).toEqual<Rect>({ x: 10, y: 20, width: 90, height: 180 })
  })

  it('zero-area for identical points', () => {
    const r = rectFromPoints({ x: 50, y: 50 }, { x: 50, y: 50 })
    expect(r).toEqual<Rect>({ x: 50, y: 50, width: 0, height: 0 })
  })

  it('supports negative coordinates', () => {
    const r = rectFromPoints({ x: -50, y: 30 }, { x: 20, y: -10 })
    expect(r).toEqual<Rect>({ x: -50, y: -10, width: 70, height: 40 })
  })
})

describe('rectIntersects', () => {
  it('overlapping rects intersect', () => {
    expect(
      rectIntersects(
        { x: 0,  y: 0,  width: 100, height: 100 },
        { x: 50, y: 50, width: 100, height: 100 },
      ),
    ).toBe(true)
  })

  it('disjoint rects do not intersect', () => {
    expect(
      rectIntersects(
        { x: 0,   y: 0, width: 50, height: 50 },
        { x: 100, y: 0, width: 50, height: 50 },
      ),
    ).toBe(false)
  })

  it('touching edges do not count as intersection (strict)', () => {
    expect(
      rectIntersects(
        { x: 0,  y: 0, width: 50, height: 50 },
        { x: 50, y: 0, width: 50, height: 50 },
      ),
    ).toBe(false)
  })

  it('one fully contained in the other intersects', () => {
    expect(
      rectIntersects(
        { x: 0,  y: 0,  width: 100, height: 100 },
        { x: 25, y: 25, width: 25,  height: 25 },
      ),
    ).toBe(true)
  })
})

describe('nodeBounds', () => {
  function makeNode(position: { x: number; y: number }, size?: { x: number; y: number }): Node {
    return {
      id: createNodeId(),
      type: 'Test',
      position,
      ...(size ? { size } : {}),
      state: {},
      pins: [{ id: createPinId(), kind: 'data', direction: 'in', type: 'float', multiple: false }],
    }
  }

  const tokens = {
    geometry: {
      node: { minWidth: 150, headerHeight: 21, headerPadding: 2 },
      header: { toPinsGap: 15 },
    },
  }

  it('returns a rect at node.position with node.size dimensions', () => {
    const n = makeNode({ x: 100, y: 200 }, { x: 150, y: 70 })
    expect(nodeBounds(n, tokens)).toEqual<Rect>({ x: 100, y: 200, width: 150, height: 70 })
  })

  it('falls back to minWidth and header+gap when size is missing', () => {
    const n = makeNode({ x: 0, y: 0 })
    const bounds = nodeBounds(n, tokens)
    expect(bounds.x).toBe(0)
    expect(bounds.y).toBe(0)
    expect(bounds.width).toBe(150)
    expect(bounds.height).toBe(36)
  })
})
