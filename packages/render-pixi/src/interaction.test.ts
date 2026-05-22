import { describe, it, expect } from 'vitest'
import { wheelDeltaToZoomFactor } from './interaction.js'

describe('wheelDeltaToZoomFactor', () => {
  it('positive deltaY zooms out (factor < 1)', () => {
    expect(wheelDeltaToZoomFactor(120)).toBeLessThan(1)
  })

  it('negative deltaY zooms in (factor > 1)', () => {
    expect(wheelDeltaToZoomFactor(-120)).toBeGreaterThan(1)
  })

  it('zero delta is a no-op (factor = 1)', () => {
    expect(wheelDeltaToZoomFactor(0)).toBe(1)
  })

  it('is multiplicative-symmetric: zoom in then back out by the same delta returns to 1', () => {
    const inFactor = wheelDeltaToZoomFactor(-120)
    const outFactor = wheelDeltaToZoomFactor(120)
    expect(inFactor * outFactor).toBeCloseTo(1, 6)
  })

  it('does not overshoot for a single scroll wheel notch (typically deltaY=100)', () => {
    const factor = wheelDeltaToZoomFactor(100)
    // A single notch should be a polite step — not less than half, not more than 90% of current
    expect(factor).toBeGreaterThan(0.5)
    expect(factor).toBeLessThan(0.95)
  })
})
