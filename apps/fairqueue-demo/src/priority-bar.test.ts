import { describe, it, expect } from 'vitest'
import { barFraction, pointerToValue, SCALE_MAX } from './priority-bar.js'

describe('barFraction', () => {
  it('puts the equilibrium (1.0×) at the midpoint', () => {
    expect(barFraction(1)).toBeCloseTo(0.5)
  })
  it('clamps at full scale and floors non-positive/NaN at 0', () => {
    expect(barFraction(SCALE_MAX)).toBe(1)
    expect(barFraction(SCALE_MAX * 5)).toBe(1)
    expect(barFraction(0)).toBe(0)
    expect(barFraction(-3)).toBe(0)
    expect(barFraction(NaN)).toBe(0)
  })
})

describe('pointerToValue', () => {
  it('is the inverse of barFraction across the bar', () => {
    const width = 120
    expect(pointerToValue(width / 2, width)).toBeCloseTo(1)
    expect(pointerToValue(0, width)).toBe(0)
    expect(pointerToValue(width, width)).toBe(SCALE_MAX)
  })
  it('clamps out-of-bounds x into [0, SCALE_MAX]', () => {
    expect(pointerToValue(-50, 120)).toBe(0)
    expect(pointerToValue(500, 120)).toBe(SCALE_MAX)
  })
})
