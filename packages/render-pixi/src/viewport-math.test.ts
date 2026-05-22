import { describe, it, expect } from 'vitest'
import {
  screenToWorld,
  worldToScreen,
  zoomAt,
  snapToGrid,
  clampZoom,
  computeDragTarget,
  type ViewportState,
} from './viewport-math.js'

const v0: ViewportState = { x: 0, y: 0, zoom: 1 }

describe('screenToWorld / worldToScreen', () => {
  it('round-trip identity at default viewport', () => {
    const screen = { x: 123, y: 456 }
    const world = screenToWorld(screen, v0)
    expect(worldToScreen(world, v0)).toEqual(screen)
  })

  it('round-trip identity at non-default viewport', () => {
    const v: ViewportState = { x: 50, y: -30, zoom: 1.5 }
    const screen = { x: 200, y: 300 }
    const world = screenToWorld(screen, v)
    const back = worldToScreen(world, v)
    expect(back.x).toBeCloseTo(screen.x, 6)
    expect(back.y).toBeCloseTo(screen.y, 6)
  })

  it('world (0,0) sits at the viewport origin in screen coords', () => {
    const v: ViewportState = { x: 100, y: 200, zoom: 1 }
    expect(worldToScreen({ x: 0, y: 0 }, v)).toEqual({ x: 100, y: 200 })
  })

  it('zoom scales the world space — twice the zoom moves twice the screen pixels per world pixel', () => {
    const v: ViewportState = { x: 0, y: 0, zoom: 2 }
    expect(worldToScreen({ x: 10, y: 5 }, v)).toEqual({ x: 20, y: 10 })
  })
})

describe('zoomAt — focal zoom keeps a chosen screen point anchored', () => {
  it('the focal world point under the cursor remains under the cursor after zoom', () => {
    const v: ViewportState = { x: 0, y: 0, zoom: 1 }
    const focal = { x: 400, y: 300 }
    const worldBefore = screenToWorld(focal, v)
    const v2 = zoomAt(v, focal, 1.5)
    const worldAfter = screenToWorld(focal, v2)
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6)
  })

  it('zooming by factor multiplies the zoom level', () => {
    const v: ViewportState = { x: 0, y: 0, zoom: 1 }
    expect(zoomAt(v, { x: 0, y: 0 }, 2).zoom).toBeCloseTo(2, 6)
    expect(zoomAt(v, { x: 0, y: 0 }, 0.5).zoom).toBeCloseTo(0.5, 6)
  })

  it('clamps zoom to provided min/max', () => {
    const v: ViewportState = { x: 0, y: 0, zoom: 1 }
    expect(zoomAt(v, { x: 0, y: 0 }, 10, [0.25, 4]).zoom).toBe(4)
    expect(zoomAt(v, { x: 0, y: 0 }, 0.01, [0.25, 4]).zoom).toBe(0.25)
  })

  it('does not return the same object (immutable update)', () => {
    const v: ViewportState = { x: 0, y: 0, zoom: 1 }
    const v2 = zoomAt(v, { x: 0, y: 0 }, 2)
    expect(v2).not.toBe(v)
    expect(v.zoom).toBe(1)
  })
})

describe('clampZoom', () => {
  it.each([
    [0.5, 0.25, 4, 0.5],
    [10, 0.25, 4, 4],
    [0.01, 0.25, 4, 0.25],
    [1, 0.25, 4, 1],
  ])('clampZoom(%f, %f, %f) === %f', (z, min, max, expected) => {
    expect(clampZoom(z, min, max)).toBe(expected)
  })
})

describe('snapToGrid', () => {
  it('snaps to the nearest multiple of cell size (Math.round semantics: 0.5 rounds up)', () => {
    expect(snapToGrid({ x: 7, y: 11 }, 8)).toEqual({ x: 8, y: 8 })
    expect(snapToGrid({ x: 3, y: 4 }, 8)).toEqual({ x: 0, y: 8 })  // 4/8 = 0.5 → rounds to 1
    expect(snapToGrid({ x: 20, y: 16 }, 8)).toEqual({ x: 24, y: 16 })  // 20/8 = 2.5 → rounds to 3
  })

  it('snaps negative coordinates correctly', () => {
    expect(snapToGrid({ x: -3, y: -7 }, 8)).toEqual({ x: 0, y: -8 })
    expect(snapToGrid({ x: -20, y: -16 }, 8)).toEqual({ x: -24, y: -16 })
  })

  it('cellSize 1 is a no-op rounding (still integer-snapped)', () => {
    expect(snapToGrid({ x: 3.7, y: 4.2 }, 1)).toEqual({ x: 4, y: 4 })
  })

  it('throws on non-positive cell size', () => {
    expect(() => snapToGrid({ x: 0, y: 0 }, 0)).toThrow(/cellSize/i)
    expect(() => snapToGrid({ x: 0, y: 0 }, -8)).toThrow(/cellSize/i)
  })
})

describe('computeDragTarget', () => {
  it('with snap=null returns initial + delta unchanged', () => {
    expect(computeDragTarget({ x: 100, y: 50 }, { x: 33, y: -7 }, null)).toEqual({ x: 133, y: 43 })
  })

  it('with snap snaps the resulting position to the grid', () => {
    // initial = (100, 50), delta = (33, -7) → raw (133, 43) → snap 8 → (136, 40)
    expect(computeDragTarget({ x: 100, y: 50 }, { x: 33, y: -7 }, 8)).toEqual({ x: 136, y: 40 })
  })

  it('zero delta with snap rounds the initial position to the nearest cell', () => {
    expect(computeDragTarget({ x: 7, y: 11 }, { x: 0, y: 0 }, 8)).toEqual({ x: 8, y: 8 })
  })

  it('throws if snap is non-positive', () => {
    expect(() => computeDragTarget({ x: 0, y: 0 }, { x: 0, y: 0 }, 0)).toThrow(/cellSize/i)
  })
})
