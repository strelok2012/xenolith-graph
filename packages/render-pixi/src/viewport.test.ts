import { describe, it, expect, vi } from 'vitest'
import { Viewport, type ApplyTarget } from './viewport.js'

function makeTarget(): ApplyTarget {
  return {
    scale: { x: 1, y: 1 },
    position: { x: 0, y: 0 },
  }
}

describe('Viewport', () => {
  it('initial state defaults to identity (x=0, y=0, zoom=1)', () => {
    const v = new Viewport(makeTarget())
    expect(v.state).toEqual({ x: 0, y: 0, zoom: 1 })
  })

  it('accepts an initial state in the constructor', () => {
    const v = new Viewport(makeTarget(), { x: 50, y: -20, zoom: 1.5 })
    expect(v.state).toEqual({ x: 50, y: -20, zoom: 1.5 })
  })

  it('applies state to the target on construction', () => {
    const target = makeTarget()
    new Viewport(target, { x: 100, y: 200, zoom: 2 })
    expect(target.position).toEqual({ x: 100, y: 200 })
    expect(target.scale).toEqual({ x: 2, y: 2 })
  })

  it('pan adds the delta to position', () => {
    const target = makeTarget()
    const v = new Viewport(target)
    v.pan(50, -30)
    expect(v.state).toEqual({ x: 50, y: -30, zoom: 1 })
    expect(target.position).toEqual({ x: 50, y: -30 })
  })

  it('zoomAt updates zoom and anchors the focal point', () => {
    const target = makeTarget()
    const v = new Viewport(target)
    const focal = { x: 400, y: 300 }
    v.zoomAt(focal, 2)
    expect(v.state.zoom).toBeCloseTo(2, 6)
    // After zoom, world point under focal remains under focal
    const worldUnderFocal = {
      x: (focal.x - v.state.x) / v.state.zoom,
      y: (focal.y - v.state.y) / v.state.zoom,
    }
    // Before zoom that world point was (400, 300); should be same after
    expect(worldUnderFocal.x).toBeCloseTo(400, 6)
    expect(worldUnderFocal.y).toBeCloseTo(300, 6)
  })

  it('setState replaces the entire state', () => {
    const target = makeTarget()
    const v = new Viewport(target)
    v.setState({ x: 10, y: 20, zoom: 3 })
    expect(v.state).toEqual({ x: 10, y: 20, zoom: 3 })
    expect(target.position).toEqual({ x: 10, y: 20 })
    expect(target.scale).toEqual({ x: 3, y: 3 })
  })

  it('state getter returns a copy — mutating it does not affect viewport', () => {
    const v = new Viewport(makeTarget())
    const s = v.state
    s.x = 999
    expect(v.state.x).toBe(0)
  })

  it('emits viewport:changed on every state change with the new state', () => {
    const v = new Viewport(makeTarget())
    const handler = vi.fn()
    v.on(handler)
    v.pan(10, 0)
    v.zoomAt({ x: 0, y: 0 }, 2)
    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler.mock.calls[1]?.[0].zoom).toBeCloseTo(2, 6)
  })

  it('does not emit on a no-op pan (delta 0, 0)', () => {
    const v = new Viewport(makeTarget())
    const handler = vi.fn()
    v.on(handler)
    v.pan(0, 0)
    expect(handler).not.toHaveBeenCalled()
  })

  it('off / unsubscribe stops subsequent events', () => {
    const v = new Viewport(makeTarget())
    const handler = vi.fn()
    const off = v.on(handler)
    v.pan(1, 0)
    off()
    v.pan(1, 0)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('reset returns to the default identity state', () => {
    const v = new Viewport(makeTarget(), { x: 50, y: 50, zoom: 2 })
    v.reset()
    expect(v.state).toEqual({ x: 0, y: 0, zoom: 1 })
  })
})
